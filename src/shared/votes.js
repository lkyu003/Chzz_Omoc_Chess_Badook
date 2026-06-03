export function createVoteState() {
  return {
    byViewer: new Map(),
    candidates: new Map(),
    sequence: 0,
  };
}

export function recordVote(voteState, viewerId, move, now = Date.now()) {
  const previousKey = voteState.byViewer.get(viewerId);
  const key = moveKey(move);

  if (previousKey === key) {
    return voteState;
  }

  if (previousKey) {
    decrementCandidate(voteState, previousKey);
  }

  let candidate = voteState.candidates.get(key);
  if (!candidate) {
    candidate = {
      key,
      move,
      votes: 0,
      firstReachedAt: now,
      sequence: voteState.sequence++,
    };
    voteState.candidates.set(key, candidate);
  }

  candidate.votes += 1;
  if (candidate.votes === 1) {
    candidate.firstReachedAt = now;
  }
  voteState.byViewer.set(viewerId, key);
  return voteState;
}

export function clearVote(voteState, viewerId) {
  const previousKey = voteState.byViewer.get(viewerId);
  if (!previousKey) return voteState;
  decrementCandidate(voteState, previousKey);
  voteState.byViewer.delete(viewerId);
  return voteState;
}

export function summarizeVotes(voteState, topN = 10) {
  const totalVotes = voteState.byViewer.size;
  const top = [...voteState.candidates.values()]
    .filter((candidate) => candidate.votes > 0)
    .sort(compareCandidates)
    .slice(0, topN)
    .map((candidate) => ({
      key: candidate.key,
      move: candidate.move,
      votes: candidate.votes,
      percent: totalVotes === 0 ? 0 : Math.round((candidate.votes / totalVotes) * 100),
    }));

  return { totalVotes, top };
}

export function winningVote(voteState) {
  const [winner] = [...voteState.candidates.values()]
    .filter((candidate) => candidate.votes > 0)
    .sort(compareCandidates);
  return winner ? { key: winner.key, move: winner.move, votes: winner.votes } : null;
}

function decrementCandidate(voteState, key) {
  const candidate = voteState.candidates.get(key);
  if (!candidate) return;
  candidate.votes -= 1;
  if (candidate.votes <= 0) {
    voteState.candidates.delete(key);
  }
}

function compareCandidates(a, b) {
  if (b.votes !== a.votes) return b.votes - a.votes;
  if (a.firstReachedAt !== b.firstReachedAt) return a.firstReachedAt - b.firstReachedAt;
  return a.sequence - b.sequence;
}

function moveKey(move) {
  if (move?.pass) return `${move.game}:pass`;
  if (move?.from && move?.to) {
    return `${move.game}:${move.from.row}:${move.from.col}->${move.to.row}:${move.to.col}:${move.promotion || ""}`;
  }
  return `${move.game}:${move.row}:${move.col}`;
}
