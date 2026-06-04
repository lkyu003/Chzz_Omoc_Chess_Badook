import { applyBadukMove, createBadukState, isLegalBadukMove, skipBadukTurn } from "./baduk.js";
import { applyChessMove, createChessState, isLegalChessMove, skipChessTurn } from "./chessGame.js";
import { applyJanggiMove, createJanggiState, isLegalJanggiMove, skipJanggiTurn } from "./janggi.js";
import { applyOmokMove, createOmokState, isLegalOmokMove, skipOmokTurn } from "./omok.js";

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

export function skipGameTurn(state, reason = "timeout") {
  if (state?.game === "baduk") return skipBadukTurn(state, reason);
  if (state?.game === "janggi") return skipJanggiTurn(state, reason);
  if (state?.game === "chess") return skipChessTurn(state, reason);
  return skipOmokTurn(state, reason);
}
