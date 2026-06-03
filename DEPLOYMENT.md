# Cloudflare Deployment Notes

## Local Secrets

Copy `.dev.vars.example` to `.dev.vars` for local Wrangler development and change the password.

```powershell
wrangler secret put ROOM_ADMIN_PASSWORD
```

## Free-Plan Conservation Defaults

The Worker and Durable Object use these deliberate budget controls:

- `MAX_VIEWERS=250`
- `VOTE_BROADCAST_INTERVAL_MS=5000`
- `TOP_VOTE_CANDIDATES=10`
- One active room, addressed as `single-active-room`
- Client-rendered timers from `endsAt`
- Full board snapshots only on join and committed moves
- Compact vote summaries during viewer turns

For 200 viewers, use 30-second viewer turns if trying to stay close to free-plan behavior. Five-second turns are not recommended on the free plan.

## Deploy

```powershell
npm install
npm run build
wrangler secret put ROOM_ADMIN_PASSWORD
npm run deploy
```

The frontend is served from Cloudflare Pages-style static assets through the Worker assets binding in this configuration. Splitting Pages and Worker into separate projects is also possible; keep `/api/*` and `/ws` routed to the Worker.
