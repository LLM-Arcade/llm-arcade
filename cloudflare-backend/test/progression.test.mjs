import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, cookies } from "./fixture.mjs";

test("D1 progression keeps documented XP math, daily caps, UTC streaks and idempotent manifest awards", async () => {
  const app = await fixture({ accounts: false });
  try {
    const cookie = cookies(await app.post("/api/auth/guest", { username: "progression_guest" }));
    const user = (await (await app.request("/api/me", { headers: { Cookie: cookie } })).json()).data;
    const rpc = (name, args, auth = cookie) => app.post("/api/community/rpc", { name, args }, auth);
    await app.db.prepare(`INSERT INTO games (id,slug,title,era,track,status,score_cap,created_at,data_origin)
      VALUES ('flap','flap-hero','Flap Hero','Arcade','B','published',1000,?,'reconstructed')`).bind(new Date().toISOString()).run();
    await app.db.batch([
      app.db.prepare("INSERT INTO achievements (id,game_id,slug,name,xp) VALUES ('flight','flap','first-flight','First Flight',10)"),
      app.db.prepare("INSERT INTO achievements (id,game_id,slug,name,xp) VALUES ('distance','flap','distance','Distance',25)"),
    ]);
    const unlock = await rpc("unlock_achievement", { p_game_id: "flap", p_slug: "first-flight" });
    assert.equal(unlock.status, 200, await unlock.clone().text());
    assert.equal((await unlock.json()).data.unlocked, true);
    const run = crypto.randomUUID();
    const score = await app.post("/api/scores", { game_id: "flap", run_id: run, score: 20 }, cookie);
    assert.equal(score.status, 201, await score.clone().text());
    let profile = await app.db.prepare('SELECT xp,level,streak_days FROM "user" WHERE id = ?').bind(user.id).first();
    assert.deepEqual(profile, { xp: 220, level: 3, streak_days: 1 }, "Matches the source's verified First Flight/first score example");
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM activity_events WHERE user_id = ?").bind(user.id).first()).n, 6);
    assert.equal((await rpc("unlock_achievement", { p_game_id: "flap", p_slug: "first-flight" }).then(r => r.json())).data.unlocked, false);
    assert.equal((await app.post("/api/scores", { game_id: "flap", run_id: run, score: 20 }, cookie)).status, 200);
    assert.equal((await app.db.prepare('SELECT xp FROM "user" WHERE id = ?').bind(user.id).first()).xp, 220);
    assert.equal((await rpc("unlock_achievement", { p_game_id: "flap", p_slug: "invented", p_xp: 100000 })).status, 400);
    assert.equal((await rpc("unlock_achievement", { p_game_id: "flap", p_slug: "invented" })).status, 400);
    assert.equal((await rpc("unlock_achievement", { p_game_id: "flap", p_slug: "distance" }, "")).status, 401);
    // Exercise the trigger's daily cap with internal test inserts; the public
    // endpoint independently enforces its ten-second player/game interval.
    for (let i = 1; i <= 24; i++) {
      await app.db.prepare("INSERT INTO scores (id,user_id,game_id,run_id,score,created_at) VALUES (?,?, 'flap',?,?,?)")
        .bind("cap-" + i, user.id, "run-cap-" + i, 20 + i, new Date().toISOString()).run();
    }
    assert.equal((await app.db.prepare("SELECT sum(points) AS n FROM xp_events WHERE user_id = ? AND kind = 'score'").bind(user.id).first()).n, 200);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM xp_events WHERE user_id = ? AND kind = 'daily'").bind(user.id).first()).n, 1);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM xp_events WHERE user_id = ? AND kind = 'top_rank'").bind(user.id).first()).n, 1, "Beating your own record does not farm takeover XP");
    assert.equal((await rpc("unlock_achievement", { p_game_id: "flap", p_slug: "distance" })).status, 200);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM user_badges WHERE user_id = ? AND badge_slug = 'completionist'").bind(user.id).first()).n, 1);
    const definitions = (await (await rpc("get_game_achievements", { p_game_id: "flap" })).json()).data;
    assert.equal(definitions[0].unlock_count, 1);
    assert.equal(definitions[0].player_count, 1);
    // UTC transitions are independent of local browser timezone.
    await app.db.prepare('UPDATE "user" SET last_play_date = ?, streak_days = 6, best_streak = 6 WHERE id = ?')
      .bind(new Date(Date.now() - 86400000).toISOString().slice(0,10), user.id).run();
    await app.db.prepare("INSERT INTO scores (id,user_id,game_id,run_id,score,created_at) VALUES ('streak',?,'flap','streak',50,?)").bind(user.id, new Date().toISOString()).run();
    assert.equal((await app.db.prepare('SELECT streak_days FROM "user" WHERE id = ?').bind(user.id).first()).streak_days, 7);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM user_badges WHERE user_id = ? AND badge_slug = 'streak-keeper'").bind(user.id).first()).n, 1);
    const query = await app.post("/api/community/query", { table: "user_achievements", operation: "select", filters: [
      { column: "user_id", op: "eq", value: user.id }, { column: "achievements.game_id", op: "eq", value: "flap" },
    ], orders: [] }, cookie);
    assert.equal(query.status, 200, await query.clone().text());
    const awards = (await query.json()).data;
    assert.equal(awards.length, 2);
    assert.equal(awards[0].achievements.games.slug, "flap-hero");
    assert.deepEqual((await app.db.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally { await app.runtime.dispose(); }
});

test("administration requires verified server roles and preserves privilege boundaries", async () => {
  const app = await fixture();
  try {
    const guestCookie = cookies(await app.post("/api/auth/guest", {}));
    const bob = await app.login({ sub: "user_bob", email: "bob@example.test" });
    const owner = await app.login({ sub: "user_owner", email: "owner@example.test" });
    const rpc = (name, args, auth = owner.auth) => app.post("/api/community/rpc", { name, args }, auth);
    assert.equal((await rpc("admin_set_launched", { p_launched: true }, guestCookie)).status, 403);
    assert.equal((await rpc("admin_set_launched", { p_launched: true }, bob.auth)).status, 403);
    assert.equal((await rpc("admin_set_launched", { p_launched: true })).status, 200);
    assert.equal((await (await app.request("/api/site-settings")).json()).data.launched, true);
    assert.equal((await rpc("admin_set_role", { p_user_id: owner.user.id, p_role: "player" })).status, 400);
    assert.equal((await rpc("admin_set_role", { p_user_id: bob.user.id, p_role: "playtester" })).status, 200);
    assert.equal((await rpc("admin_set_role", { p_user_id: bob.user.id, p_role: "playtester" })).status, 200);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM user_badges WHERE user_id = ? AND badge_slug = 'playtester'").bind(bob.user.id).first()).n, 1);
    const guest = (await (await app.request("/api/me", { headers: { Cookie: guestCookie } })).json()).data;
    assert.equal((await rpc("admin_set_role", { p_user_id: guest.id, p_role: "admin" })).status, 400);
    assert.equal((await rpc("admin_set_role", { p_user_id: bob.user.id, p_role: "player", role: "admin" })).status, 400);
    await app.db.prepare('UPDATE "user" SET role = \'player\' WHERE id = ?').bind(owner.user.id).run();
    assert.equal((await rpc("admin_set_launched", { p_launched: false })).status, 403, "A stale valid token cannot retain revoked admin access");
  } finally { await app.runtime.dispose(); }
});
