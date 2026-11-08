import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, cookies } from "./fixture.mjs";

test("score and unlock intents cannot move to a newly active account", async () => {
  const app = await fixture();
  try {
    const alice = await app.login(), bob = await app.login({ sub: "user_bob", email: "bob@example.test" });
    await app.db.prepare(`INSERT INTO games (id,slug,title,era,track,status,score_cap,created_at,data_origin)
      VALUES ('intent','intent','Intent Test','Arcade','A','published',1000,?,'reconstructed')`).bind(new Date().toISOString()).run();
    await app.db.prepare("INSERT INTO achievements (id,game_id,slug,name,xp) VALUES ('intent-first','intent','first-step','First Step',10)").run();
    const score = { game_id: "intent", run_id: crypto.randomUUID(), score: 100, expected_player_id: alice.user.id };
    const unlock = { name: "unlock_achievement", args: { p_game_id: "intent", p_slug: "first-step", p_expected_player_id: alice.user.id } };
    assert.equal((await app.post("/api/scores", score, bob.auth)).status, 409);
    assert.equal((await app.post("/api/community/rpc", unlock, bob.auth)).status, 409);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM scores").first()).n, 0);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM user_achievements").first()).n, 0);
    assert.equal((await app.post("/api/scores", { ...score, expected_player_id: bob.user.id }, bob.auth)).status, 201);
    assert.equal((await app.post("/api/community/rpc", { ...unlock, args: { ...unlock.args, p_expected_player_id: bob.user.id } }, bob.auth)).status, 200);
    assert.equal((await app.db.prepare("SELECT user_id FROM scores").first()).user_id, bob.user.id);
    assert.equal((await app.db.prepare("SELECT user_id FROM user_achievements").first()).user_id, bob.user.id);
    // A new account retaining its guest UUID remains the same player. The
    // provider identity/session may change without discarding guest history.
    const guestCookie = cookies(await app.post("/api/auth/guest", { username: "kept_intent" }));
    const guest = (await (await app.request("/api/me", { headers: { Cookie: guestCookie } })).json()).data;
    const linked = await app.login({ sub: "user_kept_intent", email: "kept@example.test" }, guestCookie);
    assert.equal(linked.user.id, guest.id);
    assert.equal((await app.post("/api/scores", { ...score, run_id: crypto.randomUUID(), expected_player_id: guest.id }, linked.auth)).status, 201);
    assert.equal((await app.post("/api/community/rpc", { ...unlock, args: { ...unlock.args, p_expected_player_id: guest.id } }, linked.auth)).status, 200);
  } finally { await app.runtime.dispose(); }
});
