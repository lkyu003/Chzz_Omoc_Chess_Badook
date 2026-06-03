export function roomConfig(env = {}) {
  return {
    maxViewers: numberFromEnv(env.MAX_VIEWERS, 250),
    voteBroadcastIntervalMs: numberFromEnv(env.VOTE_BROADCAST_INTERVAL_MS, 5000),
    topVoteCandidates: numberFromEnv(env.TOP_VOTE_CANDIDATES, 10),
    harnessMode: String(env.HARNESS_MODE || "false") === "true",
  };
}

function numberFromEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
