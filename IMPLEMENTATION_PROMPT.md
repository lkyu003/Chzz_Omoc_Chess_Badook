# Integrated Implementation Prompt

You are building a single-page real-time board-game web app for a streamer and many viewers. The app must be deployable to Cloudflare with a low-cost architecture: Cloudflare Pages for the frontend, Cloudflare Workers for API/WebSocket routing, and one Durable Object instance for the single active room.

## Product Goal

Create one page where:

- A streamer can create the single game room after entering an admin password.
- Anyone can join as a viewer.
- When the streamer creates a room, they choose one game:
  - Omok
  - Baduk
  - Janggi
  - Chess
- The streamer chooses two time limits:
  - Streamer turn time
  - Viewer voting time
- Time limits are selectable in 5-second steps, max 30 seconds.
- The streamer plays normally with the mouse.
- Viewers vote by clicking a legal destination.
- Until the viewer vote is finalized, voted positions show percentage support.
- When the viewer time expires, the server applies the legal move with the highest vote count.
- A clean placement sound effect plays when a move is committed.
- Each game's board, stones, pieces, and visual styling should be based on current web image/design research and implemented with a polished, game-appropriate look.

## Deployment Assumption

Target Cloudflare:

- Frontend: Cloudflare Pages
- Backend: Cloudflare Workers
- Real-time room authority: Durable Objects
- Storage: minimal; store only active state in the Durable Object and optionally final game records in Durable Object storage or KV/R2 later
- Room count: exactly one active room
- Expected viewers: around 200

The implementation must include a "free-plan conservation mode" that reduces message volume:

- One active room only.
- Viewer percentage broadcasts are throttled.
- Broadcast only changed vote summaries, not full board state every time.
- Broadcast only the top N voted positions, plus the current viewer's own local selection.
- The client owns timer rendering after receiving a server turn-start timestamp.
- The server does not send timer ticks every second.
- The server keeps only the latest vote per viewer per turn.
- Viewers may revote, but revotes update one stored vote instead of appending new votes.
- Avoid sending full board state more than once per committed move.

Recommended conservation defaults:

- Viewer voting time: 30 seconds
- Vote summary broadcast interval: 5 seconds
- Vote summary top positions: 10
- Streamer turn time: configurable 5 to 30 seconds
- Hard room cap: 1 streamer connection and 250 viewer connections by default

## Core UX

Initial screen:

- Two primary actions:
  - Create Room
  - Join Room

Create Room flow:

- Password input
- Game selector: Omok, Baduk, Janggi, Chess
- Streamer time selector: 5, 10, 15, 20, 25, 30 seconds
- Viewer time selector: 5, 10, 15, 20, 25, 30 seconds
- Create button

Join flow:

- No password
- Optional nickname
- Join button
- If no active room exists, show waiting state

Game screen:

- Main board area
- Current role badge: Streamer or Viewer
- Current turn indicator
- Countdown timer rendered client-side from server timestamp
- Vote overlays during viewer turns
- Connection status
- Viewer count
- Top-voted candidate list for debug/admin visibility only, not as a large explanatory panel
- Resign/reset controls for streamer only

Do not build a marketing landing page. The first screen must be the usable room entry interface.

## Visual Direction

Make the UI suitable for a live-stream control surface:

- Dense, readable, and operational rather than decorative.
- Responsive layout for desktop and mobile.
- Stable board dimensions; no layout shift when overlays appear.
- Use clear icon buttons where appropriate.
- Avoid oversized hero sections, decorative cards, gradient orb backgrounds, and excessive text explaining how the app works.
- Use distinct visual treatments for board pieces, votes, selected moves, legal targets, and last move.
- Include a short asset/design research pass before implementation. Search the web for reference images of clean modern Omok boards, Baduk boards/stones, Janggi boards/pieces, and chess boards/pieces.
- Do not copy copyrighted images directly unless their license permits it. Use references to create original CSS/SVG/canvas/bitmap-style assets, or use permissively licensed assets with attribution where required.
- Prefer crisp, lightweight in-app assets over heavy image files when possible.
- The game pieces must look recognizably different across Omok, Baduk, Janggi, and Chess.
- Board coordinates, grid lines, star points, palace markings, and piece symbols should match the selected game.
- Avoid placeholder circles/letters for final visuals except where the actual game convention uses text, such as Janggi pieces.

## Audio Direction

Add move placement audio:

- Play a short effect when a legal move is committed by the server.
- Use distinct but related sounds where useful:
  - Omok/Baduk: stone-on-wood click.
  - Janggi: round piece tap on board.
  - Chess: softer piece placement sound.
- Do not play speculative audio for uncommitted viewer votes unless the UI deliberately uses a very quiet local preview sound.
- Avoid autoplay problems by initializing audio after the first user interaction.
- Include a mute toggle and persist it locally.
- Keep files small and suitable for Cloudflare Pages caching.
- Use permissively licensed audio or generate original short sound files.
- Document audio asset source/license if external assets are used.

## Game Rules

Implement rule handling conservatively.

For MVP, it is acceptable to fully support Omok first and scaffold the other games with clean interfaces, but the UI must expose all four choices. If all games are implemented, use proven libraries where possible:

- Chess: use `chess.js` for legal move validation.
- Janggi: use a small explicit rule module or a well-reviewed package if available.
- Baduk: implement basic stone placement, capture, ko prevention, pass, and scoring placeholder; do not pretend full scoring is complete if it is not.
- Omok: implement 15x15 board, alternating stones, legal empty placement, win detection for 5 in a row.

The server must be authoritative:

- Validate streamer moves.
- Validate viewer winning vote before applying.
- Ignore illegal votes.
- Ignore votes from disconnected or duplicate-session viewers as appropriate.
- Never trust client-submitted board state.

## Suggested Architecture

Frontend:

- Vite + React + TypeScript
- State management can be React state/reducer; avoid heavy global state unless needed.
- WebSocket client module with reconnect handling.
- Board components share a game adapter interface.

Backend:

- Cloudflare Worker routes:
  - `GET /api/status`
  - `POST /api/room/create`
  - `POST /api/room/reset`
  - `GET /ws`
- Durable Object:
  - `GameRoom`
  - Owns active room state
  - Owns connections
  - Owns active turn timers
  - Owns vote aggregation
  - Owns move commitment

Recommended files:

- `src/App.tsx`
- `src/components/EntryScreen.tsx`
- `src/components/GameScreen.tsx`
- `src/components/boards/OmokBoard.tsx`
- `src/game/adapters.ts`
- `src/game/omok.ts`
- `src/network/socket.ts`
- `worker/index.ts`
- `worker/GameRoom.ts`
- `worker/messages.ts`
- `wrangler.toml`

## Message Protocol

Use JSON messages over WebSocket. Define types in one shared module if possible.

Client to server:

```ts
type ClientMessage =
  | { type: "join"; role: "streamer" | "viewer"; token?: string; nickname?: string }
  | { type: "streamer_move"; move: MovePayload; clientMoveId: string }
  | { type: "viewer_vote"; move: MovePayload; clientVoteId: string }
  | { type: "viewer_clear_vote"; clientVoteId: string }
  | { type: "reset_room"; token: string }
  | { type: "ping"; t: number };
```

Server to client:

```ts
type ServerMessage =
  | { type: "room_snapshot"; state: PublicRoomState }
  | { type: "turn_started"; turnId: string; side: "streamer" | "viewers"; endsAt: number; serverNow: number }
  | { type: "move_committed"; move: MovePayload; state: PublicRoomState }
  | { type: "vote_summary"; turnId: string; totalVotes: number; top: VoteSummaryItem[] }
  | { type: "viewer_count"; count: number }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; t: number; serverNow: number };
```

Vote summary item:

```ts
type VoteSummaryItem = {
  key: string;
  move: MovePayload;
  votes: number;
  percent: number;
};
```

Percent calculation:

- `percent = round((votes / totalVotes) * 100)`
- If `totalVotes === 0`, no percentages should be displayed.

Tie breaking:

- If multiple legal moves have the same highest vote count, choose the one that reached that count first.
- Store `firstReachedAt` for vote candidates.

## Turn Flow

1. Room is created by streamer.
2. Streamer starts first unless the selected game says otherwise.
3. During streamer turn:
   - Streamer clicks a legal move.
   - Server validates and commits.
   - Server starts viewer voting turn.
4. During viewer turn:
   - Viewers click legal moves.
   - Server records latest vote per viewer.
   - Server periodically broadcasts compact vote summaries.
   - At `endsAt`, server commits the winning legal vote.
   - If no valid votes exist, server may pass, skip, or choose a configured fallback. For Omok, default should be skip viewer turn and return to streamer.
5. Repeat until game-over.

## Cloudflare Cost Conservation Requirements

The implementation must include these safeguards:

- `MAX_VIEWERS = 250` default.
- `VOTE_BROADCAST_INTERVAL_MS = 5000` default.
- `TOP_VOTE_CANDIDATES = 10` default.
- No per-second server timer broadcasts.
- No full-board broadcast on every vote.
- No large historical logs sent to all clients.
- Drop stale WebSocket connections.
- Rate-limit viewer vote messages per connection, for example 1 accepted vote per 300ms.
- Reject new viewer joins when the cap is reached.
- Add comments or config names showing these values are deliberate Cloudflare budget controls.

## Security Requirements

- Admin password must not be hardcoded in frontend.
- Use Cloudflare Worker environment variable, for example `ROOM_ADMIN_PASSWORD`.
- Use a signed or random streamer token after successful room creation.
- Viewer clients must not be able to reset the room or submit streamer moves.
- Validate all incoming message shapes.
- Add basic origin checks if deploying beyond local development.

## Test Requirements

Implement tests or a harness that proves:

- Room cannot be created with wrong password.
- Room can be created with correct password.
- Viewer can join without password.
- Streamer move commits immediately if legal.
- Viewer votes are aggregated by latest vote per viewer.
- Viewer revote changes aggregation correctly.
- Vote summaries calculate percentages correctly.
- Vote summary broadcasts are throttled.
- Highest vote commits when viewer timer expires.
- Ties resolve by first candidate to reach the winning count.
- Illegal votes are ignored.
- Client timer renders from `endsAt` and does not require server ticks.
- Omok win detection works.

## Local Development

Provide scripts for:

- `npm run dev`
- `npm run build`
- `npm run test`
- `npm run test:harness`
- `npm run wrangler:dev`
- `npm run deploy`

## Acceptance Criteria

The project is acceptable when:

- The app runs locally.
- The first screen shows Create Room and Join Room.
- The streamer can create an Omok room with password.
- A viewer can join without password.
- Streamer and viewer can alternate turns.
- Viewer vote percentages appear during viewer turns.
- Vote summaries are throttled and compact.
- Server validates moves.
- The app builds for Cloudflare.
- Wrangler config includes Durable Object binding.
- Harness passes for the 200-viewer single-room scenario.
- Documentation explains the free-plan conservation assumptions and when Workers Paid is recommended.
