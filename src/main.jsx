import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { isLegalChessMove } from "./shared/chessGame.js";
import { isLegalJanggiMove } from "./shared/janggi.js";
import { createMoveAudio } from "./sound/moveAudio.js";
import "./styles.css";

const games = [
  { id: "omok", label: "오목" },
  { id: "baduk", label: "바둑" },
  { id: "janggi", label: "장기" },
  { id: "chess", label: "체스" },
];

const timeOptions = [5, 10, 15, 20, 25, 30];

function readableError(message) {
  if (message.code === "no_room") return "현재 열린 방이 없습니다.";
  if (message.code === "rate_limited") return "요청이 너무 빠릅니다. 잠시 후 다시 시도해주세요.";
  if (message.code === "too_many_viewers_per_ip") return "같은 IP에서는 최대 2명까지만 참여할 수 있습니다.";
  if (message.code === "chzzk_login_required") return "치지직 로그인 후 방을 만들 수 있습니다.";
  return message.message || message.code || "요청을 처리하지 못했습니다.";
}

function App() {
  const [mode, setMode] = useState("join");
  const [role, setRole] = useState(null);
  const [nickname, setNickname] = useState("");
  const [game, setGame] = useState("omok");
  const [streamerSeconds, setStreamerSeconds] = useState(30);
  const [viewerSeconds, setViewerSeconds] = useState(30);
  const [auth, setAuth] = useState({ loading: true, authenticated: false, user: null });
  const [token, setToken] = useState("");
  const [socketStatus, setSocketStatus] = useState("idle");
  const [state, setState] = useState(null);
  const [voteSummary, setVoteSummary] = useState({ totalVotes: 0, top: [] });
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(localStorage.getItem("muted") === "true");
  const [setupOpen, setSetupOpen] = useState(false);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [busyAction, setBusyAction] = useState("");
  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const pendingRoleRef = useRef(null);
  const lastActionAtRef = useRef({ create: 0, join: 0 });

  useEffect(() => {
    audioRef.current = createMoveAudio();
  }, []);

  useEffect(() => {
    localStorage.setItem("muted", String(muted));
  }, [muted]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((payload) => setAuth({ loading: false, authenticated: Boolean(payload.authenticated), user: payload.user || null }))
      .catch(() => setAuth({ loading: false, authenticated: false, user: null }));

    const params = new URLSearchParams(location.search);
    const authError = params.get("authError");
    if (authError) {
      setError(authError === "not_enough_followers" ? "팔로워 기준을 충족한 치지직 채널만 방을 만들 수 있습니다." : "치지직 로그인에 실패했습니다.");
      history.replaceState(null, "", location.pathname);
    }
  }, []);

  const connect = useCallback(
    (nextRole, nextToken = token) => {
      socketRef.current?.close();
      pendingRoleRef.current = nextRole;
      setSocketStatus("connecting");
      setError("");
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${protocol}://${location.host}/ws`);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setSocketStatus("connected");
        socket.send(JSON.stringify({ type: "join", role: nextRole, token: nextToken, nickname }));
      });

      socket.addEventListener("close", () => setSocketStatus("closed"));
      socket.addEventListener("error", () => setSocketStatus("error"));
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.state?.serverNow) setServerOffsetMs(message.state.serverNow - Date.now());
        if (message.serverNow) setServerOffsetMs(message.serverNow - Date.now());
        if (message.type === "room_snapshot") {
          setState(message.state);
          if (pendingRoleRef.current && message.state?.active) {
            setRole(pendingRoleRef.current);
            pendingRoleRef.current = null;
          }
        }
        if (message.type === "turn_started") {
          setState((previous) =>
            previous ? { ...previous, turn: { id: message.turnId, side: message.side, endsAt: message.endsAt, serverNow: message.serverNow } } : previous,
          );
          if (message.side !== "viewers") setVoteSummary({ totalVotes: 0, top: [] });
        }
        if (message.type === "move_committed") {
          setState(message.state);
          setVoteSummary({ totalVotes: 0, top: [] });
          if (!muted) audioRef.current?.play(message.state.game);
        }
        if (message.type === "vote_summary") setVoteSummary({ totalVotes: message.totalVotes, top: message.top });
        if (message.type === "viewer_count") {
          setState((previous) => (previous ? { ...previous, viewerCount: message.count } : previous));
        }
        if (message.type === "error") {
          setError(readableError(message));
          if (message.code === "no_room") {
            pendingRoleRef.current = null;
            setRole(null);
            setState(null);
            socket.close();
          }
        }
      });
    },
    [muted, nickname, token],
  );

  const createRoom = async (event) => {
    event.preventDefault();
    if (!auth.authenticated) {
      location.href = "/api/auth/chzzk/start";
      return;
    }
    const now = Date.now();
    if (busyAction || now - lastActionAtRef.current.create < 3000) return;
    lastActionAtRef.current.create = now;
    setBusyAction("create");
    setError("");
    audioRef.current?.unlock();
    const response = await fetch("/api/room/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, streamerSeconds, viewerSeconds }),
    });
    const payload = await response.json();
    if (!payload.ok) {
      setTimeout(() => setBusyAction((current) => (current === "create" ? "" : current)), 1200);
      setError(readableError(payload));
      return;
    }
    setToken(payload.streamerToken);
    setRole("streamer");
    setState(payload.state);
    connect("streamer", payload.streamerToken);
    setTimeout(() => setBusyAction((current) => (current === "create" ? "" : current)), 1200);
  };

  const joinRoom = (event) => {
    event?.preventDefault();
    const now = Date.now();
    if (busyAction || socketStatus === "connecting" || now - lastActionAtRef.current.join < 1500) return;
    lastActionAtRef.current.join = now;
    setBusyAction("join");
    audioRef.current?.unlock();
    connect("viewer", "");
    setTimeout(() => setBusyAction((current) => (current === "join" ? "" : current)), 1500);
  };

  const resetRoom = async () => {
    if (!token) return;
    await fetch("/api/room/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  };

  const startGame = async () => {
    if (!token) return;
    setError("");
    const response = await fetch("/api/room/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const payload = await response.json();
    if (!payload.ok) {
      setError(readableError(payload));
      return;
    }
    setState(payload.state);
    setVoteSummary({ totalVotes: 0, top: [] });
  };

  const reconfigureRoom = async ({ game: nextGame, streamerSeconds: nextStreamerSeconds, viewerSeconds: nextViewerSeconds }) => {
    if (!token) return;
    setError("");
    const response = await fetch("/api/room/reconfigure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        game: nextGame,
        streamerSeconds: nextStreamerSeconds,
        viewerSeconds: nextViewerSeconds,
      }),
    });
    const payload = await response.json();
    if (!payload.ok) {
      setError(payload.code || "설정 변경 실패");
      return;
    }
    setState(payload.state);
    setVoteSummary({ totalVotes: 0, top: [] });
    setSetupOpen(false);
  };

  const sendMove = (move) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !state?.active) return;
    const isStreamerTurn = role === "streamer" && state.turn?.side === "streamer";
    const isViewerTurn = role === "viewer" && state.turn?.side === "viewers";
    if (isStreamerTurn) {
      socket.send(JSON.stringify({ type: "streamer_move", move, clientMoveId: crypto.randomUUID() }));
    }
    if (isViewerTurn) {
      socket.send(JSON.stringify({ type: "viewer_vote", move, clientVoteId: crypto.randomUUID() }));
    }
  };

  if (!role) {
    return (
      <EntryScreen
        mode={mode}
        setMode={setMode}
        nickname={nickname}
        setNickname={setNickname}
        auth={auth}
        game={game}
        setGame={setGame}
        streamerSeconds={streamerSeconds}
        setStreamerSeconds={setStreamerSeconds}
        viewerSeconds={viewerSeconds}
        setViewerSeconds={setViewerSeconds}
        createRoom={createRoom}
        joinRoom={joinRoom}
        busyAction={busyAction}
        error={error}
      />
    );
  }

  return (
    <GameScreen
      role={role}
      state={state}
      socketStatus={socketStatus}
      voteSummary={voteSummary}
      error={error}
      muted={muted}
      setMuted={setMuted}
      onMove={sendMove}
      resetRoom={resetRoom}
      startGame={startGame}
      reconfigureRoom={reconfigureRoom}
      setupOpen={setupOpen}
      setSetupOpen={setSetupOpen}
      serverOffsetMs={serverOffsetMs}
    />
  );
}

function EntryScreen(props) {
  return (
    <main className="entry-shell">
      <section className="entry-panel">
        <img className="title-art" src="/mini-game-title.png" alt="미니게임" />
        <div className="brand-row">
          <div>
            <h1>미니게임 투표방</h1>
            <p>스트리머 한 명과 시청자 다수가 한 수씩 겨룹니다.</p>
          </div>
          <span className="status-pill">Live Room</span>
        </div>

        <div className="mode-tabs">
          <button className={props.mode === "create" ? "active" : ""} onClick={() => props.setMode("create")}>
            방 만들기
          </button>
          <button
            className={props.mode === "join" ? "active" : ""}
            disabled={props.busyAction === "join"}
            onClick={(event) => {
              if (props.mode === "join") {
                props.joinRoom(event);
              } else {
                props.setMode("join");
              }
            }}
          >
            참여하기
          </button>
        </div>

        {props.mode === "create" ? (
          <form onSubmit={props.createRoom} className="entry-form">
            <div className="auth-box">
              {props.auth.loading ? (
                <span>치지직 로그인 확인 중...</span>
              ) : props.auth.authenticated ? (
                <span>
                  {props.auth.user?.channelName || "치지직 채널"} · 팔로워 {props.auth.user?.followerCount || 0}명
                </span>
              ) : (
                <button className="secondary" type="button" onClick={() => (location.href = "/api/auth/chzzk/start")}>
                  치지직 로그인
                </button>
              )}
            </div>
            <fieldset>
              <legend>게임</legend>
              <div className="segmented">
                {games.map((item) => (
                  <button type="button" key={item.id} className={props.game === item.id ? "active" : ""} onClick={() => props.setGame(item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <TimeSelect label="스트리머 제한시간" value={props.streamerSeconds} setValue={props.setStreamerSeconds} />
            <TimeSelect label="시청자 제한시간" value={props.viewerSeconds} setValue={props.setViewerSeconds} />
            <button className="primary" type="submit" disabled={props.busyAction === "create" || props.auth.loading}>
              {props.auth.authenticated ? "방 생성" : "치지직 로그인 후 방 생성"}
            </button>
          </form>
        ) : (
          <form onSubmit={props.joinRoom} className="entry-form join-form">
            <label>
              닉네임
              <input value={props.nickname} onChange={(event) => props.setNickname(event.target.value)} placeholder="선택 사항" />
            </label>
          </form>
        )}
        {props.error && <p className="error-line">{props.error}</p>}
      </section>
    </main>
  );
}

function TimeSelect({ label, value, setValue }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => setValue(Number(event.target.value))}>
        {timeOptions.map((seconds) => (
          <option key={seconds} value={seconds}>
            {seconds}초
          </option>
        ))}
      </select>
    </label>
  );
}

function GameScreen({ role, state, socketStatus, voteSummary, error, muted, setMuted, onMove, resetRoom, startGame, reconfigureRoom, setupOpen, setSetupOpen, serverOffsetMs }) {
  const countdown = useCountdown(state?.turn, serverOffsetMs);
  const game = state?.game || "omok";
  const winnerText = victoryText(game, state?.gameState?.winner);
  const canStartGame = role === "streamer" && state?.active && state?.phase !== "playing";
  const [dismissedWinner, setDismissedWinner] = useState("");
  const [pipMessage, setPipMessage] = useState("");
  const pipWindowRef = useRef(null);
  const pipRootRef = useRef(null);
  const pipContainerRef = useRef(null);

  useEffect(() => {
    setDismissedWinner("");
  }, [winnerText]);

  const closeBoardPip = useCallback(() => {
    pipRootRef.current?.unmount();
    pipRootRef.current = null;
    pipContainerRef.current = null;
    const pipWindow = pipWindowRef.current;
    pipWindowRef.current = null;
    if (pipWindow && !pipWindow.closed) pipWindow.close();
  }, []);

  useEffect(() => closeBoardPip, [closeBoardPip]);

  useEffect(() => {
    const pipWindow = pipWindowRef.current;
    const pipRoot = pipRootRef.current;
    if (!pipWindow || pipWindow.closed || !pipRoot) return;
    pipWindow.document.body.className = `pip-body theme-${game}`;
    pipRoot.render(
      <BoardPipContent
        game={game}
        state={state}
        voteSummary={voteSummary}
        role={role}
        countdown={countdown}
        onMove={onMove}
      />,
    );
  }, [countdown, game, onMove, role, state, voteSummary]);

  const openBoardPip = useCallback(async () => {
    setPipMessage("");
    if (!("documentPictureInPicture" in window)) {
      setPipMessage("Chrome / Edge 최신 버전에서만 PiP 게임판을 사용할 수 있습니다.");
      return;
    }
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.focus();
      return;
    }

    try {
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: Math.min(760, Math.max(420, Math.round(window.innerWidth * 0.42))),
        height: Math.min(820, Math.max(520, Math.round(window.innerHeight * 0.72))),
      });
      copyStylesToPip(pipWindow.document);
      pipWindow.document.title = "Game Board PiP";
      pipWindow.document.body.className = `pip-body theme-${game}`;
      const container = pipWindow.document.createElement("div");
      container.id = "pip-root";
      pipWindow.document.body.append(container);
      pipWindow.addEventListener("pagehide", () => {
        pipRootRef.current?.unmount();
        pipRootRef.current = null;
        pipContainerRef.current = null;
        pipWindowRef.current = null;
      });
      pipWindow.addEventListener("resize", () => {
        pipWindow.document.documentElement.style.setProperty("--pip-width", `${pipWindow.innerWidth}px`);
        pipWindow.document.documentElement.style.setProperty("--pip-height", `${pipWindow.innerHeight}px`);
      });
      pipWindow.document.documentElement.style.setProperty("--pip-width", `${pipWindow.innerWidth}px`);
      pipWindow.document.documentElement.style.setProperty("--pip-height", `${pipWindow.innerHeight}px`);
      pipWindowRef.current = pipWindow;
      pipContainerRef.current = container;
      pipRootRef.current = createRoot(container);
      pipRootRef.current.render(
        <BoardPipContent
          game={game}
          state={state}
          voteSummary={voteSummary}
          role={role}
          countdown={countdown}
          onMove={onMove}
        />,
      );
    } catch (pipError) {
      if (pipError?.name !== "AbortError") {
        setPipMessage("PiP 게임판을 열지 못했습니다. 브라우저 권한이나 창 차단 설정을 확인해 주세요.");
      }
    }
  }, [countdown, game, onMove, role, state, voteSummary]);

  return (
    <main className={`game-shell theme-${game}`}>
      <header className="topbar">
        <div>
          <strong>{labelForGame(game)}</strong>
          <span>{role === "streamer" ? "스트리머" : "시청자"}</span>
        </div>
        <div className="topbar-actions">
          <span className="metric">{socketStatus}</span>
          <span className="metric">시청자 {state?.viewerCount || 0}</span>
          <span className="metric">
            {turnStatusText(state, countdown)}
          </span>
          <button className="icon-button" title="효과음" onClick={() => setMuted(!muted)}>
            {muted ? "음소거" : "소리"}
          </button>
          <button className="secondary" onClick={openBoardPip}>
            PiP
          </button>
          {role === "streamer" && (
            <button className="secondary" onClick={() => setSetupOpen(true)}>
              게임 설정
            </button>
          )}
          {role === "streamer" && (
            <button className="primary" onClick={startGame} disabled={!canStartGame}>
              게임 시작
            </button>
          )}
        </div>
      </header>

      <section className="game-layout">
        <div className="center-stage">
          <Board game={game} state={state?.gameState} voteSummary={voteSummary} role={role} turn={state?.turn} onMove={onMove} />
          <TurnClockBar game={game} turn={state?.turn} countdown={countdown} streamerSeconds={state?.streamerSeconds || 30} viewerSeconds={state?.viewerSeconds || 30} />
        </div>
        <aside className="side-panel">
          <h2>투표 현황</h2>
          <VoteList voteSummary={voteSummary} />
          {state?.phase === "waiting" && <p className="notice">게임 시작 대기 중입니다.</p>}
          {state?.phase === "ended" && <p className="notice">게임이 종료되었습니다. 게임 시작을 누르면 같은 설정으로 다시 시작합니다.</p>}
          {state?.gameState?.winner && <p className="winner">{sideLabel(state.gameState.winner)} 승리</p>}
          {state?.gameState?.isCheck && <p className="notice">체크 상태입니다.</p>}
          {state?.gameState?.isDraw && <p className="notice">무승부 상태입니다.</p>}
          {error && <p className="error-line">{error}</p>}
          {pipMessage && <p className="notice">{pipMessage}</p>}
        </aside>
      </section>
      {setupOpen && (
        <RoomSetupModal
          state={state}
          onClose={() => setSetupOpen(false)}
          onSubmit={reconfigureRoom}
        />
      )}
      {winnerText && dismissedWinner !== winnerText && <VictoryOverlay text={winnerText} onDismiss={() => setDismissedWinner(winnerText)} />}
    </main>
  );
}

function copyStylesToPip(targetDocument) {
  for (const sheet of document.querySelectorAll('link[rel="stylesheet"], style')) {
    targetDocument.head.append(sheet.cloneNode(true));
  }
}

function BoardPipContent({ game, state, voteSummary, role, countdown, onMove }) {
  return (
    <main className={`pip-shell theme-${game}`}>
      <Board game={game} state={state?.gameState} voteSummary={voteSummary} role={role} turn={state?.turn} onMove={onMove} />
      <TurnClockBar game={game} turn={state?.turn} countdown={countdown} streamerSeconds={state?.streamerSeconds || 30} viewerSeconds={state?.viewerSeconds || 30} />
    </main>
  );
}

function VictoryOverlay({ text, onDismiss }) {
  return (
    <button className="victory-overlay" type="button" aria-live="polite" onClick={onDismiss}>
      <div className="victory-bubble">
        <span>승리</span>
        <strong>{text}</strong>
      </div>
    </button>
  );
}

function RoomSetupModal({ state, onClose, onSubmit }) {
  const [nextGame, setNextGame] = useState(state?.game || "omok");
  const [nextStreamerSeconds, setNextStreamerSeconds] = useState(state?.streamerSeconds || 30);
  const [nextViewerSeconds, setNextViewerSeconds] = useState(state?.viewerSeconds || 30);

  const submit = (event) => {
    event.preventDefault();
    onSubmit({ game: nextGame, streamerSeconds: nextStreamerSeconds, viewerSeconds: nextViewerSeconds });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="setup-modal" onSubmit={submit}>
        <div className="modal-title-row">
          <h2>게임 설정</h2>
          <button type="button" className="icon-button" onClick={onClose} title="닫기">
            닫기
          </button>
        </div>
        <fieldset>
          <legend>게임 종류</legend>
          <div className="segmented">
            {games.map((item) => (
              <button type="button" key={item.id} className={nextGame === item.id ? "active" : ""} onClick={() => setNextGame(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
        <TimeSelect label="스트리머 제한시간" value={nextStreamerSeconds} setValue={setNextStreamerSeconds} />
        <TimeSelect label="시청자 제한시간" value={nextViewerSeconds} setValue={setNextViewerSeconds} />
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            취소
          </button>
          <button className="primary" type="submit">
            설정 적용
          </button>
        </div>
      </form>
    </div>
  );
}

function TurnClockBar({ game, turn, countdown, streamerSeconds, viewerSeconds }) {
  const streamerActive = turn?.side === "streamer";
  const viewerActive = turn?.side === "viewers";
  const teams = clockTeams(game);
  return (
    <div className="turn-clock-bar">
      <div className={`turn-clock streamer ${streamerActive ? "active" : ""}`}>
        <span className={`turn-icon ${teams.streamerClass}`}>{teams.streamerMark}</span>
        <div>
          <strong>스트리머 · {teams.streamerName}</strong>
          <span>{streamerActive ? `${countdown}초` : `${streamerSeconds}초`}</span>
        </div>
      </div>
      <div className={`turn-clock viewers ${viewerActive ? "active" : ""}`}>
        <div>
          <strong>시청자 · {teams.viewerName}</strong>
          <span>{viewerActive ? `${countdown}초` : `${viewerSeconds}초`}</span>
        </div>
        <span className={`turn-icon ${teams.viewerClass}`}>{teams.viewerMark}</span>
      </div>
    </div>
  );
}

function clockTeams(game) {
  if (game === "janggi") {
    return {
      streamerMark: "청",
      streamerName: "청팀",
      streamerClass: "blue-team",
      viewerMark: "적",
      viewerName: "적팀",
      viewerClass: "red-team",
    };
  }
  if (game === "chess") {
    return {
      streamerMark: "♔",
      streamerName: "백",
      streamerClass: "white-team",
      viewerMark: "♚",
      viewerName: "흑",
      viewerClass: "black-team",
    };
  }
  return {
    streamerMark: "흑",
    streamerName: "흑",
    streamerClass: "black-team",
    viewerMark: "백",
    viewerName: "백",
    viewerClass: "white-team",
  };
}

function Board({ game, state, voteSummary, role, turn, onMove }) {
  const [selected, setSelected] = useState(null);
  const size = boardSize(game);
  const overlays = useMemo(() => {
    const map = new Map();
    for (const item of voteSummary.top || []) {
      const key = item.move.to ? `${item.move.to.row}:${item.move.to.col}` : `${item.move.row}:${item.move.col}`;
      map.set(key, item);
    }
    return map;
  }, [voteSummary]);

  useEffect(() => {
    setSelected(null);
  }, [game, state?.moveNumber, turn?.id]);

  const legalDestinations = useMemo(() => moveDestinations(game, state, selected), [game, state, selected]);

  if (game === "omok" || game === "baduk") {
    return <IntersectionBoard game={game} state={state} voteSummary={voteSummary} role={role} turn={turn} onMove={onMove} />;
  }

  if (game === "janggi") {
    return <JanggiBoard state={state} voteSummary={voteSummary} role={role} turn={turn} onMove={onMove} selected={selected} setSelected={setSelected} overlays={overlays} />;
  }

  const handleCell = (row, col) => {
    const piece = state?.board?.[row]?.[col];
    const currentSide = state?.nextSide || "black";
    if (selected?.row === row && selected?.col === col) {
      setSelected(null);
      return;
    }
    if (piece?.side === currentSide) {
      setSelected({ row, col });
      return;
    }
    if (selected && legalDestinations.has(`${row}:${col}`)) {
      onMove({ game, from: selected, to: { row, col }, promotion: "q" });
      setSelected(null);
      return;
    }
    if (piece) setSelected({ row, col });
  };

  return (
    <div className={`board-wrap ${game}`}>
      <div className={`board ${game}`} style={{ "--cols": size.cols, "--rows": size.rows }}>
        {Array.from({ length: size.rows }).map((_, row) =>
          Array.from({ length: size.cols }).map((_, col) => {
            const piece = state?.board?.[row]?.[col] || null;
            const vote = overlays.get(`${row}:${col}`);
            const last = lastMoveAt(state?.lastMove, row, col);
            const isSelected = selected?.row === row && selected?.col === col;
            const isDestination = legalDestinations.has(`${row}:${col}`);
            const hasVote = Boolean(vote && turn?.side === "viewers");
            return (
              <button
                key={`${row}-${col}`}
                className={`cell ${cellShade(game, row, col)} ${last ? "last" : ""} ${hasVote ? "voted" : ""} ${isSelected ? "selected" : ""} ${isDestination ? "legal-destination" : ""} ${isDestination && piece ? "capture-destination" : ""}`}
                onClick={() => handleCell(row, col)}
                title={`${row + 1}, ${col + 1}`}
              >
                {piece && <Piece game={game} piece={piece} row={row} col={col} />}
                {hasVote && <span className="vote-badge">{vote.percent}%</span>}
              </button>
            );
          }),
        )}
        {game === "janggi" && <div className="palace top" />}
        {game === "janggi" && <div className="palace bottom" />}
      </div>
      <div className="turn-help">{role === "streamer" ? "마우스로 착수" : game === "omok" || game === "baduk" ? "마우스로 투표" : "말을 고른 뒤 목적지를 투표"}</div>
    </div>
  );
}

const janggiViewBox = { minX: -0.55, minY: -0.55, width: 9.1, height: 10.1 };

function JanggiBoard({ state, role, turn, onMove, selected, setSelected, overlays }) {
  const legalDestinations = useMemo(() => moveDestinations("janggi", state, selected), [state, selected]);

  const handlePoint = (row, col) => {
    const piece = state?.board?.[row]?.[col];
    const currentSide = state?.nextSide || "black";
    if (selected?.row === row && selected?.col === col) {
      setSelected(null);
      return;
    }
    if (piece?.side === currentSide) {
      setSelected({ row, col });
      return;
    }
    if (selected && legalDestinations.has(`${row}:${col}`)) {
      onMove({ game: "janggi", from: selected, to: { row, col } });
      setSelected(null);
      return;
    }
    if (piece) setSelected({ row, col });
  };

  return (
    <div className="board-wrap janggi">
      <div className="board janggi-board">
        <svg className="janggi-canvas" viewBox={`${janggiViewBox.minX} ${janggiViewBox.minY} ${janggiViewBox.width} ${janggiViewBox.height}`} aria-hidden="true">
          {Array.from({ length: 9 }).map((_, col) => (
            <line key={`v-${col}`} x1={col} y1={0} x2={col} y2={9} />
          ))}
          {Array.from({ length: 10 }).map((_, row) => (
            <line key={`h-${row}`} x1={0} y1={row} x2={8} y2={row} />
          ))}
          <JanggiPalace topRow={0} />
          <JanggiPalace topRow={7} />
        </svg>

        {Array.from({ length: 10 }).map((_, row) =>
          Array.from({ length: 9 }).map((_, col) => {
            const piece = state?.board?.[row]?.[col] || null;
            const vote = overlays.get(`${row}:${col}`);
            const last = lastMoveAt(state?.lastMove, row, col);
            const isSelected = selected?.row === row && selected?.col === col;
            const isDestination = legalDestinations.has(`${row}:${col}`);
            const hasVote = Boolean(vote && turn?.side === "viewers");
            return (
              <button
                key={`${row}-${col}`}
                className={`janggi-point ${last ? "last" : ""} ${hasVote ? "voted" : ""} ${isSelected ? "selected" : ""} ${isDestination ? "legal-destination" : ""} ${isDestination && piece ? "capture-destination" : ""}`}
                style={janggiPointStyle(row, col)}
                onClick={() => handlePoint(row, col)}
                title={`${row + 1}, ${col + 1}`}
              >
                {piece && <Piece game="janggi" piece={piece} />}
                {hasVote && <span className="vote-badge">{vote.percent}%</span>}
              </button>
            );
          }),
        )}
      </div>
      <div className="turn-help">{role === "streamer" ? "마우스로 착수" : "말을 고른 뒤 목적지를 투표"}</div>
    </div>
  );
}

function JanggiPalace({ topRow }) {
  return (
    <>
      <line className="palace-line" x1={3} y1={topRow} x2={5} y2={topRow + 2} />
      <line className="palace-line" x1={5} y1={topRow} x2={3} y2={topRow + 2} />
    </>
  );
}

function janggiPointStyle(row, col) {
  return {
    left: `${((col - janggiViewBox.minX) / janggiViewBox.width) * 100}%`,
    top: `${((row - janggiViewBox.minY) / janggiViewBox.height) * 100}%`,
  };
}

function moveDestinations(game, state, selected) {
  if (!selected || !state?.board) return new Set();
  const size = boardSize(game);
  const legal = new Set();
  const isLegal = game === "janggi" ? isLegalJanggiMove : game === "chess" ? isLegalChessMove : null;
  if (!isLegal) return legal;

  for (let row = 0; row < size.rows; row += 1) {
    for (let col = 0; col < size.cols; col += 1) {
      if (selected.row === row && selected.col === col) continue;
      if (isLegal(state, { game, from: selected, to: { row, col }, promotion: "q" })) {
        legal.add(`${row}:${col}`);
      }
    }
  }
  return legal;
}

function IntersectionBoard({ game, state, voteSummary, role, turn, onMove }) {
  const size = boardSize(game);
  const pad = game === "baduk" ? 5 : 6;
  const interval = (100 - pad * 2) / (size.cols - 1);
  const pointSize = interval * (game === "baduk" ? 0.86 : 0.9);
  const overlays = useMemo(() => {
    const map = new Map();
    for (const item of voteSummary.top || []) {
      map.set(`${item.move.row}:${item.move.col}`, item);
    }
    return map;
  }, [voteSummary]);

  return (
    <div className={`board-wrap ${game}`}>
      <div className={`board intersection-board ${game}`}>
        <svg className="board-lines" viewBox="0 0 100 100" aria-hidden="true">
          {Array.from({ length: size.cols }).map((_, col) => {
            const x = pad + col * interval;
            return <line key={`v-${col}`} x1={x} y1={pad} x2={x} y2={100 - pad} />;
          })}
          {Array.from({ length: size.rows }).map((_, row) => {
            const y = pad + row * interval;
            return <line key={`h-${row}`} x1={pad} y1={y} x2={100 - pad} y2={y} />;
          })}
          {starPoints(size.rows, size.cols).map(([row, col]) => (
            <circle key={`${row}-${col}`} className="hoshi" cx={pad + col * interval} cy={pad + row * interval} r={game === "baduk" ? 0.55 : 0.48} />
          ))}
        </svg>

        {Array.from({ length: size.rows }).map((_, row) =>
          Array.from({ length: size.cols }).map((_, col) => {
            const piece = state?.board?.[row]?.[col] || null;
            const vote = overlays.get(`${row}:${col}`);
            const last = lastMoveAt(state?.lastMove, row, col);
            const hasVote = Boolean(vote && turn?.side === "viewers");
            return (
              <button
                key={`${row}-${col}`}
                className={`point-cell ${last ? "last" : ""} ${hasVote ? "voted" : ""}`}
                style={{
                  left: `${pad + col * interval}%`,
                  top: `${pad + row * interval}%`,
                  width: `${pointSize}%`,
                  height: `${pointSize}%`,
                }}
                onClick={() => onMove({ game, row, col })}
                title={`${row + 1}, ${col + 1}`}
              >
                {piece && <Piece game={game} piece={piece} />}
                {hasVote && <span className="vote-badge">{vote.percent}%</span>}
              </button>
            );
          }),
        )}
      </div>
      <div className="turn-help">{role === "streamer" ? "마우스로 착수" : "마우스로 투표"}</div>
    </div>
  );
}

function Piece({ game, piece }) {
  if (game === "janggi") {
    return <span className={`piece janggi-piece ${piece.side} ${piece.type}`}>{piece.label}</span>;
  }
  if (game === "chess") {
    return <span className={`piece chess-piece ${piece.side}`}>{piece.label}</span>;
  }
  return <span className={`piece stone ${piece}`} />;
}

function VoteList({ voteSummary }) {
  if (!voteSummary.totalVotes) return <p className="empty">아직 집계된 투표가 없습니다.</p>;
  return (
    <ol className="vote-list">
      {voteSummary.top.map((item) => (
        <li key={item.key}>
          <span>{moveLabel(item.move)}</span>
          <strong>{item.percent}%</strong>
        </li>
      ))}
    </ol>
  );
}

function useCountdown(turn, serverOffsetMs = 0) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now() + serverOffsetMs);
    const id = setInterval(() => setNow(Date.now() + serverOffsetMs), 100);
    return () => clearInterval(id);
  }, [serverOffsetMs, turn?.id]);
  if (!turn?.endsAt) return 0;
  return Math.max(0, Math.ceil((turn.endsAt - now) / 1000));
}

function boardSize(game) {
  if (game === "chess") return { rows: 8, cols: 8 };
  if (game === "janggi") return { rows: 10, cols: 9 };
  if (game === "baduk") return { rows: 19, cols: 19 };
  return { rows: 15, cols: 15 };
}

function labelForGame(game) {
  return games.find((item) => item.id === game)?.label || "오목";
}

function sideLabel(side) {
  return side === "black" ? "흑" : side === "white" ? "백" : side;
}

function turnStatusText(state, countdown) {
  if (!state?.active) return "방 없음";
  if (state.phase === "waiting") return "게임 시작 대기";
  if (state.phase === "ended") return "게임 종료";
  if (!state.turn) return "대기 중";
  return `${state.turn.side === "viewers" ? "시청자 턴" : "스트리머 턴"} ${countdown}s`;
}

function victoryText(game, winner) {
  if (!winner) return "";
  const streamerSide = game === "chess" ? "white" : "black";
  return winner === streamerSide ? "스트리머 승리" : "시청자 승리";
}

function cellShade(game, row, col) {
  if (game === "chess") return (row + col) % 2 === 0 ? "light" : "dark";
  return "";
}

function lastMoveAt(lastMove, row, col) {
  if (!lastMove) return false;
  if (lastMove.to) return lastMove.to.row === row && lastMove.to.col === col;
  return lastMove.row === row && lastMove.col === col;
}

function moveLabel(move) {
  if (move.to) return `${move.from.row + 1},${move.from.col + 1} -> ${move.to.row + 1},${move.to.col + 1}`;
  if (move.pass) return "패스";
  return `${move.row + 1}, ${move.col + 1}`;
}

function starPoints(rows, cols) {
  const points = rows === 19 ? [3, 9, 15] : [3, 7, 11];
  return points.flatMap((row) => points.map((col) => [row, col])).filter(([row, col]) => row < rows && col < cols);
}

createRoot(document.getElementById("root")).render(<App />);
