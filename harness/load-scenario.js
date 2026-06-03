#!/usr/bin/env node

/*
 * WebSocket load harness for the single-room streamer-vs-viewers game.
 *
 * This script is intentionally small and dependency-light, but it expects a
 * WebSocket implementation to be available. In Node 22+, global WebSocket is
 * available. For older Node versions, install `ws` and adapt the import below.
 *
 * Usage:
 *   node harness/load-scenario.js --url ws://localhost:8787/ws --viewers 200
 */

const args = parseArgs(process.argv.slice(2));

const url = args.url || "ws://localhost:8787/ws";
const httpUrl = args.httpUrl || url.replace(/^ws/, "http").replace(/\/ws$/, "");
const viewers = Number(args.viewers || 200);
const password = args.password || "dev-password";
const voteDelayMs = Number(args.voteDelayMs || 250);
const revoteDelayMs = Number(args.revoteDelayMs || 5000);
const timeoutMs = Number(args.timeoutMs || 45000);

if (typeof WebSocket === "undefined") {
  console.error("Global WebSocket is unavailable. Use Node 22+ or install a WebSocket polyfill.");
  process.exit(1);
}

const metrics = {
  connected: 0,
  errors: 0,
  voteSummaries: 0,
  moveCommitted: 0,
  fullSnapshotsDuringVoting: 0,
  timerTicks: 0,
  messagesByType: new Map(),
};

const sockets = [];
let votingTurnActive = false;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const token = await createRoom();
  const streamer = await connect("streamer", "streamer", token);
  sockets.push(streamer);

  const viewerSockets = [];
  for (let i = 0; i < viewers; i += 1) {
    const socket = await connect("viewer", `viewer-${i + 1}`);
    viewerSockets.push(socket);
    sockets.push(socket);
  }

  console.log(`connected=${metrics.connected}`);

  // The implementation should either already be in a viewer turn or expose a
  // deterministic test command. If a test command exists, the server can accept
  // this message only in local/harness mode.
  send(streamer, {
    type: "harness_start_viewer_turn",
    game: "omok",
    turnSeconds: 30,
  });

  await sleep(voteDelayMs);

  for (let i = 0; i < viewerSockets.length; i += 1) {
    send(viewerSockets[i], {
      type: "viewer_vote",
      clientVoteId: `vote-${i + 1}`,
      move: omokMoveFor(i),
    });
  }

  await sleep(revoteDelayMs);

  for (let i = 0; i < Math.floor(viewerSockets.length / 2); i += 1) {
    send(viewerSockets[i], {
      type: "viewer_vote",
      clientVoteId: `revote-${i + 1}`,
      move: { game: "omok", row: 7, col: 7 },
    });
  }

  await sleep(timeoutMs - voteDelayMs - revoteDelayMs);

  closeAll();
  printReport();

  if (metrics.connected < viewers + 1) fail("not all sockets connected");
  if (metrics.moveCommitted < 1) fail("no move_committed message received");
  if (metrics.timerTicks > 0) fail("server sent timer ticks");
  if (metrics.fullSnapshotsDuringVoting > 0) fail("full snapshots were broadcast during voting");

  const maxExpectedVoteSummaryMessages = viewers * 8;
  if (metrics.voteSummaries > maxExpectedVoteSummaryMessages) {
    fail(`too many vote summaries: ${metrics.voteSummaries} > ${maxExpectedVoteSummaryMessages}`);
  }
}

async function createRoom() {
  const response = await fetch(`${httpUrl}/api/room/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      password,
      game: "omok",
      streamerSeconds: 30,
      viewerSeconds: 30,
    }),
  });
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(`room create failed: ${payload.code || response.status}`);
  }
  return payload.streamerToken;
}

function connect(role, nickname, token = "") {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error(`connect timeout: ${nickname}`)), 10000);

    socket.addEventListener("open", () => {
      clearTimeout(timer);
      metrics.connected += 1;
      send(socket, { type: "join", role, nickname, token });
      resolve(socket);
    });

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }

      countType(message.type);

      if (message.type === "turn_started" && message.side === "viewers") {
        votingTurnActive = true;
      }

      if (message.type === "move_committed") {
        votingTurnActive = false;
        metrics.moveCommitted += 1;
      }

      if (message.type === "vote_summary") {
        metrics.voteSummaries += 1;
      }

      if (message.type === "room_snapshot" && votingTurnActive) {
        metrics.fullSnapshotsDuringVoting += 1;
      }

      if (message.type === "timer_tick") {
        metrics.timerTicks += 1;
      }
    });

    socket.addEventListener("error", () => {
      metrics.errors += 1;
    });
  });
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function omokMoveFor(index) {
  if (index < 80) return { game: "omok", row: 7, col: 7 };
  if (index < 130) return { game: "omok", row: 7, col: 8 };
  if (index < 170) return { game: "omok", row: 8, col: 7 };
  return { game: "omok", row: 8 + (index % 3), col: 8 + (index % 4) };
}

function countType(type) {
  metrics.messagesByType.set(type, (metrics.messagesByType.get(type) || 0) + 1);
}

function closeAll() {
  for (const socket of sockets) {
    try {
      socket.close();
    } catch {
      // Ignore close failures while shutting down the harness.
    }
  }
}

function printReport() {
  console.log("harness report");
  console.log(`connected=${metrics.connected}`);
  console.log(`errors=${metrics.errors}`);
  console.log(`voteSummaries=${metrics.voteSummaries}`);
  console.log(`moveCommitted=${metrics.moveCommitted}`);
  console.log(`fullSnapshotsDuringVoting=${metrics.fullSnapshotsDuringVoting}`);
  console.log(`timerTicks=${metrics.timerTicks}`);
  console.log("messagesByType=");
  for (const [type, count] of metrics.messagesByType.entries()) {
    console.log(`  ${type}: ${count}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    parsed[key] = value;
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}
