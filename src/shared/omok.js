export const OMOK_SIZE = 15;

export function createOmokState() {
  return {
    game: "omok",
    size: OMOK_SIZE,
    board: Array.from({ length: OMOK_SIZE }, () => Array(OMOK_SIZE).fill(null)),
    nextStone: "black",
    moveNumber: 0,
    lastMove: null,
    winner: null,
  };
}

export function cloneOmokState(state) {
  return {
    ...state,
    board: state.board.map((row) => row.slice()),
    lastMove: state.lastMove ? { ...state.lastMove } : null,
  };
}

export function moveKey(move) {
  return `${move.game}:${move.row}:${move.col}`;
}

export function parseMoveKey(key) {
  const [game, row, col] = key.split(":");
  return { game, row: Number(row), col: Number(col) };
}

export function isLegalOmokMove(state, move) {
  return (
    state?.game === "omok" &&
    move?.game === "omok" &&
    Number.isInteger(move.row) &&
    Number.isInteger(move.col) &&
    move.row >= 0 &&
    move.row < OMOK_SIZE &&
    move.col >= 0 &&
    move.col < OMOK_SIZE &&
    !state.winner &&
    state.board[move.row][move.col] === null
  );
}

export function applyOmokMove(state, move) {
  if (!isLegalOmokMove(state, move)) {
    return { ok: false, state, reason: "illegal_move" };
  }

  const next = cloneOmokState(state);
  const stone = next.nextStone;
  next.board[move.row][move.col] = stone;
  next.moveNumber += 1;
  next.lastMove = { ...move, stone, moveNumber: next.moveNumber };
  next.winner = hasFiveInRow(next.board, move.row, move.col, stone) ? stone : null;
  next.nextStone = stone === "black" ? "white" : "black";
  return { ok: true, state: next, stone };
}

export function hasFiveInRow(board, row, col, stone) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  return directions.some(([dr, dc]) => {
    let count = 1;
    count += countDirection(board, row, col, stone, dr, dc);
    count += countDirection(board, row, col, stone, -dr, -dc);
    return count >= 5;
  });
}

function countDirection(board, row, col, stone, dr, dc) {
  let count = 0;
  let r = row + dr;
  let c = col + dc;
  while (r >= 0 && r < OMOK_SIZE && c >= 0 && c < OMOK_SIZE && board[r][c] === stone) {
    count += 1;
    r += dr;
    c += dc;
  }
  return count;
}
