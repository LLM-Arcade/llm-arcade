import { ApiError, json, type Bindings } from "./auth";

type Input = Record<string, unknown>;
interface Manifest { slug: string; name: string; hint: string; xp: number }
interface Submission extends Input { id: string; user_id: string; game_id: string | null; slug: string; html_path: string; art_path: string | null; version: number; manifest: string; checklist: string; status: string }
const eras = ["Arcade", "Atari", "NES", "SNES", "Genesis", "Amiga", "DOS", "PS1", "Mobile", "Original"];
const string = (value: unknown, max: number, min = 0) => {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new ApiError(400, "A submission field has an invalid length.");
  return value.trim();
};
function manifest(value: unknown): Manifest[] {
  if (!Array.isArray(value) || value.length > 12) throw new ApiError(400, "Use a manifest of up to twelve achievements.");
  const slugs = new Set();
  return value.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).some(k => !["slug", "name", "hint", "xp"].includes(k))) throw new ApiError(400, "This manifest entry is invalid.");
    const slug = string(row.slug, 64, 2);
    if (!/^[a-z0-9-]+$/.test(slug) || slugs.has(slug)) throw new ApiError(400, "Use distinct achievement slugs.");
    slugs.add(slug);
    if (![10, 25, 50, 100, 150].includes(row.xp)) throw new ApiError(400, "Choose an approved achievement XP value.");
    return { slug, name: string(row.name, 60, 2), hint: string(row.hint, 300), xp: row.xp };
  });
}
function metadata(input: Input) {
  const slug = string(input.slug, 50, 2);
  if (!/^[a-z0-9-]+$/.test(slug) || !eras.includes(String(input.era)) || !Number.isSafeInteger(input.score_cap) || Number(input.score_cap) < 1 || Number(input.score_cap) > 1000000000) throw new ApiError(400, "Use a valid slug, era and whole-number score cap.");
  return { slug, title: string(input.title, 80, 2), era: String(input.era), genre: string(input.genre, 80),
    description: string(input.description, 2000), controls: string(input.controls, 1000), ai_credit: string(input.ai_credit, 300),
    score_label: string(input.score_label, 40, 1), score_cap: Number(input.score_cap) };
}
async function file(env: Bindings, path: unknown, owner: string, html: boolean) {
  if (typeof path !== "string" || path.length > 256) throw new ApiError(400, "Choose an uploaded file.");
  const row = await env.ARCADE_DB.prepare("SELECT path,content_type FROM storage_files WHERE path = ? AND user_id = ? AND complete = 1").bind(path, owner).first<{ path: string; content_type: string }>();
  if (!row || (row.content_type === "text/html") !== html) throw new ApiError(400, "Use your own complete HTML and artwork files.");
  return row.path;
}
export async function createSubmission(env: Bindings, input: Input, user: { id: string; isGuest: boolean; emailVerified: boolean }) {
  if (user.isGuest || !user.emailVerified) throw new ApiError(403, "Use an optional verified account to submit a game.");
  const allowed = ["user_id", "game_id", "slug", "title", "era", "genre", "description", "controls", "ai_credit", "score_label", "score_cap", "manifest", "checklist", "html_path", "art_path", "version"];
  if (Object.keys(input).some(k => !allowed.includes(k)) || input.user_id !== user.id) throw new ApiError(403, "Submit a pending game for your own account.");
  const meta = metadata(input), entries = manifest(input.manifest);
  if (!input.checklist || typeof input.checklist !== "object" || Array.isArray(input.checklist)) throw new ApiError(400, "Complete the test flight checklist.");
  const checklist = input.checklist as Input;
  if (Object.keys(checklist).some(k => !["ready", "score", "achievement", "save"].includes(k)) ||
    Object.values(checklist).some(v => typeof v !== "boolean") || checklist.ready !== true || checklist.score !== true) throw new ApiError(400, "Test flight must report READY and SCORE.");
  const html = await file(env, input.html_path, user.id, true);
  const art = input.art_path == null ? null : await file(env, input.art_path, user.id, false);
  let gameId: string | null = null;
  if (input.game_id != null) {
    if (typeof input.game_id !== "string" || input.game_id.length > 128) throw new ApiError(400, "Choose a valid game ID.");
    const game = await env.ARCADE_DB.prepare("SELECT id,created_by,slug FROM games WHERE id = ?").bind(input.game_id).first<{ id: string; created_by: string; slug: string }>();
    if (!game || game.created_by !== user.id || game.slug !== meta.slug) throw new ApiError(403, "Only the creator can submit a new version of this game.");
    gameId = game.id;
  } else {
    if (!art) throw new ApiError(400, "New games need key artwork.");
    if (await env.ARCADE_DB.prepare("SELECT id FROM games WHERE slug = ?").bind(meta.slug).first()) throw new ApiError(409, "That game slug already exists.");
  }
  if (!Number.isInteger(input.version) || Number(input.version) < 1 || Number(input.version) > 1000000) throw new ApiError(400, "Choose a valid version.");
  const previous = await env.ARCADE_DB.prepare("SELECT max(version) AS version FROM game_submissions WHERE user_id = ? AND slug = ?").bind(user.id, meta.slug).first<{ version: number | null }>();
  if (previous?.version != null && Number(input.version) <= previous.version) throw new ApiError(409, "Choose a version newer than your previous submission.");
  const columns = ["id", "user_id", "game_id", ...Object.keys(meta), "manifest", "checklist", "html_path", "art_path", "version", "created_at"];
  const values = [crypto.randomUUID(), user.id, gameId, ...Object.values(meta), JSON.stringify(entries), JSON.stringify(checklist), html, art, input.version, new Date().toISOString()];
  try {
    const saved = await env.ARCADE_DB.prepare(`INSERT INTO game_submissions (${columns.join(",")}) SELECT ${values.map(() => "?").join(",")}
      WHERE (SELECT count(*) FROM game_submissions WHERE user_id = ? AND status = 'pending') < 3 RETURNING id`).bind(...values, user.id).first();
    if (!saved) throw new ApiError(429, "You already have three games awaiting review.");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (await env.ARCADE_DB.prepare("SELECT id FROM game_submissions WHERE status = 'pending' AND (slug = ? OR game_id = ?)").bind(meta.slug, gameId).first()) throw new ApiError(409, "This game already has a pending submission.");
    throw error;
  }
  return json({ data: null });
}

export async function reviewSubmission(env: Bindings, args: Input) {
  if (Object.keys(args).some(k => !["p_submission_id", "p_approve", "p_note"].includes(k)) || typeof args.p_submission_id !== "string" || typeof args.p_approve !== "boolean") throw new ApiError(400, "Choose a submission and a review outcome.");
  const note = string(args.p_note, 2000);
  const sub = await env.ARCADE_DB.prepare("SELECT * FROM game_submissions WHERE id = ?").bind(args.p_submission_id).first<Submission>();
  if (!sub) throw new ApiError(404, "This submission was not found.");
  if (sub.status !== "pending") throw new ApiError(409, "This submission was already reviewed.");
  const now = new Date().toISOString();
  if (!args.p_approve) {
    if (!note) throw new ApiError(400, "Include a reason for rejection.");
    await env.ARCADE_DB.prepare("UPDATE game_submissions SET status = 'rejected',review_note = ?,reviewed_at = ? WHERE id = ? AND status = 'pending'").bind(note, now, sub.id).run();
    return json({ data: null });
  }
  const meta = metadata(sub), entries = manifest(JSON.parse(sub.manifest));
  await file(env, sub.html_path, sub.user_id, true);
  if (sub.art_path) await file(env, sub.art_path, sub.user_id, false);
  const gameId = sub.game_id ?? crypto.randomUUID();
  if (sub.game_id) {
    const game = await env.ARCADE_DB.prepare("SELECT created_by,slug FROM games WHERE id = ?").bind(gameId).first<{ created_by: string; slug: string }>();
    if (!game || game.created_by !== sub.user_id || game.slug !== sub.slug) throw new ApiError(409, "The original game identity changed. Review this submission again.");
  } else if (await env.ARCADE_DB.prepare("SELECT id FROM games WHERE slug = ?").bind(sub.slug).first()) throw new ApiError(409, "This slug now belongs to another game.");
  const publicPath = (path: string) => "/api/storage/games/" + path.split("/").map(encodeURIComponent).join("/");
  const guard = "EXISTS (SELECT 1 FROM game_submissions WHERE id = ? AND status = 'pending')";
  const statements: D1PreparedStatement[] = [];
  if (sub.game_id) {
    statements.push(env.ARCADE_DB.prepare(`UPDATE games SET title=?,era=?,genre=?,description=?,controls=?,ai_credit=?,score_label=?,score_cap=?,html_path=?,art_url=coalesce(?,art_url),track='B',status='published'
      WHERE id=? AND ${guard}`).bind(meta.title,meta.era,meta.genre,meta.description,meta.controls,meta.ai_credit,meta.score_label,meta.score_cap,publicPath(sub.html_path),sub.art_path ? publicPath(sub.art_path) : null,gameId,sub.id));
  } else {
    const columns = ["id", ...Object.keys(meta), "html_path", "art_url", "created_by", "track", "status", "created_at", "data_origin"];
    const values = [gameId, ...Object.values(meta), publicPath(sub.html_path), sub.art_path ? publicPath(sub.art_path) : null, sub.user_id, "B", "published", now, "new"];
    statements.push(env.ARCADE_DB.prepare(`INSERT INTO games (${columns.join(",")}) SELECT ${values.map(() => "?").join(",")} WHERE ${guard}`).bind(...values,sub.id));
  }
  // Deactivate removed definitions. Preserve UUIDs, existing unlock rows and
  // award history instead of deleting player records during a version update.
  statements.push(env.ARCADE_DB.prepare(`UPDATE achievements SET active = 0 WHERE game_id = ? AND ${guard}`).bind(gameId,sub.id));
  entries.forEach((entry, order) => statements.push(env.ARCADE_DB.prepare(`INSERT INTO achievements (id,game_id,slug,name,hint,description,xp,sort_order,active)
    SELECT ?,?,?,?,?,?,?,?,1 WHERE ${guard} ON CONFLICT(game_id,slug) DO UPDATE SET name=excluded.name,hint=excluded.hint,description=excluded.description,xp=excluded.xp,sort_order=excluded.sort_order,active=1`)
    .bind(crypto.randomUUID(),gameId,entry.slug,entry.name,entry.hint,entry.hint,entry.xp,order+1,sub.id)));
  statements.push(env.ARCADE_DB.prepare(`INSERT INTO user_badges (user_id,badge_slug,detail,earned_at) SELECT ?,'creator',?,? WHERE ${guard} ON CONFLICT DO NOTHING`).bind(sub.user_id,meta.title,now,sub.id));
  statements.push(env.ARCADE_DB.prepare("UPDATE game_submissions SET game_id=?,status='approved',review_note=?,reviewed_at=? WHERE id=? AND status='pending'").bind(gameId,note,now,sub.id));
  await env.ARCADE_DB.batch(statements);
  return json({ data: null });
}
