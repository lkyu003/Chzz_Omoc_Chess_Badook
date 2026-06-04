import { Chess } from "chess.js";

export function createChessState() {
  const chess = new Chess();
  return fromChess(chess, null, 0);
}

export function isLegalChessMove(state, move) {
  return applyChessMove(state, move).ok;
}

export function applyChessMove(state, move) {
  if (state?.game !== "chess" || move?.game !== "chess" || !move.from || !move.to) {
    return { ok: false, state, reason: "illegal_move" };
  }

  try {
    const chess = new Chess(state.fen);
    const internalMove = findPseudoLegalMove(chess, move);
    if (!internalMove) return { ok: false, state, reason: "illegal_move" };

    chess._makeMove(internalMove);
    return { ok: true, state: fromChess(chess, move, (state.moveNumber || 0) + 1), move: internalMove };
  } catch {
    return { ok: false, state, reason: "illegal_move" };
  }
}

export function skipChessTurn(state, reason = "timeout") {
  if (state?.game !== "chess" || state.winner) return { ok: false, state, reason: "illegal_skip" };
  try {
    const parts = state.fen.split(" ");
    const skipped = parts[1] === "b" ? "black" : "white";
    parts[1] = parts[1] === "b" ? "w" : "b";
    parts[3] = "-";
    parts[4] = String((Number(parts[4]) || 0) + 1);
    if (skipped === "black") parts[5] = String((Number(parts[5]) || 1) + 1);
    const chess = new Chess(parts.join(" "));
    return {
      ok: true,
      state: {
        ...fromChess(chess, { game: "chess", pass: true, reason, side: skipped, moveNumber: (state.moveNumber || 0) + 1 }, (state.moveNumber || 0) + 1),
        moveNumber: (state.moveNumber || 0) + 1,
      },
      side: skipped,
    };
  } catch {
    return { ok: false, state, reason: "illegal_skip" };
  }
}

function fromChess(chess, lastMove, moveNumber = 0) {
  const board = chess.board().map((row) =>
    row.map((piece) => {
      if (!piece) return null;
      return {
        game: "chess",
        side: piece.color === "b" ? "black" : "white",
        type: piece.type,
        label: pieceLabel(piece),
      };
    }),
  );

  return {
    game: "chess",
    size: 8,
    board,
    fen: chess.fen(),
    nextSide: chess.turn() === "b" ? "black" : "white",
    moveNumber,
    lastMove,
    winner: chess.isCheckmate() ? (chess.turn() === "b" ? "white" : "black") : null,
    isCheck: chess.isCheck(),
    isDraw: chess.isDraw(),
  };
}

function findPseudoLegalMove(chess, move) {
  const from = ox88FromCoords(move.from.row, move.from.col);
  const to = ox88FromCoords(move.to.row, move.to.col);
  const promotion = move.promotion || "q";
  return chess._moves({ legal: false }).find((candidate) => {
    if (candidate.from !== from || candidate.to !== to) return false;
    return !candidate.promotion || candidate.promotion === promotion;
  });
}

function ox88FromCoords(row, col) {
  return row * 16 + col;
}

function pieceLabel(piece) {
  const white = { p: "♙", r: "♖", n: "♘", b: "♗", q: "♕", k: "♔" };
  const black = { p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚" };
  return (piece.color === "b" ? black : white)[piece.type];
}
