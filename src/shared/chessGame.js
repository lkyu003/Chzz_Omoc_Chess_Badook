import { Chess } from "chess.js";

export function createChessState() {
  const chess = new Chess();
  return fromChess(chess, null);
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
    const result = chess.move({
      from: squareFromCoords(move.from.row, move.from.col),
      to: squareFromCoords(move.to.row, move.to.col),
      promotion: move.promotion || "q",
    });
    if (!result) return { ok: false, state, reason: "illegal_move" };
    return { ok: true, state: fromChess(chess, move), move: result };
  } catch {
    return { ok: false, state, reason: "illegal_move" };
  }
}

function fromChess(chess, lastMove) {
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
    moveNumber: chess.history().length,
    lastMove,
    winner: chess.isCheckmate() ? (chess.turn() === "b" ? "white" : "black") : null,
    isCheck: chess.isCheck(),
    isDraw: chess.isDraw(),
  };
}

function squareFromCoords(row, col) {
  return `${String.fromCharCode(97 + col)}${8 - row}`;
}

function pieceLabel(piece) {
  const white = { p: "♙", r: "♖", n: "♘", b: "♗", q: "♕", k: "♔" };
  const black = { p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚" };
  return (piece.color === "b" ? black : white)[piece.type];
}
