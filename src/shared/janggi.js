export const JANGGI_ROWS = 10;
export const JANGGI_COLS = 9;

export function createJanggiState() {
  const board = Array.from({ length: JANGGI_ROWS }, () => Array(JANGGI_COLS).fill(null));
  const back = ["cha", "ma", "sang", "sa", "general", "sa", "sang", "ma", "cha"];
  for (let col = 0; col < JANGGI_COLS; col += 1) {
    board[0][col] = piece("white", back[col]);
    board[9][col] = piece("black", back[col]);
  }
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
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);

  if (moving.type === "cha") return { ok: isStraight(dr, dc) && clearStraightPath(state.board, from, to), reason: "blocked" };
  if (moving.type === "po") return { ok: isStraight(dr, dc) && cannonPathOk(state.board, from, to, target), reason: "blocked" };
  if (moving.type === "ma") return { ok: horseOk(state.board, from, dr, dc), reason: "blocked" };
  if (moving.type === "sang") return { ok: elephantOk(state.board, from, dr, dc), reason: "blocked" };
  if (moving.type === "sa") return { ok: palace(to, moving.side) && adr === 1 && adc === 1, reason: "palace" };
  if (moving.type === "general") return { ok: palace(to, moving.side) && ((adr === 1 && adc === 0) || (adr === 0 && adc === 1) || (adr === 1 && adc === 1)), reason: "palace" };
  if (moving.type === "soldier") return { ok: soldierOk(moving.side, dr, dc), reason: "direction" };
  return { ok: false, reason: "unknown_piece" };
}

function piece(side, type) {
  const labels = {
    black: { cha: "車", ma: "馬", sang: "象", sa: "士", general: "將", po: "包", soldier: "卒" },
    white: { cha: "車", ma: "馬", sang: "象", sa: "士", general: "帥", po: "包", soldier: "兵" },
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

function cannonPathOk(board, from, to, target) {
  if (target?.type === "po") return false;
  const stepRow = Math.sign(to.row - from.row);
  const stepCol = Math.sign(to.col - from.col);
  let row = from.row + stepRow;
  let col = from.col + stepCol;
  let screens = 0;
  while (row !== to.row || col !== to.col) {
    if (board[row][col]) screens += 1;
    row += stepRow;
    col += stepCol;
  }
  return screens === 1;
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

function palace(pos, side) {
  const rows = side === "black" ? [7, 8, 9] : [0, 1, 2];
  return rows.includes(pos.row) && pos.col >= 3 && pos.col <= 5;
}

function soldierOk(side, dr, dc) {
  const forward = side === "black" ? -1 : 1;
  return (dr === forward && dc === 0) || (dr === 0 && Math.abs(dc) === 1);
}

function opponent(side) {
  return side === "black" ? "white" : "black";
}
