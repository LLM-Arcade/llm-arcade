import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fixture } from "./fixture.mjs";

test("the actual frontend adapter reads profiles, uploads File chunks and assembles the original game bytes", async () => {
  const app = await fixture();
  try {
    const player = await app.login();
    const compiled = await build({ entryPoints: ["../src/lib/cloudflare-community.ts"], bundle: true, format: "iife", globalName: "Adapter", write: false });
    const client = new Function("fetch", compiled.outputFiles[0].text + ";return Adapter.cloudflareCommunity;")((url, options) => {
      assert.equal(options.credentials, "same-origin");
      const headers = new Headers(options.headers);
      for (const [name, value] of Object.entries(player.auth)) headers.set(name, value);
      return app.request(url, { ...options, headers });
    });
    const profile = await client.from("profiles").select("*").eq("id", player.user.id).single();
    assert.equal(profile.error, null);
    assert.equal(profile.data.id, player.user.id);
    assert.equal("email" in profile.data, false);
    const missing = await client.from("profiles").select("*").eq("username", "missing_player").maybeSingle();
    assert.equal(missing.data, null);
    assert.equal(missing.error, null);
    const path = player.user.id + "/adapter-v1.html";
    const original = "<!doctype html><p>self-contained test game</p><!--" + "x".repeat(128 * 1024 + 30) + "-->";
    const uploaded = await client.storage.from("games").upload(path, new File([original], "game.html", { type: "text/html" }), { contentType: "text/html" });
    assert.equal(uploaded.error, null, uploaded.error?.message);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM storage_chunks").first()).n, 2);
    const url = client.storage.from("games").getPublicUrl(path).data.publicUrl;
    const page = await app.request(url);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("Content-Security-Policy"), /sandbox allow-scripts/);
    const html = await page.text();
    const script = html.split("<script>")[1].split("</script>")[0];
    let assembled, navigation, failure;
    // Execute only our trusted loader against local D1. This verifies byte
    // assembly and navigation intent, not browser origin/sandbox inheritance.
    await new Function("fetch", "location", "URL", "Blob", "document", "return " + script.trim())(
      async (chunk, options) => {
        assert.equal(options.credentials, "omit");
        return app.request(new URL(chunk).pathname);
      },
      { replace: value => { navigation = value; } },
      { createObjectURL: blob => { assembled = blob; return "blob:synthetic-local-test"; } },
      Blob,
      { querySelector: () => ({ set textContent(value) { failure = value; } }) },
    );
    assert.equal(failure, undefined);
    assert.equal(navigation, "blob:synthetic-local-test");
    assert.equal(await assembled.text(), original);
    const counts = await client.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", player.user.id);
    assert.equal(counts.error, null);
    assert.equal(counts.count, 0);
    const scores = await client.rpc("get_user_top_scores", { p_user_id: player.user.id });
    assert.equal(scores.error, null);
    assert.deepEqual(scores.data, []);
  } finally { await app.runtime.dispose(); }
});
