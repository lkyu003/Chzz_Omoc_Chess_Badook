export function roomConfig(env = {}) {
  return {
    maxViewers: numberFromEnv(env.MAX_VIEWERS, 250),
    maxViewersPerIp: numberFromEnv(env.MAX_VIEWERS_PER_IP, 2),
    voteBroadcastIntervalMs: numberFromEnv(env.VOTE_BROADCAST_INTERVAL_MS, 5000),
    topVoteCandidates: numberFromEnv(env.TOP_VOTE_CANDIDATES, 10),
    createRoomLimitPerMinute: numberFromEnv(env.CREATE_ROOM_LIMIT_PER_MINUTE, 6),
    websocketLimitPerMinute: numberFromEnv(env.WEBSOCKET_LIMIT_PER_MINUTE, 60),
    joinLimitPerMinute: numberFromEnv(env.JOIN_LIMIT_PER_MINUTE, 60),
    adminActionLimitPerMinute: numberFromEnv(env.ADMIN_ACTION_LIMIT_PER_MINUTE, 30),
    harnessMode: String(env.HARNESS_MODE || "false") === "true",
  };
}

function numberFromEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
