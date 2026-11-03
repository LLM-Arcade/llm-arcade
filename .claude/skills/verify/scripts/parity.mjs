// A11: rendered page text on the build against live production, route by route.
// Usage: node parity.mjs KEY_JSON EVIDENCE_DIR   (reads the text in browser-build.json and browser-live.json)
// A difference is CHANGED, never FAIL. The branch's intent has to explain it. A receipt that
// receipt.mjs rejects, a live one made against a fixture included, is FAIL.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readReceipt, RECEIPT_SCHEMA } from './receipt.mjs';

const [keyFile, evidence] = process.argv.slice(2);
const key = JSON.parse(readFileSync(keyFile, 'utf8'));
const build = readReceipt(join(evidence, 'browser-build.json'), key);
const live = readReceipt(join(evidence, 'browser-live.json'), key);
const details = [];
let verdict;
if (build.errors.length || live.errors.length) {
  verdict = 'FAIL';
  details.push(...build.errors, ...live.errors);
} else {
  const [b, l] = [build.text, live.text];
  for (const route of [...new Set([...Object.keys(b), ...Object.keys(l)])].sort()) {
    if (b[route] === undefined || l[route] === undefined) { details.push(`${route} rendered only on ${b[route] === undefined ? 'live' : 'the build'}`); continue; }
    if (b[route] === l[route]) continue;
    let i = 0;
    while (b[route][i] === l[route][i]) i++;
    const at = Math.max(0, i - 30);
    details.push(`${route} differs at character ${i}: build "${b[route].slice(at, i + 50)}" live "${l[route].slice(at, i + 50)}"`);
  }
  verdict = details.length ? 'CHANGED' : 'PASS';
}
const result = { id: 'A11', side: 'build', verdict, name: 'rendered page text matches live production', details };
writeFileSync(join(evidence, 'parity.json'), JSON.stringify({ schema: RECEIPT_SCHEMA, side: 'build', results: [result] }, null, 1));
console.log(`${verdict.padEnd(7)} A11  build ${result.name}${verdict === 'CHANGED' ? ', each difference needs a reason from the branch' : ''}`);
for (const d of details.slice(0, 20)) console.log(`        ${d}`);
process.exit(verdict === 'FAIL' ? 1 : 0);
