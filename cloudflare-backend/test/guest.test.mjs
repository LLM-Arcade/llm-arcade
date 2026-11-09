import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, cookies } from "./fixture.mjs";

test("email-free guests receive usernames and browser-bound persistent scores without any provider credentials", async () => {
  const app = await fixture({ accounts: false });
  try {
    assert.equal(await (await app.request("/api/auth/get-session")).json(), null);
    const created = await app.post("/api/auth/guest", { username: "guest_player", email: "owner@example.test", role: "admin" });
    assert.equal(created.status, 200, await created.clone().text());
    const cookie = cookies(created);
    assert.match(created.headers.get("Set-Cookie"), /Max-Age=2592000/);
    const first = (await (await app.request("/api/me", { headers: { Cookie: cookie } })).json()).data;
    assert.equal(first.username, "guest_player");
    assert.equal(first.email, null);
    assert.equal(first.emailVerified, false);
    assert.equal(first.isGuest, true);
    assert.equal(first.role, "player");
    await app.post("/api/auth/guest", { username: "different" }, cookie);
    assert.equal((await app.db.prepare('SELECT count(*) AS n FROM "user"').first()).n, 1);
    assert.equal((await app.post("/api/auth/guest", { username: "guest_player" })).status, 409);
    assert.equal((await app.request("/api/auth/guest", { method: "POST", body: "{}", headers: { Origin: "https://evil.example.test" } })).status, 403);
    await app.db.prepare(`INSERT INTO games (id, slug, title, era, track, status, score_cap, created_at, data_origin)
      VALUES ('guest-test', 'guest-test', 'Guest Test', 'Arcade', 'A', 'published', 1000, ?, 'reconstructed')`).bind(new Date().toISOString()).run();
    const saved = await app.post("/api/scores", { game_id: "guest-test", run_id: crypto.randomUUID(), score: 77 }, cookie);
    assert.equal(saved.status, 201);
    assert.equal((await saved.json()).data.user_id, first.id);
    const best = await app.request("/api/games/guest-test/personal-best", { headers: { Cookie: cookie } });
    assert.equal((await best.json()).data.score, 77);
    await app.post("/api/profile", { username: "guest_player", name: "Private alias" }, cookie);
    const leaders = (await (await app.request("/api/games/guest-test/leaderboard")).json()).data;
    assert.equal(leaders[0].display_name, "guest_player");
    assert.equal("email" in leaders[0], false);
    assert.equal((await app.post("/api/profile", { username: "admin", name: "Admin", emailVerified: true }, cookie)).status, 400);
    await app.db.prepare("UPDATE auth_sessions SET expires_at = ?").bind(Date.now() - 1).run();
    assert.equal((await app.request("/api/me", { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM scores").first()).n, 1, "Expiring guest access does not delete scores");
    assert.equal((await app.request("/api/auth/google")).status, 404, "The superseded Google flow is not exposed");
  } finally { await app.runtime.dispose(); }
});
