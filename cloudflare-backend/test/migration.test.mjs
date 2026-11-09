import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fixture } from "./fixture.mjs";
import { STORAGE_UPGRADE_VERSION } from "../scripts/prepare-storage-upgrade-artifact.mjs";

test("the complete preview migration preserves quoted semicolons and initializes only reconstructed content", async () => {
  const app = await fixture({ schemas: [], accounts: false });
  try {
    const artifact = JSON.parse(execFileSync(process.execPath,
      [fileURLToPath(new URL("../scripts/prepare-preview-artifact.mjs", import.meta.url))], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 }));
    await app.db.batch(artifact.batch.map(({ sql }) => app.db.prepare(sql)));
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM games").first()).n, 15);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM games WHERE status = 'published'").first()).n, 14);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM achievements").first()).n, 110);
    assert.equal((await app.db.prepare('SELECT count(*) AS n FROM "user"').first()).n, 0);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM scores").first()).n, 0);
    assert.match((await app.db.prepare("SELECT description FROM games WHERE slug = 'lastwatch'").first()).description, /;/);
    assert.equal((await app.db.prepare("SELECT stored_bytes FROM storage_budget WHERE id = 1").first()).stored_bytes, 0);
    assert.equal((await app.db.prepare("SELECT source_sha256 FROM arcade_migrations WHERE version = 'initial-recovery-2026-11-08'").first()).source_sha256, artifact.source_sha256);
    assert.ok(await app.db.prepare("SELECT version FROM arcade_migrations WHERE version = ?").bind(STORAGE_UPGRADE_VERSION).first());
    assert.deepEqual((await app.db.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally { await app.runtime.dispose(); }
});
