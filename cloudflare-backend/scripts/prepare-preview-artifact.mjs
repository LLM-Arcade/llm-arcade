import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { allSchemas, schemaStatements } from "./schema-statements.mjs";
import { storageUpgradeArtifact } from "./prepare-storage-upgrade-artifact.mjs";

// Build a reviewable artifact only. No account API or deployment is called.
const batch = await schemaStatements();
const digest = value => createHash("sha256").update(value).digest("hex");
const source_sha256 = digest(JSON.stringify(batch));
batch.push({ sql: "CREATE TABLE arcade_migrations (version TEXT PRIMARY KEY, source_sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)" },
  { sql: `INSERT INTO arcade_migrations VALUES ('initial-recovery-2026-11-08','${source_sha256}',strftime('%Y-%m-%dT%H:%M:%fZ','now'))` });
batch.push((await storageUpgradeArtifact()).record);
const worker = await readFile(new URL("../dist/worker.mjs", import.meta.url), "utf8");
const artifact = { batch, source_sha256, files: allSchemas, worker, worker_sha256: digest(worker) };
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(artifact));
else console.log(JSON.stringify(artifact));
