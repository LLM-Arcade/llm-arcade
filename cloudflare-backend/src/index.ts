import { authRoute, getSession, assertPlayerIntent, ApiError, json, type Bindings } from "./auth";
import { communityQuery } from "./community";
import { communityRpc } from "./rpc";
import { body } from "./request";
import { storageRoute } from "./storage";


interface SavedScore {
  id: string; user_id: string; game_id: string; run_id: string;
  score: number; stats: string | null; created_at: string;
}

async function route(request: Request, env: Bindings): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    await env.ARCADE_DB.prepare("SELECT 1").first();
    return json({ status: "ok", backend: "cloudflare-d1", dataOrigin: "fresh-or-imported" });
  }
  if (url.pathname.startsWith("/api/auth/")) return authRoute(request, env);
  if (url.pathname.startsWith("/api/storage/")) return storageRoute(request, env);
  if (request.method === "POST" && url.pathname === "/api/community/query") return communityQuery(request, env, await body(request));
  if (request.method === "POST" && url.pathname === "/api/community/rpc") return communityRpc(request, env, await body(request));
  if (request.method === "GET" && url.pathname === "/api/games") {
    const rows = await env.ARCADE_DB.prepare(
      "SELECT * FROM games WHERE status <> 'archived' ORDER BY status DESC, featured DESC, title",
    ).all();
    return json({ data: rows.results });
  }
  if (request.method === "GET" && url.pathname === "/api/site-settings") {
    const settings = await env.ARCADE_DB.prepare("SELECT launched, spotlight_game_id, slow_mode_seconds FROM site_settings WHERE id = 1").first();
    return json({ data: settings ? { ...settings, launched: Boolean(settings.launched) } : null });
  }
  const playRoute = /^\/api\/games\/([^/]+)\/play$/.exec(url.pathname);
  if (request.method === "POST" && playRoute) {
    if (request.headers.get("origin") !== new URL(env.APP_ORIGIN).origin) throw new ApiError(403, "This request origin is not allowed.");
    const row = await env.ARCADE_DB.prepare("UPDATE games SET play_count = play_count + 1 WHERE id = ? AND status = 'published' RETURNING play_count")
      .bind(decodeURIComponent(playRoute[1])).first();
    if (!row) throw new ApiError(404, "This game was not found.");
    return json({ data: row });
  }
  if (request.method === "GET" && url.pathname === "/api/recent-scores") {
    const result = await env.ARCADE_DB.prepare(`SELECT s.id, s.score, s.created_at, u.username, g.slug, g.title, g.score_label
      FROM scores s JOIN "user" u ON u.id = s.user_id JOIN games g ON g.id = s.game_id ORDER BY s.created_at DESC LIMIT 20`).all();
    return json({ data: result.results.map(row => ({ id: row.id, score: row.score, created_at: row.created_at,
      profiles: { username: row.username }, games: { slug: row.slug, title: row.title, score_label: row.score_label } })) });
  }
  const playerRoute = /^\/api\/players\/([a-z0-9_]{3,24})$/.exec(url.pathname);
  if (request.method === "GET" && playerRoute) {
    const player = await env.ARCADE_DB.prepare('SELECT id, username, username AS display_name, image AS avatar_url, createdAt AS created_at FROM "user" WHERE username = ?')
      .bind(playerRoute[1]).first<{ id: string }>();
    if (!player) throw new ApiError(404, "This player was not found.");
    const scores = await env.ARCADE_DB.prepare(`SELECT g.id AS game_id, g.slug, g.title, MAX(s.score) AS best_score
      FROM scores s JOIN games g ON g.id = s.game_id WHERE s.user_id = ? GROUP BY g.id ORDER BY best_score DESC`).bind(player.id).all();
    return json({ data: { profile: player, top_scores: scores.results } });
  }
  if (request.method === "POST" && url.pathname === "/api/profile") {
    if (request.headers.get("origin") !== new URL(env.APP_ORIGIN).origin) throw new ApiError(403, "This request origin is not allowed.");
    const session = await getSession(request, env);
    if (!session) throw new ApiError(401, "Sign in to update your profile.");
    const input = await body(request);
    if (Object.keys(input).some(key => !["username", "name"].includes(key))) throw new ApiError(400, "Only your player name and username can be edited here.");
    const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!/^[a-z0-9_]{3,24}$/.test(username) || !name || name.length > 60) throw new ApiError(400, "Use a 3–24 character username and a player name of up to 60 characters.");
    if (await env.ARCADE_DB.prepare('SELECT id FROM "user" WHERE username = ? AND id <> ?').bind(username, session.user.id).first()) throw new ApiError(409, "That username is already taken.");
    await env.ARCADE_DB.prepare('UPDATE "user" SET username = ?, name = ? WHERE id = ?').bind(username, name, session.user.id).run();
    return json({ data: { username, name } });
  }
  const gameRoute = /^\/api\/games\/([^/]+)(?:\/(leaderboard|personal-best))?$/.exec(url.pathname);
  if (request.method === "GET" && gameRoute) {
    const key = decodeURIComponent(gameRoute[1]);
    const game = await env.ARCADE_DB.prepare(
      "SELECT * FROM games WHERE (id = ? OR slug = ?) AND status <> 'archived'",
    ).bind(key, key).first<{ id: string }>();
    if (!game) throw new ApiError(404, "This game was not found.");
    if (!gameRoute[2]) return json({ data: game });
    if (gameRoute[2] === "personal-best") {
      const session = await getSession(request, env);
      if (!session) throw new ApiError(401, "Sign in to see your scores.");
      const row = await env.ARCADE_DB.prepare(
        "SELECT MAX(score) AS score FROM scores WHERE game_id = ? AND user_id = ?",
      ).bind(game.id, session.user.id).first();
      return json({ data: row });
    }
    const period = url.searchParams.get("period") ?? "all";
    if (!["all", "daily", "weekly"].includes(period)) throw new ApiError(400, "Choose a valid leaderboard period.");
    const since = period === "all" ? "" : new Date(Date.now() - (period === "daily" ? 1 : 7) * 86400000).toISOString();
    const rows = await env.ARCADE_DB.prepare(
      `SELECT s.user_id, u.username, u.username AS display_name, u.image AS avatar_url,
              s.score AS best_score, s.created_at AS achieved_at
       FROM (SELECT *, ROW_NUMBER() OVER (
         PARTITION BY user_id ORDER BY score DESC, created_at ASC, id ASC
       ) AS position FROM scores WHERE game_id = ? AND created_at >= ?) s
       JOIN "user" u ON u.id = s.user_id WHERE s.position = 1
       ORDER BY s.score DESC, s.created_at ASC, s.user_id ASC LIMIT 50`,
    ).bind(game.id, since).all();
    return json({ data: rows.results });
  }
  if (request.method === "GET" && url.pathname === "/api/me") {
    const session = await getSession(request, env);
    if (!session) throw new ApiError(401, "Sign in to see your account.");
    return json({ data: session.user });
  }
  if (request.method === "POST" && url.pathname === "/api/scores") {
    if (request.headers.get("origin") !== new URL(env.APP_ORIGIN).origin) {
      throw new ApiError(403, "This request origin is not allowed.");
    }
    const session = await getSession(request, env);
    if (!session) throw new ApiError(401, "Sign in to save your score.");
    const input = await body(request);
    if ("user_id" in input || "role" in input) throw new ApiError(400, "Player identity comes from your session.");
    assertPlayerIntent(input.expected_player_id, session.user.id);
    if (typeof input.game_id !== "string" || input.game_id.length > 128 ||
        typeof input.run_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.run_id) ||
        !Number.isSafeInteger(input.score) || Number(input.score) < 0) {
      throw new ApiError(400, "Send a valid game, run ID, and whole-number score.");
    }
    const game = await env.ARCADE_DB.prepare(
      "SELECT id, score_cap FROM games WHERE id = ? AND status = 'published'",
    ).bind(input.game_id).first<{ id: string; score_cap: number }>();
    if (!game) throw new ApiError(404, "This game is not available for scores.");
    if (Number(input.score) > game.score_cap) throw new ApiError(400, "This score exceeds the game's limit.");
    if (input.stats != null && (typeof input.stats !== "object" || Array.isArray(input.stats))) {
      throw new ApiError(400, "Stats must be a JSON object.");
    }
    const stats = input.stats == null ? null : JSON.stringify(input.stats);
    if (stats && new TextEncoder().encode(stats).length > 4096) throw new ApiError(413, "These stats are too large.");
    const previous = () => env.ARCADE_DB.prepare(
      "SELECT * FROM scores WHERE user_id = ? AND run_id = ?",
    ).bind(session.user.id, input.run_id).first<SavedScore>();
    const replay = (old: SavedScore) => {
      if (old.game_id !== game.id || old.score !== input.score || old.stats !== stats) {
        throw new ApiError(409, "This run ID already belongs to a different score.");
      }
      return json({ data: old, replayed: true });
    };
    const old = await previous();
    if (old) return replay(old);
    const now = new Date().toISOString();
    let saved: SavedScore | null;
    try {
      // One atomic statement: two concurrent requests cannot both pass the
      // per-player/game interval. The unique run key also protects retries.
      saved = await env.ARCADE_DB.prepare(
        `INSERT INTO scores (id, user_id, game_id, run_id, score, stats, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
           SELECT 1 FROM scores WHERE user_id = ? AND game_id = ? AND created_at >= ?
         ) RETURNING *`,
      ).bind(crypto.randomUUID(), session.user.id, game.id, input.run_id,
        input.score, stats, now, session.user.id, game.id,
        new Date(Date.now() - 10000).toISOString()).first<SavedScore>();
    } catch (error) {
      const concurrent = await previous();
      if (concurrent) return replay(concurrent);
      throw error;
    }
    if (!saved) {
      const concurrent = await previous();
      if (concurrent) return replay(concurrent);
      throw new ApiError(429, "Wait a few seconds before saving another run.");
    }
    return json({ data: saved, replayed: false }, 201);
  }
  throw new ApiError(404, "This API route was not found.");
}

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const origin = request.headers.get("origin");
    let response: Response;
    try {
      if (request.method === "OPTIONS") {
        if (origin !== new URL(env.APP_ORIGIN).origin) throw new ApiError(403, "This request origin is not allowed.");
        response = new Response(null, { status: 204 });
      } else response = await route(request, env);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 503;
      if (!(error instanceof ApiError)) console.error(JSON.stringify({ event: "arcade_backend_unavailable" }));
      response = json({ error: error instanceof ApiError ? error.message : "The arcade service is temporarily unavailable." }, status);
    }
    const headers = new Headers(response.headers);
    if (origin && origin === env.APP_ORIGIN) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      headers.append("Vary", "Origin");
    }
    if (request.method !== "GET" || !new URL(request.url).pathname.startsWith("/api/storage/") || response.status !== 200) headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<Bindings>;
