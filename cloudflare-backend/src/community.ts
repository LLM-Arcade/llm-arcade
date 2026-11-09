import { ApiError, getSession, json, requireOrigin, rateLimit, type Bindings } from "./auth";
import { createSubmission } from "./submissions";

type Input = Record<string, unknown>;
type Filter = { column: string; op: "eq" | "ilike"; value: string | number | boolean | null };
type Order = { column: string; ascending: boolean };
interface Model { source: string; columns: readonly string[]; admin?: boolean; json?: string[] }
const publicProfiles = "id, username, display_name, avatar_url, bio, role, xp, level, streak_days, best_streak, last_play_date, created_at";
const models: Record<string, Model> = {
  profiles: { source: `SELECT ${publicProfiles} FROM profiles`, columns: publicProfiles.split(", ") },
  ratings: { source: "SELECT user_id, game_id, rating, updated_at FROM ratings", columns: ["user_id", "game_id", "rating", "updated_at"] },
  favorites: { source: "SELECT user_id, game_id, created_at FROM favorites", columns: ["user_id", "game_id", "created_at"] },
  follows: { source: "SELECT follower_id, followee_id, created_at FROM follows", columns: ["follower_id", "followee_id", "created_at"] },
  comments: { source: `SELECT c.id, c.user_id, c.game_id, c.parent_id, c.body, c.created_at,
    json_object('username',p.username,'display_name',p.username,'avatar_url',p.avatar_url,'role',p.role) AS profiles
    FROM comments c JOIN profiles p ON p.id = c.user_id`, columns: ["id", "user_id", "game_id", "parent_id", "created_at"], json: ["profiles"] },
  games: { source: "SELECT * FROM games", columns: ["id", "slug", "title", "status", "featured", "created_by", "created_at"] },
  site_settings: { source: "SELECT * FROM site_settings", columns: ["id"] },
  achievements: { source: "SELECT * FROM achievements WHERE active = 1", columns: ["id", "game_id", "slug", "sort_order"] },
  user_badges: { source: `SELECT ub.user_id,ub.badge_slug,ub.detail,ub.earned_at,
    json_object('slug',b.slug,'name',b.name,'description',b.description,'rarity',b.rarity,'icon',b.icon,'sort_order',b.sort_order) AS badges
    FROM user_badges ub JOIN badges b ON b.slug = ub.badge_slug`, columns: ["user_id", "badge_slug", "earned_at"], json: ["badges"] },
  user_achievements: { source: `SELECT ua.user_id,ua.achievement_id,ua.unlocked_at,a.game_id AS "achievements.game_id",
    json_object('name',a.name,'xp',a.xp,'game_id',a.game_id,'games',json_object('slug',g.slug,'title',g.title)) AS achievements
    FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id JOIN games g ON g.id = a.game_id WHERE a.active = 1`,
    columns: ["user_id", "achievement_id", "unlocked_at", "achievements.game_id"], json: ["achievements"] },
  activity_events: { source: `SELECT e.id,e.user_id,e.game_id,e.type,e.data,e.created_at,
    json_object('username',p.username,'display_name',p.username,'avatar_url',p.avatar_url) AS profiles,
    CASE WHEN g.id IS NULL THEN NULL ELSE json_object('slug',g.slug,'title',g.title) END AS games
    FROM activity_events e JOIN profiles p ON p.id = e.user_id LEFT JOIN games g ON g.id = e.game_id`,
    columns: ["id", "user_id", "game_id", "type", "created_at"], json: ["data", "profiles", "games"] },
  waitlist: { source: "SELECT email, created_at FROM waitlist", columns: ["email", "created_at"], admin: true },
  playtest_applications: { source: "SELECT * FROM playtest_applications", columns: ["id", "email", "status", "created_at"], admin: true, json: ["devices", "favorite_eras"] },
  game_submissions: { source: `SELECT s.*,json_object('username',p.username) AS profiles FROM game_submissions s JOIN profiles p ON p.id = s.user_id`,
    columns: ["id", "user_id", "game_id", "slug", "status", "created_at"], json: ["manifest", "checklist", "profiles"] },
};

function text(value: unknown, max: number, label: string, min = 1): string {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new ApiError(400, `Send a valid ${label}.`);
  return value.trim();
}
function only(input: Input, columns: string[]) {
  if (Object.keys(input).some(key => !columns.includes(key))) throw new ApiError(400, "This request contains unsupported fields.");
}
function record(value: unknown): Input {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "Send one record.");
  return value as Input;
}
function email(value: unknown) {
  const address = text(value, 254, "email address").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new ApiError(400, "Send a valid email address.");
  return address;
}
function filters(input: Input, model: Model) {
  if (!Array.isArray(input.filters) || input.filters.length > 8) throw new ApiError(400, "Send supported filters.");
  return input.filters.map(value => {
    const f = record(value);
    if (!model.columns.includes(String(f.column)) || !["eq", "ilike"].includes(String(f.op)) ||
      !["string", "number", "boolean"].includes(typeof f.value) && f.value !== null ||
      typeof f.value === "string" && f.value.length > 256) throw new ApiError(400, "This filter is not supported.");
    if (f.op === "ilike" && (f.column !== "username" || typeof f.value !== "string" || new TextEncoder().encode(f.value).length > 50)) throw new ApiError(400, "This search is not supported.");
    return f as unknown as Filter;
  });
}
function filterValue(list: Filter[], key: string) {
  const value = list.find(f => f.column === key && f.op === "eq")?.value;
  return typeof value === "string" ? value : null;
}
export async function player(request: Request, env: Bindings) {
  const session = await getSession(request, env);
  if (!session) throw new ApiError(401, "Use your guest card or sign in to continue.");
  return session.user;
}
export async function admin(request: Request, env: Bindings) {
  const user = await player(request, env);
  if (user.isGuest || user.role !== "admin" || !user.emailVerified) throw new ApiError(403, "Administrator access is required.");
  return user;
}
function own(input: Input, userId: string, key = "user_id") {
  if (input[key] !== undefined && input[key] !== userId) throw new ApiError(403, "You can only change your own records.");
}
async function socialGame(env: Bindings, value: unknown) {
  const id = text(value, 128, "game ID");
  // Coming-soon cabinets deliberately invite discussion, ratings and favorites
  // in GamePlayer. Gameplay scores and unlocks retain their published-only gate.
  if (!await env.ARCADE_DB.prepare("SELECT id FROM games WHERE id = ? AND status <> 'archived'").bind(id).first()) throw new ApiError(404, "This game is not available.");
  return id;
}

export async function communityQuery(request: Request, env: Bindings, input: Input): Promise<Response> {
  requireOrigin(request, env);
  only(input, ["table", "operation", "filters", "orders", "limit", "offset", "single", "head", "values"]);
  const table = typeof input.table === "string" ? input.table : "";
  const model = Object.hasOwn(models, table) ? models[table] : undefined;
  if (!model) throw new ApiError(400, "This record type is not supported.");
  const list = filters(input, model);
  if (input.operation !== "select") return mutate(request, env, input, table, list);
  if (model.admin) await admin(request, env);
  if (table === "game_submissions") {
    const user = await player(request, env);
    if (user.role !== "admin" || user.isGuest || !user.emailVerified) {
      if (filterValue(list, "user_id") && filterValue(list, "user_id") !== user.id) throw new ApiError(403, "You can only read your own submissions.");
      list.push({ column: "user_id", op: "eq", value: user.id });
    }
  }
  const values = list.filter(f => f.value !== null).map(f => typeof f.value === "boolean" ? Number(f.value) : f.value);
  const where = list.map(f => f.value === null ? `"${f.column}" IS NULL` : `"${f.column}" ${f.op === "ilike" ? "LIKE" : "="} ?`).join(" AND ");
  if (!Array.isArray(input.orders) || input.orders.length > 3) throw new ApiError(400, "Send supported ordering.");
  const orders = (input.orders as Order[]).map(o => {
    if (!o || !model.columns.includes(o.column) || typeof o.ascending !== "boolean") throw new ApiError(400, "This ordering is not supported.");
    return `"${o.column}" ${o.ascending ? "ASC" : "DESC"}`;
  });
  const limit = input.limit ?? 200;
  if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 200) throw new ApiError(400, "Choose a page size up to 200.");
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || Number(offset) < 0) throw new ApiError(400, "Choose a valid page offset.");
  const query = `FROM (${model.source}) ${where ? "WHERE " + where : ""}`;
  if (input.head === true) {
    const count = await env.ARCADE_DB.prepare(`SELECT count(*) AS n ${query}`).bind(...values).first<{ n: number }>();
    return json({ data: null, count: count?.n ?? 0 });
  }
  const rows = await env.ARCADE_DB.prepare(`SELECT * ${query} ${orders.length ? "ORDER BY " + orders.join(", ") : ""} LIMIT ? OFFSET ?`).bind(...values, limit, offset).all();
  const data = rows.results.map(row => {
    for (const key of model.json ?? []) if (typeof row[key] === "string") row[key] = JSON.parse(row[key] as string);
    if (table === "site_settings") row.launched = Boolean(row.launched);
    if (table === "games") row.featured = Boolean(row.featured);
    return row;
  });
  if (input.single && data.length > 1) throw new ApiError(409, "This lookup matched more than one record.");
  if (input.single === "required" && !data.length) throw new ApiError(404, "This record was not found.");
  return json({ data: input.single ? data[0] ?? null : data });
}

async function mutate(request: Request, env: Bindings, query: Input, table: string, list: Filter[]): Promise<Response> {
  const operation = query.operation;
  const now = new Date().toISOString();
  if (["waitlist", "playtest_applications"].includes(table) && operation === "insert") {
    await rateLimit(request, env, table);
    const input = record(query.values);
    // Form email is collected only when a player explicitly submits this form.
    // Ordinary guest play does not collect email.
    const address = email(input.email);
    if (table === "waitlist") {
      only(input, ["email"]);
      await env.ARCADE_DB.prepare("INSERT INTO waitlist VALUES (?, ?) ON CONFLICT (email) DO NOTHING").bind(address, now).run();
    } else {
      only(input, ["name", "email", "devices", "hours_per_week", "favorite_eras"]);
      const name = text(input.name, 80, "name");
      if (!Array.isArray(input.devices) || !input.devices.length || input.devices.length > 3 || input.devices.some(d => !["Desktop", "Phone", "Tablet"].includes(d))) throw new ApiError(400, "Choose supported devices.");
      if (!Array.isArray(input.favorite_eras) || input.favorite_eras.length > 12 || input.favorite_eras.some(e => typeof e !== "string" || e.length > 32)) throw new ApiError(400, "Choose valid eras.");
      const hours = input.hours_per_week == null ? null : text(input.hours_per_week, 40, "hours");
      await env.ARCADE_DB.prepare(`INSERT INTO playtest_applications (id,name,email,devices,hours_per_week,favorite_eras,created_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING`).bind(crypto.randomUUID(), name, address, JSON.stringify(input.devices), hours, JSON.stringify(input.favorite_eras), now).run();
    }
    return json({ data: null });
  }
  const user = await player(request, env);
  if (table === "game_submissions" && operation === "insert") return createSubmission(env, record(query.values), user);
  if (["favorites", "follows", "comments", "ratings"].includes(table)) {
    const ownerKey = table === "follows" ? "follower_id" : "user_id";
    const requestedOwner = filterValue(list, ownerKey);
    if (requestedOwner && requestedOwner !== user.id) throw new ApiError(403, "You can only change your own records.");
    if (operation === "delete") {
      if (table === "comments") {
        const id = text(filterValue(list, "id"), 128, "comment ID");
        const found = await env.ARCADE_DB.prepare("SELECT user_id FROM comments WHERE id = ?").bind(id).first<{ user_id: string }>();
        if (found && found.user_id !== user.id) throw new ApiError(403, "You can only delete your own comment.");
        await env.ARCADE_DB.prepare("UPDATE comments SET body = '[deleted]', deleted = 1 WHERE id = ? AND user_id = ?").bind(id, user.id).run();
      } else {
        const other = table === "follows" ? "followee_id" : "game_id";
        const value = text(filterValue(list, other), 128, other);
        await env.ARCADE_DB.prepare(`DELETE FROM ${table} WHERE ${ownerKey} = ? AND ${other} = ?`).bind(user.id, value).run();
      }
      return json({ data: null });
    }
    if (operation !== "insert" && !(table === "ratings" && operation === "upsert")) throw new ApiError(400, "This operation is not supported.");
    const input = record(query.values);
    own(input, user.id, ownerKey);
    if (table === "follows") {
      only(input, ["follower_id", "followee_id"]);
      const target = text(input.followee_id, 128, "player ID");
      if (target === user.id) throw new ApiError(400, "Choose another player to follow.");
      if (!await env.ARCADE_DB.prepare('SELECT id FROM "user" WHERE id = ?').bind(target).first()) throw new ApiError(404, "This player was not found.");
      await env.ARCADE_DB.prepare("INSERT INTO follows VALUES (?, ?, ?) ON CONFLICT DO NOTHING").bind(user.id, target, now).run();
    } else {
      const gameId = await socialGame(env, input.game_id);
      if (table === "ratings") {
        only(input, ["user_id", "game_id", "rating", "updated_at"]);
        if (!Number.isInteger(input.rating) || Number(input.rating) < 1 || Number(input.rating) > 5) throw new ApiError(400, "Choose a rating from 1 to 5.");
        await env.ARCADE_DB.prepare(`INSERT INTO ratings VALUES (?, ?, ?, ?) ON CONFLICT(user_id, game_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`).bind(user.id, gameId, input.rating, now).run();
      } else if (table === "favorites") {
        only(input, ["user_id", "game_id"]);
        await env.ARCADE_DB.prepare("INSERT INTO favorites VALUES (?, ?, ?) ON CONFLICT DO NOTHING").bind(user.id, gameId, now).run();
      } else {
        only(input, ["user_id", "game_id", "parent_id", "body"]);
        const content = text(input.body, 1000, "comment");
        const parent = input.parent_id == null ? null : text(input.parent_id, 128, "parent comment ID");
        if (parent && !await env.ARCADE_DB.prepare("SELECT id FROM comments WHERE id = ? AND game_id = ? AND parent_id IS NULL").bind(parent, gameId).first()) throw new ApiError(400, "Reply to a top-level comment on this game.");
        const saved = await env.ARCADE_DB.prepare(`INSERT INTO comments (id,user_id,game_id,parent_id,body,created_at)
          SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM comments WHERE user_id = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-' || max(1,(SELECT slow_mode_seconds FROM site_settings WHERE id = 1)) || ' seconds')) RETURNING id`)
          .bind(crypto.randomUUID(), user.id, gameId, parent, content, now, user.id).first();
        if (!saved) throw new ApiError(429, "Wait a moment before posting another comment.");
      }
    }
    return json({ data: null });
  }
  if (table === "profiles" && operation === "update") {
    if (filterValue(list, "id") !== user.id) throw new ApiError(403, "You can only edit your own profile.");
    const input = record(query.values);
    only(input, ["username", "display_name", "bio", "avatar_url"]);
    const username = input.username === undefined ? user.username : text(input.username, 24, "username", 3).toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new ApiError(400, "Use letters, numbers and underscores for your username.");
    const bio = input.bio === undefined ? null : text(input.bio, 300, "bio", 0);
    const name = input.display_name === undefined ? null : input.display_name === null ? username : text(input.display_name, 60, "player name", 0) || username;
    const image = input.avatar_url == null ? null : text(input.avatar_url, 2048, "avatar URL");
    if (image && !image.startsWith("https://")) throw new ApiError(400, "Use an HTTPS avatar URL.");
    if (await env.ARCADE_DB.prepare('SELECT id FROM "user" WHERE username = ? AND id <> ?').bind(username, user.id).first()) throw new ApiError(409, "That username is already taken.");
    await env.ARCADE_DB.prepare('UPDATE "user" SET username = ?, name = coalesce(?, name), bio = coalesce(?, bio), image = CASE WHEN ? THEN ? ELSE image END WHERE id = ?')
      .bind(username, name, bio, Number(Object.hasOwn(input, "avatar_url")), image, user.id).run();
    return json({ data: null });
  }
  throw new ApiError(400, "This record cannot be changed directly.");
}
