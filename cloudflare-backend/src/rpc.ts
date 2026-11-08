import { ApiError, assertPlayerIntent, json, requireOrigin, type Bindings } from "./auth";
import { admin, player } from "./community";
import { reviewSubmission } from "./submissions";

type Args = Record<string, unknown>;
function id(value: unknown) {
  if (typeof value !== "string" || !value.length || value.length > 128) throw new ApiError(400, "Send a valid record ID.");
  return value;
}
function argsFor(input: Args, keys: string[]): Args {
  const value = input.args;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw new ApiError(400, "Send supported arguments.");
  return value as Args;
}
export async function communityRpc(request: Request, env: Bindings, input: Args): Promise<Response> {
  requireOrigin(request, env);
  const name = input.name;
  if (name === "get_game_achievements") {
    const args = argsFor(input, ["p_game_id"]), gameId = id(args.p_game_id);
    const rows = await env.ARCADE_DB.prepare(`SELECT a.*,
      (SELECT count(*) FROM user_achievements ua WHERE ua.achievement_id = a.id) AS unlock_count,
      (SELECT count(DISTINCT user_id) FROM scores WHERE game_id = a.game_id) AS player_count
      FROM achievements a WHERE a.game_id = ? AND a.active = 1 ORDER BY a.sort_order,a.slug`).bind(gameId).all();
    return json({ data: rows.results });
  }
  if (name === "get_user_top_scores") {
    const args = argsFor(input, ["p_user_id"]), userId = id(args.p_user_id);
    const rows = await env.ARCADE_DB.prepare(`WITH best AS (
      SELECT *, row_number() OVER (PARTITION BY game_id,user_id ORDER BY score DESC,created_at,id) AS position FROM scores
    ), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY game_id ORDER BY score DESC,created_at,user_id) AS rank FROM best WHERE position = 1
    ) SELECT r.game_id,g.slug,g.title,r.score AS best_score,r.created_at AS achieved_at,r.rank
      FROM ranked r JOIN games g ON g.id = r.game_id WHERE r.user_id = ? ORDER BY r.rank,g.title LIMIT 200`).bind(userId).all();
    return json({ data: rows.results });
  }
  if (name === "unlock_achievement") {
    const user = await player(request, env);
    const args = argsFor(input, ["p_game_id", "p_slug", "p_expected_player_id"]), gameId = id(args.p_game_id), slug = id(args.p_slug);
    assertPlayerIntent(args.p_expected_player_id, user.id);
    const achievement = await env.ARCADE_DB.prepare(`SELECT a.id,a.name,a.xp FROM achievements a JOIN games g ON g.id = a.game_id
      WHERE a.game_id = ? AND a.slug = ? AND a.active = 1 AND g.status = 'published'`).bind(gameId, slug).first<{ id: string; name: string; xp: number }>();
    if (!achievement) throw new ApiError(400, "That achievement is not in the approved game manifest.");
    const saved = await env.ARCADE_DB.prepare(`INSERT INTO user_achievements VALUES (?,?,?) ON CONFLICT(user_id,achievement_id) DO NOTHING RETURNING achievement_id`)
      .bind(user.id, achievement.id, new Date().toISOString()).first();
    return json({ data: { unlocked: Boolean(saved), name: achievement.name, xp: achievement.xp } });
  }
  // Administrative commands re-read role and verified account identity on
  // every request. No role field in request bodies or client UI is trusted.
  if (typeof name !== "string" || !name.startsWith("admin_")) throw new ApiError(400, "This command is not supported.");
  const owner = await admin(request, env);
  if (name === "admin_review_submission") return reviewSubmission(env, argsFor(input, ["p_submission_id", "p_approve", "p_note"]));
  if (name === "admin_set_role") {
    const args = argsFor(input, ["p_user_id", "p_role"]), userId = id(args.p_user_id);
    if (userId === owner.id) throw new ApiError(400, "You cannot change your own administrator role here.");
    if (!["player", "playtester", "moderator", "admin"].includes(String(args.p_role))) throw new ApiError(400, "Choose a supported role.");
    const target = await env.ARCADE_DB.prepare('SELECT clerk_id,emailVerified FROM "user" WHERE id = ?').bind(userId).first<{ clerk_id: string | null; emailVerified: number }>();
    if (!target) throw new ApiError(404, "This player was not found.");
    if (args.p_role === "admin" && (!target.clerk_id || !target.emailVerified)) throw new ApiError(400, "An administrator needs a verified account.");
    await env.ARCADE_DB.prepare('UPDATE "user" SET role = ? WHERE id = ?').bind(args.p_role, userId).run();
    return json({ data: null });
  }
  if (name === "admin_set_launched") {
    const args = argsFor(input, ["p_launched"]);
    if (typeof args.p_launched !== "boolean") throw new ApiError(400, "Choose the launch state.");
    await env.ARCADE_DB.prepare("UPDATE site_settings SET launched = ? WHERE id = 1").bind(Number(args.p_launched)).run();
    return json({ data: null });
  }
  if (name === "admin_set_spotlight") {
    const args = argsFor(input, ["p_game_id"]), gameId = args.p_game_id === null ? null : id(args.p_game_id);
    if (gameId && !await env.ARCADE_DB.prepare("SELECT id FROM games WHERE id = ? AND status = 'published'").bind(gameId).first()) throw new ApiError(400, "Choose a published game for the spotlight.");
    await env.ARCADE_DB.prepare("UPDATE site_settings SET spotlight_game_id = ? WHERE id = 1").bind(gameId).run();
    return json({ data: null });
  }
  if (name === "admin_update_game") {
    const args = argsFor(input, ["p_game_id", "p_status", "p_featured"]), gameId = id(args.p_game_id);
    if (args.p_status !== null && !["published", "coming_soon", "archived"].includes(String(args.p_status)) || args.p_featured !== null && typeof args.p_featured !== "boolean") throw new ApiError(400, "Choose supported game settings.");
    await env.ARCADE_DB.prepare("UPDATE games SET status = coalesce(?,status), featured = coalesce(?,featured) WHERE id = ?").bind(args.p_status, args.p_featured === null ? null : Number(args.p_featured), gameId).run();
    return json({ data: null });
  }
  if (name === "admin_wipe_scores") {
    const args = argsFor(input, ["p_game_id"]), gameId = id(args.p_game_id);
    const result = await env.ARCADE_DB.prepare("DELETE FROM scores WHERE game_id = ?").bind(gameId).run();
    // Progression is an append-only award history; a board reset does not
    // erase accounts, badges or historical activity.
    return json({ data: result.meta.changes });
  }
  if (name === "admin_review_playtest") {
    const args = argsFor(input, ["p_application_id", "p_approve"]), applicationId = id(args.p_application_id);
    if (typeof args.p_approve !== "boolean") throw new ApiError(400, "Choose approve or decline.");
    const application = await env.ARCADE_DB.prepare("SELECT email,status FROM playtest_applications WHERE id = ?").bind(applicationId).first<{ email: string; status: string }>();
    if (!application) throw new ApiError(404, "This application was not found.");
    if (application.status !== "pending") throw new ApiError(409, "This application was already reviewed.");
    const result = await env.ARCADE_DB.batch([
      // Apply the role only while this exact application is still pending,
      // inside the same transaction that records the winning decision.
      env.ARCADE_DB.prepare(`UPDATE "user" SET role = 'playtester' WHERE lower(email) = ? AND emailVerified = 1 AND clerk_id IS NOT NULL AND role = 'player' AND ? = 1
        AND EXISTS (SELECT 1 FROM playtest_applications WHERE id = ? AND status = 'pending')`)
        .bind(application.email, Number(args.p_approve), applicationId),
      env.ARCADE_DB.prepare("UPDATE playtest_applications SET status = ? WHERE id = ? AND status = 'pending'").bind(args.p_approve ? "approved" : "declined", applicationId),
    ]);
    if (!result[1].meta.changes) throw new ApiError(409, "This application was already reviewed.");
    return json({ data: !args.p_approve ? "declined" : result[0].meta.changes ? "approved" : "approved (no account yet)" });
  }
  throw new ApiError(400, "This administrator command is not implemented yet.");
}
