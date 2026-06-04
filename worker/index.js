import { GameRoom } from "./GameRoom.js";

export { GameRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = env.GAME_ROOM.idFromName("single-active-room");
    const room = env.GAME_ROOM.get(id);

    if (url.pathname === "/api/status") {
      return Response.json({ ok: true, room: "single-active-room" });
    }

    if (url.pathname === "/api/room/create" && request.method === "POST") {
      return room.fetch(request);
    }

    if (url.pathname === "/api/room/reset" && request.method === "POST") {
      return room.fetch(request);
    }

    if (url.pathname === "/api/room/reconfigure" && request.method === "POST") {
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
