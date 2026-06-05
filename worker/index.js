import { GameRoom } from "./GameRoom.js";
import { handleChzzkAuth, readChzzkSession } from "./chzzkAuth.js";

export { GameRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = env.GAME_ROOM.idFromName("single-active-room");
    const room = env.GAME_ROOM.get(id);

    const authResponse = await handleChzzkAuth(request, env);
    if (authResponse) return authResponse;

    if (url.pathname === "/api/status") {
      return Response.json({ ok: true, room: "single-active-room" });
    }

    if (url.pathname === "/api/room/create" && request.method === "POST") {
      const session = await readChzzkSession(request, env);
      if (!session) {
        return Response.json({ ok: false, code: "chzzk_login_required" }, { status: 401 });
      }
      return room.fetch(withChzzkSessionHeaders(request, session));
    }

    if (url.pathname === "/api/room/reset" && request.method === "POST") {
      return room.fetch(request);
    }

    if (url.pathname === "/api/room/reconfigure" && request.method === "POST") {
      return room.fetch(request);
    }

    if (url.pathname === "/api/room/start" && request.method === "POST") {
      return room.fetch(request);
    }

    if (url.pathname === "/ws") {
      return room.fetch(request);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

function withChzzkSessionHeaders(request, session) {
  const headers = new Headers(request.headers);
  headers.set("X-CHZZK-Authorized", "true");
  headers.set("X-CHZZK-Channel-Id", session.channelId);
  headers.set("X-CHZZK-Channel-Name", session.channelName || "");
  headers.set("X-CHZZK-Follower-Count", String(session.followerCount || 0));
  return new Request(request, { headers });
}
