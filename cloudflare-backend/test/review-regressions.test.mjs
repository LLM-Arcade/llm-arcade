import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fixture } from "./fixture.mjs";

test("existing Clerk identities refresh verified primary email without moving player records", async () => {
  const app = await fixture();
  try {
    const player = await app.login({ sub: "user_email_change", email: "before@example.test" });
    const changed = await app.identity({ sub: "user_email_change", email: "after@example.test" });
    const refreshed = await app.post("/api/auth/account", {}, changed);
    assert.equal(refreshed.status, 200);
    const me = (await (await app.request("/api/me", { headers: changed })).json()).data;
    assert.equal(me.id, player.user.id);
    assert.equal(me.email, "after@example.test");
    assert.equal(me.emailVerified, true);
    assert.equal(me.role, "player");
    const unverified = await app.identity({ sub: "user_email_change", email: "owner@example.test", email_verified: false });
    assert.equal((await app.post("/api/auth/account", {}, unverified)).status, 403);
    const denied = (await (await app.request("/api/me", { headers: unverified })).json()).data;
    assert.equal(denied.emailVerified, false);
    assert.equal(denied.role, "player", "An unverified owner-address claim cannot grant admin");
    assert.equal(denied.email, "after@example.test");
    const reverified = await app.identity({ sub: "user_email_change", email: "after@example.test" });
    assert.equal((await app.post("/api/auth/account", {}, reverified)).status, 200);
    await app.login({ sub: "user_existing_email", email: "taken@example.test" });
    const conflict = await app.identity({ sub: "user_email_change", email: "taken@example.test" });
    assert.equal((await app.post("/api/auth/account", {}, conflict)).status, 409);
    assert.equal((await app.db.prepare('SELECT email FROM "user" WHERE id = ?').bind(player.user.id).first()).email, "after@example.test");
    assert.equal((await app.db.prepare('SELECT count(*) AS n FROM "user"').first()).n, 2);
  } finally { await app.runtime.dispose(); }
});

test("concurrent file metadata enforces daily quota without charging unstored payloads", async () => {
  const app = await fixture();
  try {
    const player = await app.login({ sub: "user_parallel_uploads", email: "quota@example.test" });
    const size = 5 * 1024 * 1024;
    const responses = await Promise.all(Array.from({ length: 16 }, (_, n) => app.post("/api/storage/files", {
      path: player.user.id + `/parallel-${n}.html`, contentType: "text/html", size,
    }, player.auth)));
    assert.equal(responses.filter(r => r.status === 201).length, 12);
    assert.equal(responses.filter(r => r.status === 429).length, 4);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM storage_files").first()).n, 12);
    assert.equal((await app.db.prepare("SELECT stored_bytes FROM storage_budget WHERE id = 1").first()).stored_bytes, 0);
  } finally { await app.runtime.dispose(); }
});

test("concurrent playtest decisions grant a role only for the winning approval", async () => {
  const app = await fixture();
  try {
    const player = await app.login({ sub: "user_playtest_race", email: "playtester@example.test" });
    const owner = await app.login({ sub: "user_owner", email: "owner@example.test" });
    await app.db.prepare(`INSERT INTO playtest_applications (id,name,email,devices,favorite_eras,created_at)
      VALUES ('decision-race','Test','playtester@example.test','["Desktop"]','[]',?)`).bind(new Date().toISOString()).run();
    for (let n = 0; n < 8; n++) {
      await app.db.prepare("UPDATE playtest_applications SET status = 'pending' WHERE id = 'decision-race'").run();
      await app.db.prepare('UPDATE "user" SET role = \'player\' WHERE id = ?').bind(player.user.id).run();
      const replies = await Promise.all([false, true].map(p_approve => app.post("/api/community/rpc", {
        name: "admin_review_playtest", args: { p_application_id: "decision-race", p_approve },
      }, owner.auth)));
      assert.equal(replies.filter(r => r.status === 200).length, 1);
      assert.equal(replies.filter(r => r.status === 409).length, 1);
      const decision = (await app.db.prepare("SELECT status FROM playtest_applications WHERE id = 'decision-race'").first()).status;
      const role = (await app.db.prepare('SELECT role FROM "user" WHERE id = ?').bind(player.user.id).first()).role;
      assert.equal(role, decision === "approved" ? "playtester" : "player");
    }
  } finally { await app.runtime.dispose(); }
});

test("submission reviews with simultaneous pending snapshots acknowledge only one decision", async () => {
  const app = await fixture();
  try {
    // Compile the actual helper, then hold just its two initial SELECT results
    // to reproduce a valid asynchronous interleaving. Writes use real local D1.
    const compiled = await build({ entryPoints: ["src/submissions.ts"], bundle: true, platform: "node", format: "esm", write: false });
    const { reviewSubmission } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
    const creator = await app.login({ sub: "user_review_cas", email: "creator@example.test" });
    const html = creator.user.id + "/review-v1.html", art = creator.user.id + "/review-v1-art.png";
    for (const [path, type] of [[html, "text/html"], [art, "image/png"]]) {
      const id = crypto.randomUUID();
      await app.db.prepare("INSERT INTO storage_files (id,path,user_id,content_type,size,complete,created_at) VALUES (?,?,?,?,1,1,?)")
        .bind(id, path, creator.user.id, type, new Date().toISOString()).run();
      await app.db.prepare("INSERT INTO storage_chunks VALUES (?,0,?)").bind(id, new Uint8Array([1])).run();
    }
    const values = { user_id: creator.user.id, game_id: null, slug: "review-race", title: "Review Race", era: "Original",
      genre: "Puzzle", description: "Test", controls: "Arrows", ai_credit: "Test", score_label: "Score", score_cap: 1000,
      manifest: [], checklist: { ready: true, score: true, achievement: false, save: false }, html_path: html, art_path: art, version: 1 };
    assert.equal((await app.post("/api/community/query", { table: "game_submissions", operation: "insert", values, filters: [], orders: [] }, creator.auth)).status, 200);
    const submission = await app.db.prepare("SELECT id FROM game_submissions").first();
    let arrived = 0, release;
    const barrier = new Promise(resolve => { release = resolve; });
    const statement = (target, sql) => new Proxy(target, { get(t, key) {
      if (key === "bind") return (...args) => statement(t.bind(...args), sql);
      if (key === "first" && sql === "SELECT * FROM game_submissions WHERE id = ?") return async (...args) => {
        const snapshot = await t.first(...args);
        if (++arrived === 2) release();
        await barrier;
        return snapshot;
      };
      const value = Reflect.get(t, key, t);
      return typeof value === "function" ? value.bind(t) : value;
    } });
    const db = new Proxy(app.db, { get(t, key) {
      if (key === "prepare") return sql => statement(t.prepare(sql), sql);
      const value = Reflect.get(t, key, t);
      return typeof value === "function" ? value.bind(t) : value;
    } });
    const decisions = await Promise.all([true, false].map(p_approve => reviewSubmission({ ARCADE_DB: db }, {
      p_submission_id: submission.id, p_approve, p_note: p_approve ? "" : "Not ready",
    }).then(response => response.status, error => { if (error.status === 409) return 409; throw error; })));
    assert.deepEqual(decisions.slice().sort(), [200, 409]);
    const stored = await app.db.prepare("SELECT status FROM game_submissions WHERE id = ?").bind(submission.id).first();
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM games WHERE slug = 'review-race'").first()).n, stored.status === "approved" ? 1 : 0);
    assert.deepEqual((await app.db.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally { await app.runtime.dispose(); }
});
