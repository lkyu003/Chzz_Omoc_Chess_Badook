export const JANGGI_ROWS = 10;
export const JANGGI_COLS = 9;
export const JANGGI_SETUP_VERSION = 3;

const BLUE = "black";
const RED = "white";

const labels = {
  [BLUE]: {
    cha: "\u8eca",
    ma: "\u99ac",
    sang: "\u8c61",
    sa: "\u58eb",
    general: "\u695a",
    po: "\u5305",
    soldier: "\u5352",
  },
  [RED]: {
    cha: "\u8eca",
    ma: "\u99ac",
    sang: "\u8c61",
    sa: "\u58eb",
    general: "\u6f22",
    po: "\u5305",
    soldier: "\u5175",
  },
};

export function createJanggiState() {
  const board = Array.from({ length: JANGGI_ROWS }, () => Array(JANGGI_COLS).fill(null));
  placeSide(board, RED, 0, 1, 2, 3);
  placeSide(board, BLUE, 9, 8, 7, 6);

  return {
    game: "janggi",
    setupVersion: JANGGI_SETUP_VERSION,
    rows: JANGGI_ROWS,
    cols: JANGGI_COLS,
    board,
    nextSide: BLUE,
    moveNumber: 0,
    lastMove: null,
    winner: null,
  };
}

export function isLegalJanggiMove(state, move) {
  return validateJanggiMove(state, move).ok;
}

export function applyJanggiMove(state, move) {
  const validation = validateJanggiMove(state, move);
  if (!validation.ok) return { ok: false, state, reason: validation.reason };

  const next = cloneState(state);
  const moving = next.board[move.from.row][move.from.col];
  const target = next.board[move.to.row][move.to.col];
  next.board[move.to.row][move.to.col] = moving;
  next.board[move.from.row][move.from.col] = null;
  next.moveNumber += 1;
  next.lastMove = { ...move, piece: moving, captured: target, moveNumber: next.moveNumber };
  next.nextSide = opponent(next.nextSide);
  if (target?.type === "general") next.winner = moving.side;
  return { ok: true, state: next, piece: moving };
}

export function skipJanggiTurn(state, reason = "timeout") {
  if (state?.game !== "janggi" || state.winner) return { ok: false, state, reason: "illegal_skip" };
  const next = cloneState(state);
  const side = next.nextSide;
  next.moveNumber += 1;
  next.lastMove = { game: "janggi", pass: true, reason, side, moveNumber: next.moveNumber };
  next.nextSide = opponent(side);
  return { ok: true, state: next, side };
}

function placeSide(board, side, backRow, generalRow, cannonRow, soldierRow) {
  const backRank = ["cha", "ma", "sang", "sa", null, "sa", "sang", "ma", "cha"];
  for (let col = 0; col < JANGGI_COLS; col += 1) {
    if (backRank[col]) board[backRow][col] = piece(side, backRank[col]);
  }
  board[generalRow][4] = piece(side, "general");
  board[cannonRow][1] = piece(side, "po");
  board[cannonRow][7] = piece(side, "po");
  for (const col of [0, 2, 4, 6, 8]) board[soldierRow][col] = piece(side, "soldier");
}

function validateJanggiMove(state, move) {
  if (state?.game !== "janggi" || move?.game !== "janggi" || !move.from || !move.to) {
    return { ok: false, reason: "illegal_move" };
  }

  const { from, to } = move;
  if (!inside(from) || !inside(to)) return { ok: false, reason: "off_board" };

  const moving = state.board[from.row][from.col];
  const target = state.board[to.row][to.col];
  if (!moving || moving.side !== state.nextSide || target?.side === moving.side) return { ok: false, reason: "wrong_piece" };

  if (samePoint(from, to)) return { ok: false, reason: "same_point" };
  if (moving.type === "cha") return { ok: chaOk(state.board, from, to), reason: "blocked" };
  if (moving.type === "po") return { ok: poOk(state.board, from, to, target), reason: "blocked" };
  if (moving.type === "ma") return { ok: maOk(state.board, from, to), reason: "blocked" };
  if (moving.type === "sang") return { ok: sangOk(state.board, from, to), reason: "blocked" };
  if (moving.type === "sa" || moving.type === "general") return { ok: palaceStep(from, to), reason: "palace" };
  if (moving.type === "soldier") return { ok: soldierOk(moving.side, from, to), reason: "direction" };
  return { ok: false, reason: "unknown_piece" };
}

function piece(side, type) {
  return { game: "janggi", side, type, label: labels[side][type] };
}

function cloneState(state) {
  return { ...state, board: state.board.map((row) => row.map((cell) => (cell ? { ...cell } : null))), lastMove: state.lastMove ? { ...state.lastMove } : null };
}

function inside(point) {
  return point.row >= 0 && point.row < JANGGI_ROWS && point.col >= 0 && point.col < JANGGI_COLS;
}

function samePoint(a, b) {
  return a.row === b.row && a.col === b.col;
}

function chaOk(board, from, to) {
  if (orthogonal(from, to)) return clearPath(board, from, to);
  return palaceLongDiagonal(from, to) && clearPath(board, from, to);
}

function poOk(board, from, to, target) {
  if (target?.type === "po") return false;
  const lineOk = orthogonal(from, to) || palaceLongDiagonal(from, to);
  if (!lineOk) return false;
  const screens = pathBetween(from, to).map(([row, col]) => board[row][col]).filter(Boolean);
  return screens.length === 1 && screens[0].type !== "po";
}

function maOk(board, from, to) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  if (!((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2))) return false;
  const leg = Math.abs(dr) === 2 ? { row: from.row + Math.sign(dr), col: from.col } : { row: from.row, col: from.col + Math.sign(dc) };
  return !board[leg.row][leg.col];
}

function sangOk(board, from, to) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  if (!((Math.abs(dr) === 3 && Math.abs(dc) === 2) || (Math.abs(dr) === 2 && Math.abs(dc) === 3))) return false;
  const first = Math.abs(dr) === 3 ? { row: from.row + Math.sign(dr), col: from.col } : { row: from.row, col: from.col + Math.sign(dc) };
  const second = {
    row: from.row + Math.sign(dr) * (Math.abs(dr) === 3 ? 2 : 1),
    col: from.col + Math.sign(dc) * (Math.abs(dc) === 3 ? 2 : 1),
  };
  return !board[first.row][first.col] && !board[second.row][second.col];
}

function soldierOk(side, from, to) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const forward = side === BLUE ? -1 : 1;
  if (dr === forward && dc === 0) return true;
  if (dr === 0 && Math.abs(dc) === 1) return true;
  return dr === forward && Math.abs(dc) === 1 && enemyPalace(side, from) && enemyPalace(side, to) && palaceStep(from, to);
}

function orthogonal(from, to) {
  return (from.row === to.row && from.col !== to.col) || (from.col === to.col && from.row !== to.row);
}

function clearPath(board, from, to) {
  return pathBetween(from, to).every(([row, col]) => !board[row][col]);
}

function pathBetween(from, to) {
  const stepRow = Math.sign(to.row - from.row);
  const stepCol = Math.sign(to.col - from.col);
  const points = [];
  let row = from.row + stepRow;
  let col = from.col + stepCol;
  while (row !== to.row || col !== to.col) {
    points.push([row, col]);
    row += stepRow;
    col += stepCol;
  }
  return points;
}

function palaceStep(from, to) {
  if (!samePalace(from, to)) return false;
  const dr = Math.abs(to.row - from.row);
  const dc = Math.abs(to.col - from.col);
  if (dr + dc === 1) return true;
  return dr === 1 && dc === 1 && palaceDiagonalEdge(from, to);
}

function palaceLongDiagonal(from, to) {
  if (!samePalace(from, to)) return false;
  if (Math.abs(to.row - from.row) !== 2 || Math.abs(to.col - from.col) !== 2) return false;
  return palaceDiagonalLine(from, to);
}

function palaceDiagonalLine(from, to) {
  const palaceTop = from.row <= 2 ? 0 : 7;
  const a = { row: from.row - palaceTop, col: from.col - 3 };
  const b = { row: to.row - palaceTop, col: to.col - 3 };
  const main = a.row === a.col && b.row === b.col;
  const anti = a.row + a.col === 2 && b.row + b.col === 2;
  return main || anti;
}

function palaceDiagonalEdge(from, to) {
  if (!palaceDiagonalLine(from, to)) return false;
  const palaceTop = from.row <= 2 ? 0 : 7;
  const a = `${from.row - palaceTop}:${from.col - 3}`;
  const b = `${to.row - palaceTop}:${to.col - 3}`;
  return palaceDiagonalEdges.has([a, b].sort().join(">"));
}

const palaceDiagonalEdges = new Set(["0:0>1:1", "1:1>2:2", "0:2>1:1", "1:1>2:0"]);

function samePalace(from, to) {
  return palaceOf(from) !== null && palaceOf(from) === palaceOf(to);
}

function palaceOf(point) {
  if (point.col < 3 || point.col > 5) return null;
  if (point.row >= 0 && point.row <= 2) return "red";
  if (point.row >= 7 && point.row <= 9) return "blue";
  return null;
}

function enemyPalace(side, point) {
  return palaceOf(point) === (side === BLUE ? "red" : "blue");
}

function opponent(side) {
  return side === BLUE ? RED : BLUE;
}
