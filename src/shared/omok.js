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
  if (
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
  ) {
    return !isForbiddenRenjuMove(state, move);
  }
  return false;
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
  next.winner = hasRenjuWin(next.board, move.row, move.col, stone) ? stone : null;
  next.nextStone = stone === "black" ? "white" : "black";
  return { ok: true, state: next, stone };
}

export function hasFiveInRow(board, row, col, stone) {
  return lineLengths(board, row, col, stone).some((count) => count >= 5);
}

export function isForbiddenRenjuMove(state, move) {
  if (state.nextStone !== "black") return false;
  const board = state.board.map((row) => row.slice());
  board[move.row][move.col] = "black";
  if (lineLengths(board, move.row, move.col, "black").some((count) => count > 5)) return true;
  return countFours(board, move.row, move.col, "black") >= 2 || countOpenThrees(board, move.row, move.col, "black") >= 2;
}

function hasRenjuWin(board, row, col, stone) {
  const lengths = lineLengths(board, row, col, stone);
  if (stone === "black") return lengths.some((count) => count === 5);
  return lengths.some((count) => count >= 5);
}

function lineLengths(board, row, col, stone) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  return directions.map(([dr, dc]) => 1 + countDirection(board, row, col, stone, dr, dc) + countDirection(board, row, col, stone, -dr, -dc));
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

function countFours(board, row, col, stone) {
  return directionWindows(row, col)
    .map((line) => line.map(([r, c]) => cellAt(board, r, c, stone)).join(""))
    .filter((pattern) => createsFour(pattern))
    .length;
}

function countOpenThrees(board, row, col, stone) {
  return directionWindows(row, col)
    .map((line) => line.map(([r, c]) => cellAt(board, r, c, stone)).join(""))
    .filter((pattern) => createsOpenThree(pattern))
    .length;
}

function directionWindows(row, col) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  return directions.map(([dr, dc]) => {
    const cells = [];
    for (let offset = -5; offset <= 5; offset += 1) {
      cells.push([row + dr * offset, col + dc * offset]);
    }
    return cells;
  });
}

function cellAt(board, row, col, stone) {
  if (row < 0 || row >= OMOK_SIZE || col < 0 || col >= OMOK_SIZE) return "x";
  if (board[row][col] === stone) return "b";
  if (board[row][col] === null) return ".";
  return "w";
}

function createsFour(pattern) {
  const windows = windowsOf(pattern, 6);
  return windows.some((window) => {
    if (window.includes("w") || window.includes("x")) return false;
    const stones = countChars(window, "b");
    const empties = countChars(window, ".");
    return stones === 4 && empties === 2;
  });
}

function createsOpenThree(pattern) {
  const openThreePatterns = ["..bbb..", ".bb.b.", ".b.bb."];
  return openThreePatterns.some((candidate) => pattern.includes(candidate));
}

function windowsOf(value, size) {
  const windows = [];
  for (let index = 0; index <= value.length - size; index += 1) {
    windows.push(value.slice(index, index + size));
  }
  return windows;
}

function countChars(value, char) {
  return [...value].filter((item) => item === char).length;
}
