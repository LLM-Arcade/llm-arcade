import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, access } from "node:fs/promises";
import { build } from "esbuild";
import { fixture } from "./fixture.mjs";

test("reconstructed catalog uses shipped assets and the frontend API client saves/readbacks real D1 scores", async () => {
  const app = await fixture();
  try {
    const metadata = JSON.parse(await readFile("catalog/reconstructed.json", "utf8"));
    const sql = (await readFile("schema/catalog.sql", "utf8")).replace(/^--.*$/gm, "");
    // Strings can contain semicolons; use the generated one-INSERT-per-line format.
    await app.db.batch(sql.split("\n").filter(line => line.startsWith("INSERT ")).map(line => app.db.prepare(line)));
    assert.equal((await app.db.prepare('SELECT count(*) AS n FROM "user"').first()).n, 0);
    const rows = (await (await app.request("/api/games")).json()).data;
    assert.equal(rows.length, 15);
    assert.equal(rows.filter(row => row.status === "published").length, 14);
    assert.ok(rows.every(row => row.data_origin === "reconstructed"));
    assert.equal(metadata.historical_data_recovered, false);
    assert.equal(rows.filter(row => row.track === "B").length, 4);
    for (const game of rows) {
      await access("../public" + game.art_url);
      if (game.track === "B") await access("../public" + game.html_path);
    }
    assert.equal((await app.request("/api/games/rune-ruin")).status, 200);
    assert.equal((await app.request("/api/games/does-not-exist")).status, 404);
    const player = await app.login();
    const compiled = await build({ entryPoints: ["../src/lib/arcade-api.ts"], bundle: true, format: "iife", globalName: "ArcadeClient", write: false });
    // Evaluate the actual client module against an injected local transport.
    // No global fetch patch, browser claims, production calls or live accounts.
    const client = new Function("fetch", compiled.outputFiles[0].text + ";return ArcadeClient;")(async (url, options) => {
      assert.equal(options.credentials, "same-origin");
      return app.request(url, { ...options, headers: { ...options.headers, ...player.auth } });
    });
    await client.arcadePost("/scores", { game_id: "reconstructed:munch-maze", run_id: crypto.randomUUID(), score: 123 });
    assert.equal((await client.arcadeData("/games/munch-maze/personal-best")).score, 123);
    assert.equal((await client.arcadeData("/games/munch-maze/leaderboard?period=all"))[0].user_id, player.user.id);
    await client.arcadePost("/profile", { username: "fresh_player", name: "Fresh Player" });
    const card = await client.arcadeData("/players/fresh_player");
    assert.equal(card.top_scores[0].best_score, 123);
    assert.equal("email" in card.profile, false);
    assert.equal("google_sub" in card.profile, false);
    await assert.rejects(client.arcadePost("/profile", { username: "hacker", name: "Hacker", role: "admin" }), error => error.status === 400);
    const hits = [];
    for (let i = 0; i < 11; i++) hits.push((await app.post("/api/auth/guest", { username: "rate_guest_" + i })).status);
    assert.deepEqual(hits, [...Array(10).fill(200), 429]);
  } finally { await app.runtime.dispose(); }
});
