# Harness Guide

This harness describes how to verify the Cloudflare-ready streamer-vs-viewers board-game app once implemented.

The target scenario is:

- One active room
- One streamer
- 200 viewers
- Viewer voting turn of 30 seconds
- Vote summary broadcasts every 5 seconds
- Top 10 vote candidates broadcast
- No server timer ticks

## Required Commands

The completed project should provide:

```powershell
npm run build
npm run test
npm run test:harness
npm run wrangler:dev
```

## Functional Checks

Run these in automated tests where practical:

- Wrong password cannot create a room.
- Correct password creates a room.
- Viewers join without password.
- The room rejects viewers above the configured cap.
- Streamer legal move is committed.
- Streamer illegal move is rejected.
- Viewer legal vote is counted.
- Viewer illegal vote is ignored.
- Viewer revote replaces their previous vote.
- Vote percentage equals `round(votes / totalVotes * 100)`.
- Vote summaries include only the configured top N candidates.
- Vote summaries are not broadcast more frequently than the configured interval.
- Viewer turn commits the highest voted legal move at deadline.
- Ties resolve by the candidate that first reached the winning vote count.
- If no valid viewer votes exist, the configured fallback behavior runs.
- Omok detects a five-in-a-row win.

## Cost-Conservation Checks

These checks are specifically for Cloudflare free-plan pressure:

- The server sends `turn_started` once per turn, not every second.
- The client countdown is derived from `endsAt` and `serverNow`.
- A viewer vote does not trigger a full-board broadcast.
- A viewer vote does not trigger an immediate broadcast to every viewer unless the throttle interval has elapsed.
- Only compact vote summaries are sent during the vote window.
- Full room snapshots are sent on join and committed move only.
- Disconnect cleanup removes stale viewer IDs from active connection counts.

## Load Scenario

For the 200-viewer scenario:

1. Start local Worker/Durable Object dev server.
2. Create one Omok room with a 30-second viewer timer.
3. Connect one streamer socket.
4. Connect 200 viewer sockets.
5. Start a viewer voting turn.
6. Each viewer sends one vote.
7. Half the viewers send one revote after 5 seconds.
8. Verify the winning vote is committed at the deadline.
9. Verify the number of vote summary broadcasts is bounded.

Expected upper bound per 30-second viewer turn:

```text
viewer input messages: 200 initial + 100 revotes = 300
vote summary waves: ceil(30 / 5) = 6
vote summary outgoing messages: 200 viewers * 6 waves = 1200
full state broadcasts during voting: 0
server timer tick messages: 0
```

The exact transport metrics will vary by implementation, but any large deviation should be treated as a failure until explained.

## Manual Browser QA

Check at desktop and mobile widths:

- Entry screen fits without text overlap.
- Create Room and Join Room are visible on first screen.
- Board keeps a stable aspect ratio.
- Vote overlays do not resize cells.
- Percentage text remains readable.
- Streamer controls are hidden from viewers.
- Reconnect state is visible but not disruptive.

## Cloudflare Deployment QA

Before deployment:

- `wrangler.toml` has a Durable Object binding.
- Durable Object migrations are configured.
- `ROOM_ADMIN_PASSWORD` is configured as a secret.
- The frontend uses the deployed Worker endpoint or same-origin routing.
- No admin password is bundled in frontend assets.
- Local `.dev.vars` or equivalent secrets file is not committed.

After deployment:

- `/api/status` returns healthy.
- WebSocket connection succeeds through the deployed domain.
- One streamer and at least two viewers can complete a turn.
- Vote summaries are received at the configured throttle interval.
- Cloudflare dashboard usage remains within expected request/duration bounds.

## Asset And Audio QA

Check these before calling the UI complete:

- Omok, Baduk, Janggi, and Chess each have visually distinct boards and pieces.
- Visual references were researched online and any external assets have acceptable licenses.
- Final committed moves play a placement sound after user audio unlock.
- Viewer vote previews do not trigger loud repeated sounds.
- Mute toggle works and persists after reload.
- Audio files are small enough for Cloudflare Pages and are cached normally.
- Board and piece assets render crisply on desktop and mobile.
- Janggi palace markings, Baduk star points, Omok grid, and Chess square colors are visible and correctly aligned.
