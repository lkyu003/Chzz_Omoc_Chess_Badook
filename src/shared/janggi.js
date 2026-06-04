export const JANGGI_ROWS = 10;
export const JANGGI_COLS = 9;
export const JANGGI_SETUP_VERSION = 2;

export function createJanggiState() {
  const board = Array.from({ length: JANGGI_ROWS }, () => Array(JANGGI_COLS).fill(null));
  const back = ["cha", "ma", "sang", "sa", null, "sa", "sang", "ma", "cha"];

  for (let col = 0; col < JANGGI_COLS; col += 1) {
    if (back[col]) {
      board[0][col] = piece("white", back[col]);
      board[9][col] = piece("black", back[col]);
    }
  }

  board[1][4] = piece("white", "general");
  board[8][4] = piece("black", "general");
  board[2][1] = piece("white", "po");
  board[2][7] = piece("white", "po");
  board[7][1] = piece("black", "po");
  board[7][7] = piece("black", "po");

  for (const col of [0, 2, 4, 6, 8]) {
    board[3][col] = piece("white", "soldier");
    board[6][col] = piece("black", "soldier");
  }

  return {
    game: "janggi",
    setupVersion: JANGGI_SETUP_VERSION,
    rows: JANGGI_ROWS,
    cols: JANGGI_COLS,
    board,
    nextSide: "black",
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

function validateJanggiMove(state, move) {
  if (state?.game !== "janggi" || move?.game !== "janggi" || !move.from || !move.to) {
    return { ok: false, reason: "illegal_move" };
  }

  const { from, to } = move;
  if (!inside(from.row, from.col) || !inside(to.row, to.col)) return { ok: false, reason: "off_board" };

  const moving = state.board[from.row][from.col];
  const target = state.board[to.row][to.col];
  if (!moving || moving.side !== state.nextSide || target?.side === moving.side) return { ok: false, reason: "wrong_piece" };

  const dr = to.row - from.row;
  const dc = to.col - from.col;

  if (moving.type === "cha") return { ok: rookLineOk(state.board, from, to), reason: "blocked" };
  if (moving.type === "po") return { ok: cannonLineOk(state.board, from, to, target), reason: "blocked" };
  if (moving.type === "ma") return { ok: horseOk(state.board, from, dr, dc), reason: "blocked" };
  if (moving.type === "sang") return { ok: elephantOk(state.board, from, dr, dc), reason: "blocked" };
  if (moving.type === "sa") return { ok: palaceStepOk(from, to), reason: "palace" };
  if (moving.type === "general") return { ok: palaceStepOk(from, to), reason: "palace" };
  if (moving.type === "soldier") return { ok: soldierOk(moving.side, from, to), reason: "direction" };
  return { ok: false, reason: "unknown_piece" };
}

function piece(side, type) {
  const labels = {
    black: { cha: "車", ma: "馬", sang: "象", sa: "士", general: "楚", po: "包", soldier: "卒" },
    white: { cha: "車", ma: "馬", sang: "象", sa: "士", general: "漢", po: "包", soldier: "兵" },
  };
  return { game: "janggi", side, type, label: labels[side][type] };
}

function cloneState(state) {
  return { ...state, board: state.board.map((row) => row.map((cell) => (cell ? { ...cell } : null))), lastMove: state.lastMove ? { ...state.lastMove } : null };
}

function inside(row, col) {
  return row >= 0 && row < JANGGI_ROWS && col >= 0 && col < JANGGI_COLS;
}

function isStraight(dr, dc) {
  return (dr === 0 && dc !== 0) || (dc === 0 && dr !== 0);
}

function clearStraightPath(board, from, to) {
  const stepRow = Math.sign(to.row - from.row);
  const stepCol = Math.sign(to.col - from.col);
  let row = from.row + stepRow;
  let col = from.col + stepCol;
  while (row !== to.row || col !== to.col) {
    if (board[row][col]) return false;
    row += stepRow;
    col += stepCol;
  }
  return true;
}

function rookLineOk(board, from, to) {
  if (isStraight(to.row - from.row, to.col - from.col)) return clearStraightPath(board, from, to);
  return palaceDiagonalLine(from, to) && clearDiagonalPath(board, from, to);
}

function cannonLineOk(board, from, to, target) {
  if (target?.type === "po") return false;
  if (isStraight(to.row - from.row, to.col - from.col)) return cannonPathOk(board, from, to);
  return palaceOppositeCornerLine(from, to) && cannonPathOk(board, from, to);
}

function cannonPathOk(board, from, to) {
  const screens = [];
  for (const [row, col] of pointsBetween(from, to)) {
    if (board[row][col]) screens.push(board[row][col]);
  }
  return screens.length === 1 && screens[0].type !== "po";
}

function clearDiagonalPath(board, from, to) {
  for (const [row, col] of pointsBetween(from, to)) {
    if (board[row][col]) return false;
  }
  return true;
}

function pointsBetween(from, to) {
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

function horseOk(board, from, dr, dc) {
  if (!((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2))) return false;
  const leg = Math.abs(dr) === 2 ? { row: from.row + Math.sign(dr), col: from.col } : { row: from.row, col: from.col + Math.sign(dc) };
  return !board[leg.row][leg.col];
}

function elephantOk(board, from, dr, dc) {
  if (!((Math.abs(dr) === 3 && Math.abs(dc) === 2) || (Math.abs(dr) === 2 && Math.abs(dc) === 3))) return false;
  const first = Math.abs(dr) === 3 ? { row: from.row + Math.sign(dr), col: from.col } : { row: from.row, col: from.col + Math.sign(dc) };
  const second = { row: from.row + Math.sign(dr) * (Math.abs(dr) === 3 ? 2 : 1), col: from.col + Math.sign(dc) * (Math.abs(dc) === 3 ? 2 : 1) };
  return !board[first.row][first.col] && !board[second.row][second.col];
}

function palaceAny(pos) {
  return ((pos.row >= 0 && pos.row <= 2) || (pos.row >= 7 && pos.row <= 9)) && pos.col >= 3 && pos.col <= 5;
}

function palaceStepOk(from, to) {
  return palaceLineSegment(from, to);
}

function palaceDiagonalStep(from, to) {
  return palaceLineSegment(from, to) && Math.abs(to.row - from.row) === 1 && Math.abs(to.col - from.col) === 1;
}

function palaceDiagonalLine(from, to) {
  if (!palaceAny(from) || !palaceAny(to)) return false;
  if (Math.abs(to.row - from.row) !== Math.abs(to.col - from.col)) return false;

  const topRow = from.row <= 2 ? 0 : 7;
  if (to.row < topRow || to.row > topRow + 2) return false;

  const fromRow = from.row - topRow;
  const toRow = to.row - topRow;
  const fromCol = from.col - 3;
  const toCol = to.col - 3;
  const mainDiagonal = fromRow === fromCol && toRow === toCol;
  const antiDiagonal = fromRow + fromCol === 2 && toRow + toCol === 2;
  return mainDiagonal || antiDiagonal;
}

function palaceOppositeCornerLine(from, to) {
  if (!palaceDiagonalLine(from, to)) return false;
  return Math.abs(to.row - from.row) === 2 && Math.abs(to.col - from.col) === 2;
}

function palaceLineSegment(from, to) {
  if (!samePalace(from, to)) return false;
  const dr = Math.abs(to.row - from.row);
  const dc = Math.abs(to.col - from.col);
  if (dr + dc === 1) return true;
  if (dr !== 1 || dc !== 1) return false;

  const topRow = from.row <= 2 ? 0 : 7;
  const fromLocal = `${from.row - topRow}:${from.col - 3}`;
  const toLocal = `${to.row - topRow}:${to.col - 3}`;
  const edge = [fromLocal, toLocal].sort().join(">");
  return palaceDiagonalEdges.has(edge);
}

const palaceDiagonalEdges = new Set(["0:0>1:1", "1:1>2:2", "0:2>1:1", "1:1>2:0"]);

function samePalace(from, to) {
  if (!palaceAny(from) || !palaceAny(to)) return false;
  return (from.row <= 2 && to.row <= 2) || (from.row >= 7 && to.row >= 7);
}

function soldierOk(side, from, to) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const forward = side === "black" ? -1 : 1;
  if ((dr === forward && dc === 0) || (dr === 0 && Math.abs(dc) === 1)) return true;
  return dr === forward && Math.abs(dc) === 1 && enemyPalace(side, from) && enemyPalace(side, to) && palaceDiagonalStep(from, to);
}

function enemyPalace(side, pos) {
  return side === "black" ? pos.row >= 0 && pos.row <= 2 && pos.col >= 3 && pos.col <= 5 : pos.row >= 7 && pos.row <= 9 && pos.col >= 3 && pos.col <= 5;
}

function opponent(side) {
  return side === "black" ? "white" : "black";
}
