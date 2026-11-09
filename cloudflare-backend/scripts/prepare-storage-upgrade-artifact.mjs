import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { schemaStatements } from "./schema-statements.mjs";

export const STORAGE_UPGRADE_VERSION = "storage-byte-budget-2026-11-09";

// Prepare only. Apply the entire batch once, after inspecting the existing
// migration ledger/column state and preserving a backup. No remote API is called.
export async function storageUpgradeArtifact() {
  const batch = await schemaStatements(["storage-byte-budget.sql"]);
  const source_sha256 = createHash("sha256").update(JSON.stringify(batch)).digest("hex");
  const record = { sql: `INSERT INTO arcade_migrations VALUES ('${STORAGE_UPGRADE_VERSION}','${source_sha256}',strftime('%Y-%m-%dT%H:%M:%fZ','now'))` };
  return { version: STORAGE_UPGRADE_VERSION, source_sha256, batch: [...batch,
    { sql: "CREATE TABLE IF NOT EXISTS arcade_migrations (version TEXT PRIMARY KEY, source_sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)" }, record], record };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const artifact = await storageUpgradeArtifact();
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(artifact));
  else console.log(JSON.stringify(artifact));
}
