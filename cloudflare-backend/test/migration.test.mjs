import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./fixture.mjs";

test("the complete preview migration preserves quoted semicolons and initializes only reconstructed content", async () => {
  const app = await fixture({ catalog: true, accounts: false });
  try {
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM games").first()).n, 15);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM games WHERE status = 'published'").first()).n, 14);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM achievements").first()).n, 110);
    assert.equal((await app.db.prepare('SELECT count(*) AS n FROM "user"').first()).n, 0);
    assert.equal((await app.db.prepare("SELECT count(*) AS n FROM scores").first()).n, 0);
    assert.match((await app.db.prepare("SELECT description FROM games WHERE slug = 'lastwatch'").first()).description, /;/);
    assert.deepEqual((await app.db.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally { await app.runtime.dispose(); }
});
