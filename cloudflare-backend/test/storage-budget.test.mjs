import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./fixture.mjs";
import { baseSchemas } from "../scripts/schema-statements.mjs";
import { storageUpgradeArtifact, STORAGE_UPGRADE_VERSION } from "../scripts/prepare-storage-upgrade-artifact.mjs";

const CAPACITY = 400 * 1024 * 1024;
const chunk = (app, id, auth, bytes) => app.request(`/api/storage/files/${id}/chunks/0`, {
  method: "POST", headers: { ...auth, "Content-Type": "application/octet-stream" }, body: bytes,
});

test("unfulfilled upload metadata cannot consume the shared payload budget", async () => {
  const app = await fixture();
  try {
    const reservers = [];
    for (let i = 0; i < 7; i++) reservers.push(await app.login({ sub: "user_empty_upload_" + i, email: `empty-${i}@example.test` }));
    for (let i = 0; i < 80; i++) {
      const owner = reservers[Math.floor(i / 12)];
      const response = await app.post("/api/storage/files", {
        path: owner.user.id + `/unfulfilled-${i}.html`, contentType: "text/html", size: 5 * 1024 * 1024,
      }, owner.auth);
      assert.equal(response.status, 201, "Each attack reservation stays within the existing per-account quota");
    }
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM storage_chunks").first()).n, 0);
    assert.equal((await app.db.prepare("SELECT stored_bytes FROM storage_budget WHERE id = 1").first()).stored_bytes, 0);
    const resumed = await app.post("/api/storage/files", {
      path: reservers[0].user.id + "/unfulfilled-0.html", contentType: "text/html", size: 5 * 1024 * 1024,
    }, reservers[0].auth);
    assert.equal(resumed.status, 200, "Existing paths resume even after the account's daily metadata quota is reached");
    const legitimate = await app.login({ sub: "user_legitimate_upload", email: "legitimate@example.test" });
    const path = legitimate.user.id + "/real-file.html";
    const created = await app.post("/api/storage/files", { path, contentType: "text/html", size: 1 }, legitimate.auth);
    assert.equal(created.status, 201, "Empty metadata must not prevent a legitimate byte from being stored");
    const id = (await created.json()).data.id;
    assert.equal((await app.request(`/api/storage/files/${id}/chunks/0`, {
      method: "POST", headers: { ...legitimate.auth, "Content-Type": "application/octet-stream" }, body: new Uint8Array([65]),
    })).status, 201);
    assert.equal((await app.post(`/api/storage/files/${id}/complete`, {}, legitimate.auth)).status, 200);
    const publicChunk = await app.request(`/api/storage/public/${id}/0`);
    assert.deepEqual(new Uint8Array(await publicChunk.arrayBuffer()), new Uint8Array([65]));
    assert.equal((await app.db.prepare("SELECT stored_bytes FROM storage_budget WHERE id = 1").first()).stored_bytes, 1);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM storage_files").first()).n, 81, "Metadata and uploaded data are retained");
  } finally { await app.runtime.dispose(); }
});

test("the actual-byte cap is atomic and full capacity does not break immutable chunk retries", async () => {
  const app = await fixture();
  try {
    const owner = await app.login();
    const files = [];
    for (let i = 0; i < 2; i++) {
      const created = await app.post("/api/storage/files", { path: owner.user.id + `/race-${i}.html`, contentType: "text/html", size: 1 }, owner.auth);
      assert.equal(created.status, 201);
      files.push((await created.json()).data.id);
    }
    // Simulate prior stored payload without materializing 400 MiB in this test.
    await app.db.prepare("UPDATE storage_budget SET stored_bytes = ? WHERE id = 1").bind(CAPACITY - 1).run();
    const replies = await Promise.all(files.map(id => chunk(app, id, owner.auth, new Uint8Array([65]))));
    assert.deepEqual(replies.map(r => r.status).sort(), [201, 507]);
    const winner = files[replies.findIndex(r => r.status === 201)], loser = files[replies.findIndex(r => r.status === 507)];
    assert.equal((await app.db.prepare("SELECT stored_bytes FROM storage_budget WHERE id = 1").first()).stored_bytes, CAPACITY);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM storage_chunks WHERE file_id = ?").bind(loser).first()).n, 0);
    const retries = await Promise.all(Array.from({ length: 4 }, () => chunk(app, winner, owner.auth, new Uint8Array([65]))));
    assert.ok(retries.every(r => r.status === 200));
    assert.equal((await chunk(app, winner, owner.auth, new Uint8Array([66]))).status, 409);
    assert.equal((await app.post(`/api/storage/files/${winner}/complete`, {}, owner.auth)).status, 200);
    assert.equal((await chunk(app, winner, owner.auth, new Uint8Array([65]))).status, 200);
    assert.equal((await app.db.prepare("SELECT stored_bytes FROM storage_budget WHERE id = 1").first()).stored_bytes, CAPACITY);
    const replayMetadata = await app.post("/api/storage/files", {
      path: owner.user.id + `/race-${files.indexOf(loser)}.html`, contentType: "text/html", size: 1,
    }, owner.auth);
    assert.equal(replayMetadata.status, 200, "Saved incomplete metadata is retained and resumable at a full budget");
    assert.equal((await chunk(app, loser, owner.auth, new Uint8Array([65]))).status, 507);
    assert.equal((await app.post("/api/storage/files", { path: owner.user.id + "/no-capacity.html", contentType: "text/html", size: 1 }, owner.auth)).status, 507);
  } finally { await app.runtime.dispose(); }
});

test("the additive upgrade preserves legacy completed/partial files and atomically repairs phantom quota", async () => {
  const app = await fixture({ schemas: baseSchemas.filter(file => file !== "storage-byte-budget.sql") });
  try {
    const owner = await app.login();
    const completedId = crypto.randomUUID(), partialId = crypto.randomUUID();
    const completedPath = owner.user.id + "/preserved.html", partialPath = owner.user.id + "/partial.html";
    const saved = new Uint8Array([65, 66, 67]), partial = new Uint8Array(128 * 1024).fill(90);
    await app.db.batch([
      app.db.prepare("INSERT INTO storage_files (id,path,user_id,content_type,size,complete,created_at) VALUES (?,?,?,'text/html',3,1,'2025-01-01')").bind(completedId, completedPath, owner.user.id),
      app.db.prepare("INSERT INTO storage_files (id,path,user_id,content_type,size,complete,created_at) VALUES (?,?,?,'text/html',5242880,0,'2025-01-01')").bind(partialId, partialPath, owner.user.id),
      app.db.prepare("INSERT INTO storage_chunks VALUES (?,0,?)").bind(completedId, saved),
      app.db.prepare("INSERT INTO storage_chunks VALUES (?,0,?)").bind(partialId, partial),
    ]);
    for (let i = 0; i < 78; i++) await app.db.prepare("INSERT INTO storage_files (id,path,user_id,content_type,size,created_at) VALUES (?,?,?,'text/html',5242880,'2025-01-01')")
      .bind(crypto.randomUUID(), owner.user.id + `/legacy-empty-${i}.html`, owner.user.id).run();
    const legacyReserved = 79 * 5 * 1024 * 1024 + saved.length;
    await app.db.prepare("UPDATE storage_budget SET reserved_bytes = ? WHERE id = 1").bind(legacyReserved).run();
    const upgrade = await storageUpgradeArtifact();
    const statements = upgrade.batch.map(({ sql }) => app.db.prepare(sql));
    await assert.rejects(() => app.db.batch([...statements, app.db.prepare("INSERT INTO storage_budget (id) VALUES (2)")]), /CHECK constraint failed/);
    assert.equal((await app.db.prepare("PRAGMA table_info(storage_budget)").all()).results.some(row => row.name === "stored_bytes"), false, "Failed upgrade rolls back its ALTER and all writes");
    await app.db.batch(statements);
    const budget = await app.db.prepare("SELECT * FROM storage_budget WHERE id = 1").first();
    assert.equal(budget.reserved_bytes, legacyReserved, "Legacy accounting remains available during staged rollout");
    assert.equal(budget.stored_bytes, saved.length + partial.length, "Backfill includes completed and incomplete payloads");
    const recorded = await app.db.prepare("SELECT source_sha256 FROM arcade_migrations WHERE version = ?").bind(STORAGE_UPGRADE_VERSION).first();
    assert.equal(recorded.source_sha256, upgrade.source_sha256);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM storage_files").first()).n, 80);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM storage_chunks").first()).n, 2);
    assert.deepEqual(new Uint8Array(await (await app.request(`/api/storage/public/${completedId}/0`)).arrayBuffer()), saved);
    assert.equal((await app.post("/api/storage/files", { path: partialPath, contentType: "text/html", size: 5 * 1024 * 1024 }, owner.auth)).status, 200);
    assert.equal((await chunk(app, partialId, owner.auth, partial)).status, 200, "Partial upload's original bytes remain immutable and replayable");
    const afterReplay = (await app.db.prepare("SELECT stored_bytes FROM storage_budget WHERE id = 1").first()).stored_bytes;
    assert.equal(afterReplay, saved.length + partial.length);
    await assert.rejects(() => app.db.batch(upgrade.batch.map(({ sql }) => app.db.prepare(sql))), /duplicate column/);
    assert.equal((await app.db.prepare("SELECT stored_bytes FROM storage_budget WHERE id = 1").first()).stored_bytes, afterReplay);
    assert.deepEqual((await app.db.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally { await app.runtime.dispose(); }
});
