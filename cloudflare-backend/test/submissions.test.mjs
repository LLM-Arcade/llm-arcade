import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./fixture.mjs";

test("creator submissions keep queue ownership, immutable version files and atomic admin manifest review", async () => {
  const app = await fixture();
  try {
    const alice = await app.login(), bob = await app.login({ sub: "user_bob", email: "bob@example.test" });
    const owner = await app.login({ sub: "user_owner", email: "owner@example.test" });
    const upload = async (name, type, text, user = alice) => {
      const data = new TextEncoder().encode(text), path = user.user.id + "/" + name;
      const response = await app.post("/api/storage/files", { path, contentType: type, size: data.length }, user.auth);
      assert.equal(response.status, 201, await response.clone().text());
      const file = (await response.json()).data;
      assert.equal((await app.request(`/api/storage/files/${file.id}/chunks/0`, { method: "POST", headers: { ...user.auth, "Content-Type": "application/octet-stream" }, body: data })).status, 201);
      assert.equal((await app.post(`/api/storage/files/${file.id}/complete`, {}, user.auth)).status, 200);
      return path;
    };
    const html = await upload("new-game-v1-1.html", "text/html", "<!doctype html><p>game</p>");
    const art = await upload("new-game-v1-1-art.png", "image/png", "synthetic artwork fixture");
    const entries = [{ slug: "first-step", name: "First Step", hint: "Start the game", xp: 10 }, { slug: "finish-line", name: "Finish Line", hint: "Finish", xp: 50 }];
    const submission = { user_id: alice.user.id, game_id: null, slug: "new-game", title: "New Game", era: "Original", genre: "Puzzle",
      description: "A test game", controls: "Arrows", ai_credit: "Test", score_label: "Score", score_cap: 1000,
      manifest: entries, checklist: { ready: true, score: true, achievement: true, save: false }, html_path: html, art_path: art, version: 1 };
    const query = (operation, values, auth = alice.auth, filters = []) => app.post("/api/community/query", { table: "game_submissions", operation, values, filters, orders: [] }, auth);
    const rpc = (args, auth = owner.auth) => app.post("/api/community/rpc", { name: "admin_review_submission", args }, auth);
    assert.equal((await query("insert", { ...submission, user_id: bob.user.id })).status, 403);
    assert.equal((await query("insert", { ...submission, checklist: { ready: false, score: true } })).status, 400);
    assert.equal((await query("insert", { ...submission, status: "approved" })).status, 403);
    assert.equal((await query("insert", submission)).status, 200);
    const mine = (await (await query("select")).json()).data;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, "pending");
    assert.equal(mine[0].manifest[0].slug, "first-step");
    assert.equal((await (await query("select", undefined, bob.auth)).json()).data.length, 0);
    assert.equal((await query("select", undefined, bob.auth, [{ column: "user_id", op: "eq", value: alice.user.id }])).status, 403);
    assert.equal((await (await query("select", undefined, owner.auth)).json()).data.length, 1);
    const review = { p_submission_id: mine[0].id, p_approve: true, p_note: "" };
    assert.equal((await rpc(review, bob.auth)).status, 403);
    const approved = await rpc(review);
    assert.equal(approved.status, 200, await approved.clone().text());
    assert.equal((await rpc(review)).status, 409);
    const game = await app.db.prepare("SELECT * FROM games WHERE slug = 'new-game'").first();
    assert.equal(game.created_by, alice.user.id);
    assert.equal(game.status, "published");
    assert.equal(game.html_path, "/api/storage/games/" + html);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM user_badges WHERE user_id = ? AND badge_slug = 'creator'").bind(alice.user.id).first()).n, 1);
    const originalAchievement = await app.db.prepare("SELECT id FROM achievements WHERE game_id = ? AND slug = 'first-step'").bind(game.id).first();
    const unlock = await app.post("/api/community/rpc", { name: "unlock_achievement", args: { p_game_id: game.id, p_slug: "first-step" } }, bob.auth);
    assert.equal(unlock.status, 200);
    const htmlV2 = await upload("new-game-v2-2.html", "text/html", "<!doctype html><p>game version 2</p>");
    const v2 = { ...submission, game_id: game.id, html_path: htmlV2, art_path: null, version: 2,
      manifest: [{ ...entries[1], name: "Finish Updated" }] };
    assert.equal((await query("insert", { ...v2, user_id: bob.user.id }, bob.auth)).status, 400, "Cannot use another creator's files");
    assert.equal((await query("insert", v2)).status, 200);
    const next = await app.db.prepare("SELECT id FROM game_submissions WHERE version = 2").first();
    assert.equal((await rpc({ ...review, p_submission_id: next.id })).status, 200);
    assert.equal((await app.db.prepare("SELECT active FROM achievements WHERE id = ?").bind(originalAchievement.id).first()).active, 0);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM user_achievements WHERE user_id = ? AND achievement_id = ?").bind(bob.user.id, originalAchievement.id).first()).n, 1, "Version review retains old award history");
    assert.equal((await app.db.prepare("SELECT art_url FROM games WHERE id = ?").bind(game.id).first()).art_url, "/api/storage/games/" + art);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM storage_files WHERE path = ? AND complete = 1").bind(html).first()).n, 1, "Old version file remains recoverable");
    assert.deepEqual((await app.db.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally { await app.runtime.dispose(); }
});
