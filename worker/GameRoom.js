import { createInitialGameState, applyGameMove, isLegalGameMove } from "../src/shared/gameRules.js";
import { createOmokState } from "../src/shared/omok.js";
import { clearVote, createVoteState, recordVote, summarizeVotes, winningVote } from "../src/shared/votes.js";
import { roomConfig } from "./config.js";

const DEFAULT_STREAMER_SECONDS = 30;
const DEFAULT_VIEWER_SECONDS = 30;

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.config = roomConfig(env);
    this.room = emptyRoom();
    this.sockets = new Map();
    this.turnTimer = null;
    this.voteBroadcastTimer = null;
    this.viewerCountBroadcastTimer = null;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/room/create" && request.method === "POST") {
      return this.createRoom(request);
    }

    if (url.pathname === "/api/room/reset" && request.method === "POST") {
      return this.resetRoom(request);
    }

    if (url.pathname === "/api/room/reconfigure" && request.method === "POST") {
      return this.reconfigureRoom(request);
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      return this.handleWebSocket();
    }

    return new Response("Not found", { status: 404 });
  }

  async createRoom(request) {
    const body = await safeJson(request);
    const password = body.password || "";

    if (!this.env.ROOM_ADMIN_PASSWORD) {
      return Response.json({ ok: false, code: "missing_admin_secret" }, { status: 500 });
    }

    if (password !== this.env.ROOM_ADMIN_PASSWORD) {
      return Response.json({ ok: false, code: "wrong_password" }, { status: 401 });
    }

    const game = isSupportedGame(body.game) ? body.game : "omok";
    const streamerSeconds = clampSeconds(body.streamerSeconds || DEFAULT_STREAMER_SECONDS);
    const viewerSeconds = clampSeconds(body.viewerSeconds || DEFAULT_VIEWER_SECONDS);
    const streamerToken = crypto.randomUUID();

    this.clearTimers();
    this.room = {
      active: true,
      game,
      streamerToken,
      streamerSeconds,
      viewerSeconds,
      gameState: createInitialGameState(game),
      turn: null,
      votes: createVoteState(),
      viewers: new Set(),
      streamerSocketId: null,
      createdAt: Date.now(),
      moveLog: [],
    };
    this.startTurn("streamer");

    return Response.json({ ok: true, streamerToken, state: this.publicState() });
  }

  async resetRoom(request) {
    const body = await safeJson(request);
    if (!body.token || body.token !== this.room.streamerToken) {
      return Response.json({ ok: false, code: "unauthorized" }, { status: 403 });
    }

    this.clearTimers();
    this.room = emptyRoom();
    this.broadcast({ type: "room_snapshot", state: this.publicState() });
    return Response.json({ ok: true });
  }

  async reconfigureRoom(request) {
    const body = await safeJson(request);
    if (!body.token || body.token !== this.room.streamerToken) {
      return Response.json({ ok: false, code: "unauthorized" }, { status: 403 });
    }

    const game = isSupportedGame(body.game) ? body.game : this.room.game;
    const streamerSeconds = clampSeconds(body.streamerSeconds || this.room.streamerSeconds);
    const viewerSeconds = clampSeconds(body.viewerSeconds || this.room.viewerSeconds);

    this.clearTimers();
    this.room.game = game;
    this.room.streamerSeconds = streamerSeconds;
    this.room.viewerSeconds = viewerSeconds;
    this.room.gameState = createInitialGameState(game);
    this.room.turn = null;
    this.room.votes = createVoteState();
    this.room.moveLog = [];
    this.room.createdAt = Date.now();

    this.broadcast({ type: "room_snapshot", state: this.publicState() });
    this.startTurn("streamer");
    return Response.json({ ok: true, state: this.publicState() });
  }

  handleWebSocket() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const socketId = crypto.randomUUID();

    server.accept();
    this.sockets.set(socketId, {
      id: socketId,
      socket: server,
      role: "viewer",
      nickname: "",
      lastVoteAt: 0,
    });

    server.addEventListener("message", (event) => this.onMessage(socketId, event));
    server.addEventListener("close", () => this.disconnect(socketId));
    server.addEventListener("error", () => this.disconnect(socketId));

    this.send(socketId, { type: "room_snapshot", state: this.publicState() });
    return new Response(null, { status: 101, webSocket: client });
  }

  onMessage(socketId, event) {
    const message = parseJson(event.data);
    const client = this.sockets.get(socketId);
    if (!message || !client) return;

    if (message.type === "join") {
      this.join(socketId, message);
      return;
    }

    if (message.type === "ping") {
      this.send(socketId, { type: "pong", t: message.t, serverNow: Date.now() });
      return;
    }

    if (!this.room.active) {
      this.send(socketId, { type: "error", code: "no_room", message: "No active room exists." });
      return;
    }

    if (message.type === "streamer_move") {
      this.handleStreamerMove(socketId, message);
      return;
    }

    if (message.type === "viewer_vote") {
      this.handleViewerVote(socketId, message);
      return;
    }

    if (message.type === "viewer_clear_vote") {
      this.handleViewerClearVote(socketId);
      return;
    }

    if (message.type === "reset_room") {
      this.handleSocketReset(socketId, message);
      return;
    }

    if (message.type === "reconfigure_room") {
      this.handleSocketReconfigure(socketId, message);
      return;
    }

    if (message.type === "harness_start_viewer_turn" && this.config.harnessMode) {
      this.startTurn("viewers", message.turnSeconds);
    }
  }

  join(socketId, message) {
    const client = this.sockets.get(socketId);
    client.nickname = sanitizeNickname(message.nickname);

    if (message.role === "streamer") {
      if (this.room.active && message.token && message.token === this.room.streamerToken) {
        client.role = "streamer";
        this.room.streamerSocketId = socketId;
      } else if (this.config.harnessMode) {
        client.role = "streamer";
        this.room.streamerSocketId = socketId;
        if (!this.room.active) {
          this.room = {
            ...emptyRoom(),
            active: true,
            game: "omok",
            streamerToken: "harness",
            streamerSeconds: 30,
            viewerSeconds: 30,
            gameState: createOmokState(),
          };
          this.startTurn("streamer");
        }
      } else {
        this.send(socketId, { type: "error", code: "unauthorized", message: "Streamer token is invalid." });
      }
    } else {
      if (this.room.viewers.size >= this.config.maxViewers) {
        this.send(socketId, { type: "error", code: "room_full", message: "Viewer cap reached." });
        return;
      }
      client.role = "viewer";
      this.room.viewers.add(socketId);
    }

    this.send(socketId, { type: "room_snapshot", state: this.publicState() });
    this.scheduleViewerCountBroadcast();
  }

  handleStreamerMove(socketId, message) {
    const client = this.sockets.get(socketId);
    if (client?.role !== "streamer" || this.room.streamerSocketId !== socketId) {
      this.send(socketId, { type: "error", code: "unauthorized", message: "Streamer only." });
      return;
    }

    if (this.room.turn?.side !== "streamer") {
      this.send(socketId, { type: "error", code: "wrong_turn", message: "It is not the streamer turn." });
      return;
    }

    this.commitMove(message.move, "streamer");
  }

  handleViewerVote(socketId, message) {
    const client = this.sockets.get(socketId);
    const now = Date.now();

    if (client?.role !== "viewer" || this.room.turn?.side !== "viewers") return;
    if (now - client.lastVoteAt < 300) return;
    client.lastVoteAt = now;
    if (!isLegalGameMove(this.room.gameState, message.move)) return;

    recordVote(this.room.votes, socketId, message.move, now);
    this.send(socketId, {
      type: "vote_summary",
      turnId: this.room.turn.id,
      ...summarizeVotes(this.room.votes, this.config.topVoteCandidates),
    });
    this.scheduleVoteBroadcast();
  }

  handleViewerClearVote(socketId) {
    if (this.room.turn?.side !== "viewers") return;
    clearVote(this.room.votes, socketId);
    this.scheduleVoteBroadcast();
  }

  handleSocketReset(socketId, message) {
    const client = this.sockets.get(socketId);
    if (client?.role !== "streamer" || message.token !== this.room.streamerToken) return;
    this.clearTimers();
    this.room = emptyRoom();
    this.broadcast({ type: "room_snapshot", state: this.publicState() });
  }

  handleSocketReconfigure(socketId, message) {
    const client = this.sockets.get(socketId);
    if (client?.role !== "streamer" || message.token !== this.room.streamerToken) return;
    const game = isSupportedGame(message.game) ? message.game : this.room.game;
    this.clearTimers();
    this.room.game = game;
    this.room.streamerSeconds = clampSeconds(message.streamerSeconds || this.room.streamerSeconds);
    this.room.viewerSeconds = clampSeconds(message.viewerSeconds || this.room.viewerSeconds);
    this.room.gameState = createInitialGameState(game);
    this.room.turn = null;
    this.room.votes = createVoteState();
    this.room.moveLog = [];
    this.broadcast({ type: "room_snapshot", state: this.publicState() });
    this.startTurn("streamer");
  }

  startTurn(side, overrideSeconds) {
    if (!this.room.active) return;

    clearTimeout(this.turnTimer);
    clearTimeout(this.voteBroadcastTimer);
    this.voteBroadcastTimer = null;

    if (side === "viewers") {
      this.room.votes = createVoteState();
    }

    const seconds = Number(overrideSeconds) || (side === "streamer" ? this.room.streamerSeconds : this.room.viewerSeconds);
    const now = Date.now();
    this.room.turn = {
      id: crypto.randomUUID(),
      side,
      startedAt: now,
      endsAt: now + seconds * 1000,
    };

    this.broadcast({ type: "turn_started", turnId: this.room.turn.id, side, endsAt: this.room.turn.endsAt, serverNow: now });

    if (side === "viewers") {
      this.scheduleVoteBroadcast(true);
      this.turnTimer = setTimeout(() => this.finishViewerTurn(this.room.turn.id), seconds * 1000);
    } else {
      this.turnTimer = setTimeout(() => this.startTurn("viewers"), seconds * 1000);
    }
  }

  finishViewerTurn(turnId) {
    if (this.room.turn?.id !== turnId || this.room.turn.side !== "viewers") return;
    const winner = winningVote(this.room.votes);
    if (winner && isLegalGameMove(this.room.gameState, winner.move)) {
      this.commitMove(winner.move, "viewers");
      return;
    }
    this.startTurn("streamer");
  }

  commitMove(move, by) {
    if (!isLegalGameMove(this.room.gameState, move)) {
      return false;
    }

    const result = applyGameMove(this.room.gameState, move);
    if (!result.ok) return false;

    this.room.gameState = result.state;
    this.room.moveLog.push({ move, by, at: Date.now() });
    this.broadcast({ type: "move_committed", move, state: this.publicState() });

    if (this.room.gameState.winner) {
      clearTimeout(this.turnTimer);
      this.room.turn = null;
      return true;
    }

    this.startTurn(by === "streamer" ? "viewers" : "streamer");
    return true;
  }

  scheduleVoteBroadcast(immediate = false) {
    if (this.voteBroadcastTimer) return;
    const delay = immediate ? 0 : this.config.voteBroadcastIntervalMs;
    this.voteBroadcastTimer = setTimeout(() => {
      this.voteBroadcastTimer = null;
      if (this.room.turn?.side !== "viewers") return;
      this.broadcast({
        type: "vote_summary",
        turnId: this.room.turn.id,
        ...summarizeVotes(this.room.votes, this.config.topVoteCandidates),
      });
      this.scheduleVoteBroadcast();
    }, delay);
  }

  disconnect(socketId) {
    const client = this.sockets.get(socketId);
    if (!client) return;
    this.sockets.delete(socketId);
    this.room.viewers.delete(socketId);
    if (this.room.streamerSocketId === socketId) {
      this.room.streamerSocketId = null;
    }
    this.scheduleViewerCountBroadcast();
  }

  publicState() {
    return {
      active: this.room.active,
      game: this.room.game,
      streamerSeconds: this.room.streamerSeconds,
      viewerSeconds: this.room.viewerSeconds,
      gameState: this.room.gameState,
      turn: this.room.turn,
      viewerCount: this.room.viewers.size,
      moveLogLength: this.room.moveLog.length,
      conservation: {
        maxViewers: this.config.maxViewers,
        voteBroadcastIntervalMs: this.config.voteBroadcastIntervalMs,
        topVoteCandidates: this.config.topVoteCandidates,
      },
    };
  }

  broadcastViewerCount() {
    this.broadcast({ type: "viewer_count", count: this.room.viewers.size });
  }

  scheduleViewerCountBroadcast() {
    if (this.viewerCountBroadcastTimer) return;
    this.viewerCountBroadcastTimer = setTimeout(() => {
      this.viewerCountBroadcastTimer = null;
      this.broadcastViewerCount();
    }, 1000);
  }

  broadcast(message) {
    const text = JSON.stringify(message);
    for (const [socketId, client] of this.sockets.entries()) {
      try {
        client.socket.send(text);
      } catch {
        this.disconnect(socketId);
      }
    }
  }

  send(socketId, message) {
    const client = this.sockets.get(socketId);
    if (!client) return;
    try {
      client.socket.send(JSON.stringify(message));
    } catch {
      this.disconnect(socketId);
    }
  }

  clearTimers() {
    clearTimeout(this.turnTimer);
    clearTimeout(this.voteBroadcastTimer);
    clearTimeout(this.viewerCountBroadcastTimer);
    this.turnTimer = null;
    this.voteBroadcastTimer = null;
    this.viewerCountBroadcastTimer = null;
  }
}

function emptyRoom() {
  return {
    active: false,
    game: "omok",
    streamerToken: null,
    streamerSeconds: DEFAULT_STREAMER_SECONDS,
    viewerSeconds: DEFAULT_VIEWER_SECONDS,
    gameState: createOmokState(),
    turn: null,
    votes: createVoteState(),
    viewers: new Set(),
    streamerSocketId: null,
    createdAt: null,
    moveLog: [],
  };
}

function isSupportedGame(game) {
  return ["omok", "baduk", "janggi", "chess"].includes(game);
}

function clampSeconds(value) {
  const seconds = Number(value);
  if (![5, 10, 15, 20, 25, 30].includes(seconds)) return 30;
  return seconds;
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function parseJson(data) {
  try {
    return JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
  } catch {
    return null;
  }
}

function sanitizeNickname(value) {
  return String(value || "").slice(0, 32);
}
