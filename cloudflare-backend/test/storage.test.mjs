import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFile } from "node:fs/promises";
import { fixture, cookies } from "./fixture.mjs";
import { profileRequest } from "./profile.mjs";

test("immutable public uploads stay sandboxed, enforce ownership, byte limits and a hard free storage budget", async () => {
  const app = await fixture();
  try {
    const alice = await app.login(), bob = await app.login({ sub: "user_bob", email: "bob@example.test" });
    const guest = cookies(await app.post("/api/auth/guest", {}));
    const path = alice.user.id + "/test-game-v1-123.html";
    const bytes = new TextEncoder().encode("<!doctype html><script>parent.postMessage({type:'ARCADE_READY'},'*')</script>");
    const metadata = { path, contentType: "text/html", size: bytes.length };
    assert.equal((await app.post("/api/storage/files", metadata, guest)).status, 403);
    assert.equal((await app.post("/api/storage/files", metadata, bob.auth)).status, 400);
    assert.equal((await app.post("/api/storage/files", { ...metadata, size: 5 * 1024 * 1024 + 1 }, alice.auth)).status, 413);
    const created = await app.post("/api/storage/files", metadata, alice.auth);
    assert.equal(created.status, 201, await created.clone().text());
    const file = (await created.json()).data;
    const chunk = (data, auth = alice.auth) => app.request(`/api/storage/files/${file.id}/chunks/0`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/octet-stream" }, body: data,
    });
    assert.equal((await app.post(`/api/storage/files/${file.id}/complete`, {}, alice.auth)).status, 409);
    assert.equal((await chunk(bytes, bob.auth)).status, 403);
    assert.equal((await chunk(bytes.slice(1))).status, 400);
    assert.equal((await chunk(bytes)).status, 201);
    assert.equal((await chunk(bytes)).status, 200);
    const conflicting = bytes.slice(); conflicting[0] = 1;
    assert.equal((await chunk(conflicting)).status, 409);
    assert.equal((await app.post(`/api/storage/files/${file.id}/complete`, {}, alice.auth)).status, 200);
    assert.equal((await app.post("/api/storage/files", metadata, alice.auth)).status, 200, "Identical metadata safely resumes the same immutable file");
    const served = await app.request("/api/storage/games/" + path);
    assert.equal(served.status, 200);
    assert.match(await served.text(), /Loading arcade file/);
    const manifest = await (await app.request("/api/storage/games/" + path + "?manifest=1")).json();
    const raw = await app.request(new URL(manifest.chunkBase + "0").pathname);
    assert.deepEqual(new Uint8Array(await raw.arrayBuffer()), bytes);
    assert.equal(raw.headers.get("Access-Control-Allow-Origin"), "https://arcade.example.test");
    assert.match(served.headers.get("Content-Security-Policy"), /sandbox allow-scripts;/);
    assert.equal(served.headers.get("Content-Security-Policy").includes("allow-same-origin"), false);
    assert.equal(served.headers.get("X-Content-Type-Options"), "nosniff");
    assert.match(served.headers.get("Cache-Control"), /immutable/);
    // Profile the full 5 MB response, including streamed chunk retrieval, with
    // synthetic local data. No paid service or remote object is created.
    const largeId = crypto.randomUUID(), largePath = alice.user.id + "/large-v1-123.html";
    const size = 5 * 1024 * 1024;
    await app.db.prepare("INSERT INTO storage_files (id,path,user_id,content_type,size,complete,created_at) VALUES (?,?,?,'text/html',?,1,?)")
      .bind(largeId, largePath, alice.user.id, size, new Date().toISOString()).run();
    const block = new Uint8Array(128 * 1024).fill(32);
    if (process.env.ARCADE_PROFILE === "1") {
      const fresh = await app.post("/api/storage/files", { ...metadata, path: alice.user.id + "/profile-v1-123.html", size: block.length }, alice.auth);
      const freshId = (await fresh.json()).data.id;
      const measured = await profileRequest(app.runtime, () => app.request(`/api/storage/files/${freshId}/chunks/0`, {
        method: "POST", headers: { ...alice.auth, "Content-Type": "application/octet-stream" }, body: block,
      }));
      assert.equal(measured.response.status, 201, await measured.response.clone().text());
      console.log("128 KB authenticated upload profile:", JSON.stringify(measured.summary));
    }
    for (let i = 0; i < 40; i++) await app.db.prepare("INSERT INTO storage_chunks VALUES (?,?,?)").bind(largeId, i, block).run();
    const manifestLarge = await (await app.request("/api/storage/games/" + largePath + "?manifest=1")).json();
    assert.equal(manifestLarge.chunks, 40);
    let downloaded = 0;
    const summaries = [];
    for (let i = 0; i < manifestLarge.chunks; i++) {
      const operation = async () => new Uint8Array(await (await app.request(new URL(manifestLarge.chunkBase + i).pathname)).arrayBuffer());
      const result = process.env.ARCADE_PROFILE === "1" && i < 3 ? await profileRequest(app.runtime, operation) : { response: await operation() };
      downloaded += result.response.length;
      if (result.summary) summaries.push(result.summary);
    }
    assert.equal(downloaded, size);
    if (summaries.length) {
      await writeFile("dist/storage-profile.json", JSON.stringify({ perInvocation: summaries }, null, 2));
      console.log("128 KB chunk profiles:", JSON.stringify(summaries));
    }
    await app.db.prepare("UPDATE storage_budget SET reserved_bytes = 400 * 1024 * 1024 WHERE id = 1").run();
    assert.equal((await app.post("/api/storage/files", { ...metadata, path: alice.user.id + "/second-v1-123.html" }, alice.auth)).status, 507);
  } finally { await app.runtime.dispose(); }
});
