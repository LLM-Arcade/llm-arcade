import { readClerkIdentity, readVerifiedClerkEmail, type ClerkBindings } from "./clerk-auth.ts";

export interface Bindings extends ClerkBindings {
  ARCADE_DB: D1Database;
  APP_ORIGIN: string;
  INITIAL_ADMIN_EMAIL?: string;
}
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

async function guestBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ApiError(415, "Send JSON for this request.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Send a JSON object.");
  let text = "", size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1024) { await reader.cancel(); throw new ApiError(413, "This request is too large."); }
    text += decoder.decode(value, { stream: true });
  }
  try {
    const input = JSON.parse(text + decoder.decode());
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    return input as { username?: unknown };
  } catch { throw new ApiError(400, "Send a JSON object."); }
}

const SESSION = "__Host-arcade_session";
const SESSION_SECONDS = 30 * 86400;
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (value: string) => encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const cookie = (name: string, value: string, seconds: number) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
function getCookie(request: Request, name: string) {
  const found = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1);
  return found && /^[A-Za-z0-9_-]{43}$/.test(found) ? found : null;
}
function withCookies(response: Response, ...values: string[]) {
  for (const value of values) response.headers.append("Set-Cookie", value);
  return response;
}
export function requireOrigin(request: Request, env: Bindings) {
  if (request.headers.get("origin") !== new URL(env.APP_ORIGIN).origin) throw new ApiError(403, "This request origin is not allowed.");
}
interface Player { id: string; username: string; name: string; email: string | null; emailVerified: number; image: string | null; role: string; xp: number; level: number; createdAt: string; clerk_id?: string | null }
export async function getGuestSession(request: Request, env: Bindings) {
  const raw = getCookie(request, SESSION);
  if (!raw) return null;
  const row = await env.ARCADE_DB.prepare(`SELECT u.*, s.expires_at AS session_expiry FROM auth_sessions s
    JOIN "user" u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
    .bind(await digest(raw), Date.now()).first<Player & { session_expiry: number }>();
  if (!row) return null;
  const { session_expiry, clerk_id: _privateClerkSubject, ...user } = row;
  // An old guest cookie must not authenticate an account after it is linked.
  if (row.email || row.clerk_id) return null;
  return { session: { expiresAt: new Date(session_expiry).toISOString() }, user: { ...user, emailVerified: false, isGuest: true } };
}
export async function getSession(request: Request, env: Bindings) {
  if (!request.headers.has("authorization")) return getGuestSession(request, env);
  const identity = await readClerkIdentity(request, env);
  if (!identity) throw new ApiError(401, "Sign in again to use this account.");
  const row = await env.ARCADE_DB.prepare('SELECT * FROM "user" WHERE clerk_id = ?').bind(identity.subject).first<Player>();
  if (!row) return null;
  const { clerk_id: _privateClerkSubject, ...user } = row;
  return { session: { expiresAt: null }, user: { ...user, emailVerified: user.emailVerified === 1, isGuest: false } };
}

// Invoke only after the Clerk SDK verifies identity and primary email.
// Never from signup input, a matching email alone, or a client-provided role.
export async function bootstrapVerifiedOwner(env: Bindings, userId: string) {
  const owner = env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (!owner) return;
  await env.ARCADE_DB.prepare(`UPDATE "user" SET role = 'admin' WHERE id = ? AND lower(email) = ?
    AND emailVerified = 1 AND clerk_id IS NOT NULL AND role = 'player'
    AND NOT EXISTS (SELECT 1 FROM "user" WHERE role = 'admin' AND id <> ?)`)
    .bind(userId, owner, userId).run();
}
export async function rateLimit(request: Request, env: Bindings, path: string) {
  // Edge-observed IP is pseudonymized in the private database, not made
  // anonymous. No new credential is needed for email-free guest cards.
  const identity = await digest(`${env.APP_ORIGIN}:${Math.floor(Date.now() / 86400000)}:${request.headers.get("cf-connecting-ip") ?? "unknown"}:${path}`);
  const result = await env.ARCADE_DB.prepare(`INSERT INTO auth_rate_limits (identity, bucket, count) VALUES (?, ?, 1)
    ON CONFLICT (identity, bucket) DO UPDATE SET count = count + 1 RETURNING count`)
    .bind(identity, Math.floor(Date.now() / 60000)).first<{ count: number }>();
  if (!result || result.count > 10) throw new ApiError(429, "Too many requests. Wait a minute and try again.");
}

export async function authRoute(request: Request, env: Bindings): Promise<Response> {
  const origin = new URL(env.APP_ORIGIN).origin;
  if (!origin.startsWith("https://")) throw new ApiError(503, "The approved HTTPS origin is not configured.");
  const url = new URL(request.url), path = url.pathname.replace(/^\/api\/auth/, "");
  if (request.method === "GET" && path === "/get-session") return json(await getSession(request, env));
  if (request.method === "POST" && path === "/account") {
    requireOrigin(request, env);
    const identity = await readClerkIdentity(request, env);
    if (!identity) throw new ApiError(401, "Sign in with Clerk before linking an account.");
    const email = await readVerifiedClerkEmail(identity);
    if (!email) throw new ApiError(403, "Verify your primary email before linking your player card.");
    const existing = await env.ARCADE_DB.prepare('SELECT id FROM "user" WHERE clerk_id = ?').bind(identity.subject).first<{ id: string }>();
    const guest = await getGuestSession(request, env);
    let userId = existing?.id;
    if (!userId) {
      if (await env.ARCADE_DB.prepare('SELECT id FROM "user" WHERE email = ?').bind(email).first()) throw new ApiError(409, "This recovered account needs a reviewed migration before it can be linked.");
      userId = guest?.user.id ?? crypto.randomUUID();
      const username = guest?.user.username ?? "player_" + userId.replace(/-/g, "").slice(0, 12);
      if (guest) {
        const linked = await env.ARCADE_DB.batch([
          env.ARCADE_DB.prepare('UPDATE "user" SET clerk_id = ?, email = ?, emailVerified = 1 WHERE id = ? AND clerk_id IS NULL AND email IS NULL RETURNING id')
            .bind(identity.subject, email, userId),
          env.ARCADE_DB.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND EXISTS (SELECT 1 FROM "user" WHERE id = ? AND clerk_id = ?)')
            .bind(userId, userId, identity.subject),
        ]);
        if (!linked[0].meta.changes) throw new ApiError(409, "This guest card was already linked. Refresh your account before continuing.");
      } else await env.ARCADE_DB.prepare('INSERT INTO "user" (id, clerk_id, username, name, email, emailVerified, role, createdAt) VALUES (?, ?, ?, ?, ?, 1, \'player\', ?)')
        .bind(userId, identity.subject, username, username, email, new Date().toISOString()).run();
    }
    await bootstrapVerifiedOwner(env, userId);
    const response = json({ data: { user_id: userId, linkedGuest: guest?.user.id === userId,
      separateGuestCard: Boolean(guest && guest.user.id !== userId) } });
    return guest?.user.id === userId ? withCookies(response, cookie(SESSION, "", 0)) : response;
  }
  if (request.method === "POST" && path === "/guest") {
    requireOrigin(request, env);
    const input = await guestBody(request);
    const existing = await getSession(request, env);
    if (existing) return json(existing);
    await rateLimit(request, env, path);
    const id = crypto.randomUUID();
    const username = input.username === undefined ? "guest_" + id.replace(/-/g, "").slice(0, 12)
      : typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
    if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new ApiError(400, "Choose a username of 3–24 letters, numbers or underscores.");
    if (await env.ARCADE_DB.prepare('SELECT id FROM "user" WHERE username = ?').bind(username).first()) throw new ApiError(409, "That username is already taken.");
    const raw = token();
    await env.ARCADE_DB.batch([
      env.ARCADE_DB.prepare('INSERT INTO "user" (id, username, name, role, createdAt) VALUES (?, ?, ?, \'player\', ?)')
        .bind(id, username, username, new Date().toISOString()),
      env.ARCADE_DB.prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .bind(await digest(raw), id, Date.now() + SESSION_SECONDS * 1000),
    ]);
    return withCookies(json({ success: true }), cookie(SESSION, raw, SESSION_SECONDS));
  }
  if (request.method === "POST" && path === "/sign-out") {
    requireOrigin(request, env);
    // Account sessions are Clerk-managed bearer tokens. Do not erase an
    // independent guest card when the frontend signs out of its Clerk account.
    if (request.headers.has("authorization")) return json({ success: true });
    const raw = getCookie(request, SESSION);
    if (raw) await env.ARCADE_DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await digest(raw)).run();
    return withCookies(json({ success: true }), cookie(SESSION, "", 0));
  }
  throw new ApiError(404, "This authentication route was not found.");
}
