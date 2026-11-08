import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./fixture.mjs";

test("Clerk players retain separate persistent scores, retry keys, rate limits and shared leaderboards", async () => {
  const app = await fixture();
  try {
    await app.db.prepare(`INSERT INTO games (id, slug, title, era, track, status, score_cap, created_at, data_origin)
      VALUES ('reconstructed:test-game', 'test-game', 'Test Game', 'Arcade', 'A', 'published', 1000, ?, 'reconstructed')`).bind(new Date().toISOString()).run();
    const alice = await app.login(), bob = await app.login({ sub: "user_bob", email: "bob@example.test" });
    const postScore = (user, run_id, score, extra = {}) => app.post("/api/scores", { game_id: "reconstructed:test-game", run_id, score, ...extra }, user.auth ?? "");
    const run = crypto.randomUUID();
    assert.equal((await postScore(alice, run, 100)).status, 201);
    assert.equal((await postScore(alice, run, 100)).status, 200);
    assert.equal((await postScore(alice, run, 101)).status, 409);
    assert.equal((await postScore(alice, crypto.randomUUID(), 101)).status, 429);
    assert.equal((await postScore(bob, crypto.randomUUID(), 200)).status, 201);
    assert.equal((await postScore(bob, crypto.randomUUID(), 201, { user_id: alice.user.id })).status, 400);
    assert.equal((await postScore(bob, crypto.randomUUID(), 1001)).status, 400);
    assert.equal((await postScore(bob, crypto.randomUUID(), 0.5)).status, 400);
    assert.equal((await postScore({ cookie: "" }, crypto.randomUUID(), 100)).status, 401);
    assert.equal((await postScore(bob, crypto.randomUUID(), 1, { stats: { oversized: "x".repeat(9000) } })).status, 413);
    const board = await app.request("/api/games/test-game/leaderboard");
    const leaders = (await board.json()).data;
    assert.deepEqual(leaders.map(row => [row.user_id, row.best_score]), [[bob.user.id, 200], [alice.user.id, 100]]);
    assert.equal("email" in leaders[0], false);
    const best = await app.request("/api/games/test-game/personal-best", { headers: alice.auth });
    assert.equal((await best.json()).data.score, 100);
    const again = await app.login();
    assert.equal(again.user.id, alice.user.id);
    assert.equal((await (await app.request("/api/games/test-game/personal-best", { headers: again.auth })).json()).data.score, 100);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM scores").first()).n, 2);
    assert.deepEqual((await app.db.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally { await app.runtime.dispose(); }
});
