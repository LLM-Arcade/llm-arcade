import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, cookies } from "./fixture.mjs";

test("coming-soon cabinets keep social actions while scores and unlocks stay gated", async () => {
  const app = await fixture({ accounts: false });
  try {
    const cookie = cookies(await app.post("/api/auth/guest", { username: "upcoming_fan" }));
    await app.db.batch(["coming_soon", "archived"].map(status => app.db.prepare(`INSERT INTO games
      (id,slug,title,era,track,status,score_cap,created_at,data_origin) VALUES (?,?,?,'Arcade','A',?,1000,?,'reconstructed')`)
      .bind(status, status.replace("_", "-"), status, status, new Date().toISOString())));
    const social = (table, gameId, values) => app.post("/api/community/query", {
      table, operation: table === "ratings" ? "upsert" : "insert", filters: [], orders: [], values: { game_id: gameId, ...values },
    }, cookie);
    for (const [table, values] of [["ratings", { rating: 4 }], ["favorites", {}], ["comments", { body: "Looking forward to this cabinet." }]]) {
      const response = await social(table, "coming_soon", values);
      assert.equal(response.status, 200, table + ": " + await response.clone().text());
      assert.equal((await social(table, "archived", values)).status, 404);
    }
    assert.equal((await app.post("/api/scores", { game_id: "coming_soon", run_id: crypto.randomUUID(), score: 10 }, cookie)).status, 404);
    await app.db.prepare("INSERT INTO achievements (id,game_id,slug,name,xp) VALUES ('coming-unlock','coming_soon','first-step','First Step',10)").run();
    assert.equal((await app.post("/api/community/rpc", { name: "unlock_achievement", args: { p_game_id: "coming_soon", p_slug: "first-step" } }, cookie)).status, 400);
  } finally { await app.runtime.dispose(); }
});

test("community records preserve guest ownership, public privacy, reply integrity and admin-only signups", async () => {
  const app = await fixture();
  try {
    const guestCookie = cookies(await app.post("/api/auth/guest", { username: "guest_social" }));
    const guest = (await (await app.request("/api/me", { headers: { Cookie: guestCookie } })).json()).data;
    const bob = await app.login({ sub: "user_bob", email: "bob@example.test" });
    const owner = await app.login({ sub: "user_owner", email: "owner@example.test" });
    await app.db.prepare(`INSERT INTO games (id, slug, title, era, track, status, score_cap, created_at, data_origin)
      VALUES ('social', 'social', 'Social', 'Arcade', 'A', 'published', 1000, ?, 'reconstructed')`).bind(new Date().toISOString()).run();
    const query = (table, operation = "select", values, auth = guestCookie, filters = [], rest = {}) =>
      app.post("/api/community/query", { table, operation, values, filters, orders: [], ...rest }, auth);
    const eq = (column, value) => ({ column, value, op: "eq" });
    assert.equal((await query("ratings", "upsert", { user_id: guest.id, game_id: "social", rating: 4 })).status, 200);
    assert.equal((await query("ratings", "upsert", { user_id: bob.user.id, game_id: "social", rating: 5 })).status, 403);
    assert.equal((await query("ratings", "upsert", { game_id: "social", rating: 6 })).status, 400);
    assert.equal((await query("ratings", "upsert", { game_id: "social", rating: 2 })).status, 200);
    assert.equal((await (await query("ratings")).json()).data[0].rating, 2);
    assert.equal((await query("favorites", "insert", { game_id: "social", user_id: guest.id })).status, 200);
    assert.equal((await query("favorites", "delete", undefined, bob.auth, [eq("game_id", "social"), eq("user_id", guest.id)])).status, 403);
    assert.equal((await query("follows", "insert", { follower_id: guest.id, followee_id: bob.user.id })).status, 200);
    const counts = await query("follows", "select", undefined, "", [eq("followee_id", bob.user.id)], { head: true, limit: 1 });
    assert.equal((await counts.json()).count, 1);
    assert.equal((await query("follows", "insert", { followee_id: guest.id })).status, 400);
    assert.equal((await query("comments", "insert", { game_id: "social", body: "Hello from a guest", user_id: guest.id })).status, 200);
    const thread = (await (await query("comments")).json()).data;
    assert.equal(thread[0].profiles.username, "guest_social");
    assert.equal("email" in thread[0].profiles, false);
    assert.equal((await query("comments", "insert", { game_id: "social", body: "too soon" })).status, 429);
    assert.equal((await query("comments", "insert", { game_id: "social", body: "reply", parent_id: thread[0].id }, bob.auth)).status, 200);
    assert.equal((await query("comments", "delete", undefined, bob.auth, [eq("id", thread[0].id)])).status, 403);
    assert.equal((await query("comments", "delete", undefined, guestCookie, [eq("id", thread[0].id)])).status, 200);
    assert.equal((await app.db.prepare("SELECT body FROM comments WHERE id = ?").bind(thread[0].id).first()).body, "[deleted]");
    assert.equal((await query("profiles", "update", { username: "guest_renamed", display_name: "Private name", bio: "Public bio" }, guestCookie, [eq("id", guest.id)])).status, 200);
    assert.equal((await query("profiles", "update", { role: "admin" }, guestCookie, [eq("id", guest.id)])).status, 400);
    assert.equal((await query("profiles", "update", { bio: "stolen" }, guestCookie, [eq("id", bob.user.id)])).status, 403);
    const publicCard = (await (await query("profiles", "select", undefined, "", [eq("id", guest.id)], { single: "optional" })).json()).data;
    assert.equal(publicCard.display_name, "guest_renamed");
    assert.equal(publicCard.bio, "Public bio");
    for (const key of ["name", "email", "emailVerified", "clerk_id"]) assert.equal(key in publicCard, false);
    assert.equal((await query("waitlist", "insert", { email: "opt-in@example.test" }, "")).status, 200);
    assert.equal((await query("waitlist", "select", undefined, guestCookie)).status, 403);
    assert.equal((await query("waitlist", "select", undefined, bob.auth)).status, 403);
    assert.equal((await (await query("waitlist", "select", undefined, owner.auth)).json()).data[0].email, "opt-in@example.test");
    assert.equal((await query("profiles", "select", undefined, "", [eq('username\"; DROP TABLE scores; --', "x")])).status, 400);
    assert.equal((await query("profiles", "select", undefined, "", [{ column: "username", op: "ilike", value: "%" + "x".repeat(60) + "%" }])).status, 400);
    assert.equal((await query("auth_sessions")).status, 400);
    assert.equal((await query("__proto__")).status, 400);
    assert.equal((await query("profiles", "select", undefined, "", [], { limit: 201 })).status, 400);
    const crossSite = await app.request("/api/community/query", { method: "POST", headers: { Origin: "https://evil.example.test" }, body: JSON.stringify({ table: "profiles", operation: "select", filters: [], orders: [] }) });
    assert.equal(crossSite.status, 403);
  } finally { await app.runtime.dispose(); }
});
