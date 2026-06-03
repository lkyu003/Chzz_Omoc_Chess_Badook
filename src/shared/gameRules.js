import { applyBadukMove, createBadukState, isLegalBadukMove } from "./baduk.js";
import { applyChessMove, createChessState, isLegalChessMove } from "./chessGame.js";
import { applyJanggiMove, createJanggiState, isLegalJanggiMove } from "./janggi.js";
import { applyOmokMove, createOmokState, isLegalOmokMove } from "./omok.js";

export function createInitialGameState(game) {
  if (game === "baduk") return createBadukState();
  if (game === "janggi") return createJanggiState();
  if (game === "chess") return createChessState();
  return createOmokState();
}

export function isLegalGameMove(state, move) {
  if (state?.game === "baduk") return isLegalBadukMove(state, move);
  if (state?.game === "janggi") return isLegalJanggiMove(state, move);
  if (state?.game === "chess") return isLegalChessMove(state, move);
  return isLegalOmokMove(state, move);
}

export function applyGameMove(state, move) {
  if (state?.game === "baduk") return applyBadukMove(state, move);
  if (state?.game === "janggi") return applyJanggiMove(state, move);
  if (state?.game === "chess") return applyChessMove(state, move);
  return applyOmokMove(state, move);
}
