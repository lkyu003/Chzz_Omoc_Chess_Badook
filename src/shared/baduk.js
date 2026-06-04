export const BADUK_SIZE = 19;

export function createBadukState() {
  return {
    game: "baduk",
    size: BADUK_SIZE,
    board: Array.from({ length: BADUK_SIZE }, () => Array(BADUK_SIZE).fill(null)),
    nextStone: "black",
    moveNumber: 0,
    lastMove: null,
    winner: null,
    previousBoardHash: null,
    captures: { black: 0, white: 0 },
    passCount: 0,
  };
}

export function isLegalBadukMove(state, move) {
  return simulateBadukMove(state, move).ok;
}

export function applyBadukMove(state, move) {
  return simulateBadukMove(state, move);
}

export function skipBadukTurn(state, reason = "timeout") {
  const result = simulateBadukMove(state, { game: "baduk", pass: true });
  if (result.ok) result.state.lastMove.reason = reason;
  return result;
}

function simulateBadukMove(state, move) {
  if (move?.pass) {
    const next = cloneState(state);
    next.moveNumber += 1;
    next.lastMove = { game: "baduk", pass: true, stone: state.nextStone, moveNumber: next.moveNumber };
    next.nextStone = opponent(state.nextStone);
    next.passCount += 1;
    return { ok: true, state: next, stone: state.nextStone };
  }

  if (
    state?.game !== "baduk" ||
    move?.game !== "baduk" ||
    !Number.isInteger(move.row) ||
    !Number.isInteger(move.col) ||
    move.row < 0 ||
    move.row >= BADUK_SIZE ||
    move.col < 0 ||
    move.col >= BADUK_SIZE ||
    state.board[move.row][move.col] !== null
  ) {
    return { ok: false, state, reason: "illegal_move" };
  }

  const next = cloneState(state);
  const stone = next.nextStone;
  const other = opponent(stone);
  const previousHash = hashBoard(next.board);
  next.board[move.row][move.col] = stone;

  let captured = 0;
  for (const [nr, nc] of neighbors(move.row, move.col)) {
    if (next.board[nr]?.[nc] !== other) continue;
    const group = collectGroup(next.board, nr, nc);
    if (countLiberties(next.board, group) === 0) {
      captured += group.length;
      for (const [gr, gc] of group) next.board[gr][gc] = null;
    }
  }

  const ownGroup = collectGroup(next.board, move.row, move.col);
  if (countLiberties(next.board, ownGroup) === 0) {
    return { ok: false, state, reason: "suicide" };
  }

  const nextHash = hashBoard(next.board);
  if (state.previousBoardHash && state.previousBoardHash === nextHash) {
    return { ok: false, state, reason: "ko" };
  }

  next.previousBoardHash = previousHash;
  next.captures[stone] += captured;
  next.moveNumber += 1;
  next.passCount = 0;
  next.lastMove = { ...move, stone, captured, moveNumber: next.moveNumber };
  next.nextStone = other;
  return { ok: true, state: next, stone };
}

function cloneState(state) {
  return {
    ...state,
    board: state.board.map((row) => row.map((cell) => cell)),
    captures: { ...state.captures },
    lastMove: state.lastMove ? { ...state.lastMove } : null,
  };
}

function collectGroup(board, row, col) {
  const stone = board[row][col];
  const seen = new Set();
  const stack = [[row, col]];
  const group = [];

  while (stack.length) {
    const [r, c] = stack.pop();
    const key = `${r}:${c}`;
    if (seen.has(key) || board[r]?.[c] !== stone) continue;
    seen.add(key);
    group.push([r, c]);
    for (const next of neighbors(r, c)) stack.push(next);
  }

  return group;
}

function countLiberties(board, group) {
  const liberties = new Set();
  for (const [r, c] of group) {
    for (const [nr, nc] of neighbors(r, c)) {
      if (board[nr]?.[nc] === null) liberties.add(`${nr}:${nc}`);
    }
  }
  return liberties.size;
}

function neighbors(row, col) {
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ].filter(([r, c]) => r >= 0 && r < BADUK_SIZE && c >= 0 && c < BADUK_SIZE);
}

function opponent(stone) {
  return stone === "black" ? "white" : "black";
}

function hashBoard(board) {
  return board.map((row) => row.map((cell) => (cell === "black" ? "b" : cell === "white" ? "w" : ".")).join("")).join("/");
}
