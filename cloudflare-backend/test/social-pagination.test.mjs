import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fixture, cookies } from "./fixture.mjs";

async function socialFixture() {
  const app = await fixture({ accounts: false });
  try {
    const cookie = cookies(await app.post("/api/auth/guest", { username: "late_favorite" }));
    const player = (await (await app.request("/api/me", { headers: { Cookie: cookie } })).json()).data;
    const now = "2025-01-01T00:00:00.000Z";
    await app.db.prepare(`INSERT INTO games (id,slug,title,era,track,status,score_cap,created_at,data_origin)
      VALUES ('busy','busy','Busy Cabinet','Arcade','A','published',1000,?,'reconstructed')`).bind(now).run();
    await app.db.prepare(`WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<449)
      INSERT INTO "user" (id,username,name,createdAt)
      SELECT 'bulk_'||printf('%04d',x),'bulk_'||printf('%04d',x),'Synthetic Player',? FROM n`).bind(now).run();
    await app.db.prepare("INSERT INTO favorites SELECT id,'busy',? FROM \"user\" WHERE id LIKE 'bulk_%'").bind(now).run();
    await app.db.prepare("INSERT INTO ratings SELECT id,'busy',4,? FROM \"user\" WHERE id LIKE 'bulk_%'").bind(now).run();
    await app.db.prepare("INSERT INTO favorites VALUES (?,'busy','2025-02-01T00:00:00.000Z')").bind(player.id).run();
    await app.db.prepare("INSERT INTO ratings VALUES (?,'busy',2,'2025-02-01T00:00:00.000Z')").bind(player.id).run();
    await app.db.prepare(`WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<424)
      INSERT INTO comments (id,user_id,game_id,parent_id,body,created_at)
      SELECT 'comment-'||printf('%04d',x),'bulk_'||printf('%04d',x),'busy',
        CASE WHEN x=424 THEN 'comment-0000' ELSE NULL END,'Comment '||x,? FROM n`).bind(now).run();
    return { ...app, cookie, player };
  } catch (error) { await app.runtime.dispose(); throw error; }
}

test("complete social totals and the current player's state survive more than 200 rows", async () => {
  const app = await socialFixture();
  try {
    const args = { p_game_id: "busy" };
    const summary = async auth => (await (await app.post("/api/community/rpc", { name: "get_game_social_summary", args }, auth)).json()).data;
    const mine = await summary(app.cookie);
    assert.equal(mine?.favorite_count, 451);
    assert.equal(mine.is_favorite, true);
    assert.equal(mine.rating_count, 451);
    assert.equal(mine.rating_average, 1802 / 451);
    assert.equal(mine.player_rating, 2);
    const anonymous = await summary("");
    assert.equal(anonymous.favorite_count, 451);
    assert.equal(anonymous.is_favorite, false);
    assert.equal(anonymous.player_rating, null);
    assert.deepEqual(Object.keys(anonymous).sort(), ["favorite_count", "is_favorite", "player_rating", "rating_average", "rating_count"].sort());
    assert.equal((await app.post("/api/community/rpc", { name: "get_game_social_summary", args: { ...args, p_user_id: "bulk_0000" } }, app.cookie)).status, 400);
    assert.equal((await app.post("/api/community/query", { table: "favorites", operation: "delete", orders: [],
      filters: [{ column: "game_id", op: "eq", value: "busy" }, { column: "user_id", op: "eq", value: app.player.id }] }, app.cookie)).status, 200);
    const removed = await summary(app.cookie);
    assert.equal(removed.favorite_count, 450);
    assert.equal(removed.is_favorite, false);
    assert.equal(removed.player_rating, 2);
    assert.equal((await app.post("/api/community/query", { table: "ratings", operation: "upsert", filters: [], orders: [],
      values: { game_id: "busy", user_id: app.player.id, rating: 5 } }, app.cookie)).status, 200);
    const updated = await summary(app.cookie);
    assert.equal(updated.rating_count, 451);
    assert.equal(updated.rating_average, 1805 / 451);
    assert.equal(updated.player_rating, 5);
  } finally { await app.runtime.dispose(); }
});

test("community pages cover every comment and reject malformed offsets without limiting total counts", async () => {
  const app = await socialFixture();
  try {
    const query = { table: "comments", operation: "select", filters: [{ column: "game_id", op: "eq", value: "busy" }],
      orders: [{ column: "created_at", ascending: true }, { column: "id", ascending: true }], limit: 200 };
    const all = [];
    for (const offset of [0, 200, 400]) {
      const response = await app.post("/api/community/query", { ...query, offset });
      assert.equal(response.status, 200);
      const { data } = await response.json();
      assert.equal(data.length, offset === 400 ? 25 : 200);
      all.push(...data);
    }
    assert.deepEqual(all.map(row => row.id), Array.from({ length: 425 }, (_, i) => "comment-" + String(i).padStart(4, "0")));
    assert.equal(all.at(-1).parent_id, all[0].id, "A reply on a later page retains its earlier parent");
    const total = await app.post("/api/community/query", { ...query, offset: 400, head: true });
    assert.equal((await total.json()).count, 425);
    for (const offset of [-1, 0.5, "200", {}, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal((await app.post("/api/community/query", { ...query, offset })).status, 400);
    }
    assert.equal((await app.post("/api/community/query", { ...query, limit: 201 })).status, 400);
    const compiled = await build({ entryPoints: ["../src/lib/cloudflare-community.ts"], bundle: true, format: "iife", globalName: "Adapter", write: false });
    const client = new Function("fetch", compiled.outputFiles[0].text + ";return Adapter.cloudflareCommunity;")((url, options) => app.request(url, options));
    const lastPage = await client.from("comments").select("*").eq("game_id", "busy")
      .order("created_at").order("id").range(400, 599);
    assert.equal(lastPage.error, null);
    assert.equal(lastPage.data.length, 25);
    assert.equal(lastPage.data.at(-1).id, "comment-0424");
    const helper = await build({ entryPoints: ["../src/lib/load-game-comments.ts"], bundle: true, format: "iife", globalName: "Comments", write: false });
    const loadGameComments = new Function(helper.outputFiles[0].text + ";return Comments.loadGameComments;")();
    const createClient = transport => new Function("fetch", compiled.outputFiles[0].text + ";return Adapter.cloudflareCommunity;")(transport);
    const offsets = [];
    const fullClient = createClient((url, options) => {
      offsets.push(JSON.parse(options.body).offset);
      return app.request(url, options);
    });
    const thread = await loadGameComments(fullClient, "busy");
    assert.equal(thread.length, 425);
    assert.equal(thread.at(-1).parent_id, thread[0].id);
    assert.deepEqual(offsets, [0, 200, 400]);
    assert.equal((await app.post("/api/community/query", { table: "comments", operation: "insert", filters: [], orders: [],
      values: { game_id: "busy", user_id: app.player.id, body: "New comment after the old cap" } }, app.cookie)).status, 200);
    const refreshed = await loadGameComments(fullClient, "busy");
    assert.equal(refreshed.length, 426);
    assert.equal(refreshed.at(-1).body, "New comment after the old cap");
    await app.db.prepare(`INSERT INTO games (id,slug,title,era,track,status,score_cap,created_at,data_origin)
      SELECT 'exact','exact','Exact Page','Arcade','A','published',1000,created_at,'reconstructed' FROM games WHERE id='busy'`).run();
    await app.db.prepare(`INSERT INTO comments (id,user_id,game_id,body,created_at)
      SELECT 'exact-'||id,user_id,'exact',body,created_at FROM comments WHERE game_id='busy' AND id LIKE 'comment-%' AND id<='comment-0199'`).run();
    offsets.length = 0;
    assert.equal((await loadGameComments(fullClient, "exact")).length, 200);
    assert.deepEqual(offsets, [0, 200], "An exactly full page must check its empty successor");
    const cancelled = new AbortController(); cancelled.abort();
    const beforeAbort = offsets.length;
    await assert.rejects(() => loadGameComments(fullClient, "busy", cancelled.signal), { name: "AbortError" });
    assert.equal(offsets.length, beforeAbort);
    const midPage = new AbortController();
    let partialRequests = 0;
    const abortingClient = createClient(async (url, options) => {
      partialRequests++;
      const response = await app.request(url, options);
      midPage.abort();
      return response;
    });
    await assert.rejects(() => loadGameComments(abortingClient, "busy", midPage.signal), { name: "AbortError" });
    assert.equal(partialRequests, 1, "Cancellation never returns or continues a partial thread");
    let failedRequests = 0;
    const failingClient = createClient((url, options) => ++failedRequests === 2
      ? Response.json({ error: "Synthetic later-page failure" }, { status: 503 }) : app.request(url, options));
    await assert.rejects(() => loadGameComments(failingClient, "busy"), error => /later-page failure/.test(error.message));
    assert.equal(failedRequests, 2);
  } finally { await app.runtime.dispose(); }
});
