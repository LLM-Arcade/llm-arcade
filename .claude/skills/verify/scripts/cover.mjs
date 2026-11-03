// COVER, INVARIANTS, GUARD and the target count. Usage: node cover.mjs KEY_JSON EVIDENCE_DIR
// Every receipt passes receipt.mjs first, so a row's status comes from the key and a live
// receipt counts only when it was made against production. Every key row needs a result on every
// side it applies to. A result on one side never covers the other. A human row must say HUMAN.
// A target passes on a side only when its result there is PASS.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_ONLY, readReceipt } from './receipt.mjs';

const [keyFile, evidence] = process.argv.slice(2);
const key = JSON.parse(readFileSync(keyFile, 'utf8'));
const results = [];
const writes = [];
const rejected = [];
for (const f of ['repo.json', 'parity.json', 'browser-build.json', 'browser-live.json']) {
  const r = readReceipt(join(evidence, f), key);
  rejected.push(...r.errors);
  results.push(...r.results);
  writes.push(...r.writes.map((w) => `${f} ${w}`));
}

const missing = [];
for (const row of key.rows) {
  for (const side of BUILD_ONLY.has(row.id) ? ['build'] : ['build', 'live']) {
    if (!results.some((r) => r.id === row.id && r.side === side)) missing.push(`${row.id}/${side}`);
  }
}
const failedTargets = (side) => key.rows.filter((row) => row.status === 'target' && !(BUILD_ONLY.has(row.id) && side === 'live'))
  .filter((row) => results.find((r) => r.id === row.id && r.side === side)?.verdict !== 'PASS').map((row) => row.id);

console.log(rejected.length ? `FAIL    RECEIPT ${rejected.join('. ')}` : 'PASS    RECEIPT every result file matches the key, and live was made against production');
console.log(missing.length ? `FAIL    COVER no result: ${missing.join(' ')}` : 'PASS    COVER every key row has a result on every side it applies to');
const failedInvariants = (side) => results.filter((r) => r.side === side && r.status === 'invariant' && r.verdict === 'FAIL').map((r) => r.id);
const [ib, il] = [failedInvariants('build'), failedInvariants('live')];
console.log(`${ib.length || il.length ? 'FAIL' : 'PASS'}    INVARIANTS failed_build=${ib.length} failed_live=${il.length} build:[${ib.join(' ')}] live:[${il.join(' ')}]`);
console.log(writes.length ? `FAIL    GUARD the site tried to write to Supabase: ${[...new Set(writes)].join(', ')}` : 'PASS    GUARD no write to Supabase was attempted outside D11');
const build = failedTargets('build');
const live = failedTargets('live');
console.log(`TARGETS targets_failed_build=${build.length} targets_failed_live=${live.length} build:[${build.join(' ')}] live:[${live.join(' ')}]`);
process.exit(!rejected.length && !missing.length && !ib.length && !il.length && !writes.length ? 0 : 1);
