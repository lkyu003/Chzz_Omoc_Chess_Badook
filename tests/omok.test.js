import assert from "node:assert/strict";
import test from "node:test";
import { applyOmokMove, createOmokState, isLegalOmokMove, skipOmokTurn } from "../src/shared/omok.js";
import { createVoteState, recordVote, summarizeVotes, winningVote } from "../src/shared/votes.js";

test("omok rejects occupied intersections and detects five in a row", () => {
  let state = createOmokState();
  const moves = [
    [7, 7],
    [0, 0],
    [7, 8],
    [0, 1],
    [7, 9],
    [0, 2],
    [7, 10],
    [0, 3],
    [7, 11],
  ];

  for (const [row, col] of moves) {
    const result = applyOmokMove(state, { game: "omok", row, col });
    assert.equal(result.ok, true);
    state = result.state;
  }

  assert.equal(state.winner, "black");
  assert.equal(isLegalOmokMove(state, { game: "omok", row: 7, col: 7 }), false);
});

test("renju rules reject black overlines", () => {
  const state = createOmokState();
  for (const col of [3, 4, 5, 6, 7]) {
    state.board[7][col] = "black";
  }

  const result = applyOmokMove(state, { game: "omok", row: 7, col: 8 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "illegal_move");
});

test("renju rules reject black double-threes", () => {
  const state = createOmokState();
  state.board[7][6] = "black";
  state.board[7][8] = "black";
  state.board[6][7] = "black";
  state.board[8][7] = "black";

  const result = applyOmokMove(state, { game: "omok", row: 7, col: 7 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "illegal_move");
});

test("renju rules reject black double-fours", () => {
  const state = createOmokState();
  state.board[7][5] = "black";
  state.board[7][6] = "black";
  state.board[7][8] = "black";
  state.board[5][7] = "black";
  state.board[6][7] = "black";
  state.board[8][7] = "black";

  const result = applyOmokMove(state, { game: "omok", row: 7, col: 7 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "illegal_move");
});

test("omok timeout skips advance stone color", () => {
  let state = createOmokState();
  state = skipOmokTurn(state, "timeout").state;
  assert.equal(state.nextStone, "white");
  state = skipOmokTurn(state, "timeout").state;
  assert.equal(state.nextStone, "black");
});

test("vote aggregation keeps latest vote per viewer and calculates percentages", () => {
  const votes = createVoteState();
  recordVote(votes, "a", { game: "omok", row: 7, col: 7 }, 1);
  recordVote(votes, "b", { game: "omok", row: 7, col: 8 }, 2);
  recordVote(votes, "c", { game: "omok", row: 7, col: 7 }, 3);
  recordVote(votes, "b", { game: "omok", row: 7, col: 7 }, 4);

  const summary = summarizeVotes(votes, 10);
  assert.equal(summary.totalVotes, 3);
  assert.equal(summary.top[0].votes, 3);
  assert.equal(summary.top[0].percent, 100);
});

test("tie breaks by first candidate to reach the winning count", () => {
  const votes = createVoteState();
  recordVote(votes, "a", { game: "omok", row: 1, col: 1 }, 1);
  recordVote(votes, "b", { game: "omok", row: 2, col: 2 }, 2);
  const winner = winningVote(votes);
  assert.deepEqual(winner.move, { game: "omok", row: 1, col: 1 });
});
