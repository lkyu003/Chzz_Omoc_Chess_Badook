import assert from "node:assert/strict";
import test from "node:test";
import { applyBadukMove, createBadukState, isLegalBadukMove } from "../src/shared/baduk.js";
import { applyChessMove, createChessState, isLegalChessMove } from "../src/shared/chessGame.js";
import { applyJanggiMove, createJanggiState, isLegalJanggiMove } from "../src/shared/janggi.js";
import { normalizePassword } from "../src/shared/password.js";
import { createVoteState, recordVote, winningVote } from "../src/shared/votes.js";

test("baduk captures surrounded stones and rejects occupied points", () => {
  let state = createBadukState();
  for (const move of [
    { row: 0, col: 1 },
    { row: 0, col: 0 },
    { row: 1, col: 0 },
    { row: 5, col: 5 },
    { row: 1, col: 1 },
  ]) {
    const result = applyBadukMove(state, { game: "baduk", ...move });
    assert.equal(result.ok, true);
    state = result.state;
  }

  assert.equal(state.board[0][0], null);
  assert.equal(state.captures.black, 1);
  assert.equal(isLegalBadukMove(state, { game: "baduk", row: 1, col: 1 }), false);
});

test("chess accepts legal moves and rejects illegal moves", () => {
  let state = createChessState();
  const legal = applyChessMove(state, { game: "chess", from: { row: 6, col: 4 }, to: { row: 4, col: 4 } });
  assert.equal(legal.ok, true);
  state = legal.state;
  assert.equal(state.board[4][4].type, "p");
  assert.equal(isLegalChessMove(state, { game: "chess", from: { row: 7, col: 4 }, to: { row: 5, col: 4 } }), false);
});

test("janggi validates simple soldier and chariot moves", () => {
  let state = createJanggiState();
  assert.equal(state.setupVersion, 2);
  assert.equal(state.board[1][4].side, "white");
  assert.equal(state.board[1][4].type, "general");
  assert.equal(state.board[8][4].side, "black");
  assert.equal(state.board[8][4].type, "general");
  assert.equal(state.board[0][4], null);
  assert.equal(state.board[9][4], null);
  assert.equal(state.board[2][1].type, "po");
  assert.equal(state.board[2][7].type, "po");
  assert.equal(state.board[7][1].type, "po");
  assert.equal(state.board[7][7].type, "po");
  for (const col of [0, 2, 4, 6, 8]) {
    assert.equal(state.board[3][col].type, "soldier");
    assert.equal(state.board[6][col].type, "soldier");
  }
  assert.equal(isLegalJanggiMove(state, { game: "janggi", from: { row: 6, col: 0 }, to: { row: 5, col: 0 } }), true);
  let result = applyJanggiMove(state, { game: "janggi", from: { row: 6, col: 0 }, to: { row: 5, col: 0 } });
  assert.equal(result.ok, true);
  state = result.state;
  assert.equal(isLegalJanggiMove(state, { game: "janggi", from: { row: 3, col: 0 }, to: { row: 4, col: 0 } }), true);
  assert.equal(isLegalJanggiMove(state, { game: "janggi", from: { row: 0, col: 0 }, to: { row: 4, col: 0 } }), false);
  assert.equal(isLegalJanggiMove(state, { game: "janggi", from: { row: 1, col: 4 }, to: { row: 2, col: 3 } }), true);

  state = createJanggiState();
  state.board[7][4] = state.board[8][4];
  state.board[8][4] = null;
  assert.equal(isLegalJanggiMove(state, { game: "janggi", from: { row: 7, col: 4 }, to: { row: 8, col: 5 } }), false);

  state = createJanggiState();
  state.board[7][3] = state.board[7][1];
  state.board[7][1] = null;
  state.board[9][5] = null;
  assert.equal(isLegalJanggiMove(state, { game: "janggi", from: { row: 7, col: 3 }, to: { row: 9, col: 5 } }), true);

  state.board[8][4] = state.board[7][7];
  state.board[7][7] = null;
  assert.equal(isLegalJanggiMove(state, { game: "janggi", from: { row: 7, col: 3 }, to: { row: 9, col: 5 } }), false);
});

test("password normalization lowercases and maps Korean keyboard input", () => {
  assert.equal(normalizePassword("ABCDef"), "abcdef");
  assert.equal(normalizePassword("ㅔㅁㄴㄴ"), "pass");
  assert.equal(normalizePassword("ㅁㅠㅊ123"), "abc123");
});

test("vote keys distinguish piece moves", () => {
  const votes = createVoteState();
  recordVote(votes, "viewer-a", { game: "chess", from: { row: 6, col: 4 }, to: { row: 4, col: 4 } }, 1);
  recordVote(votes, "viewer-b", { game: "chess", from: { row: 6, col: 3 }, to: { row: 4, col: 3 } }, 2);
  const winner = winningVote(votes);
  assert.deepEqual(winner.move, { game: "chess", from: { row: 6, col: 4 }, to: { row: 4, col: 4 } });
});
