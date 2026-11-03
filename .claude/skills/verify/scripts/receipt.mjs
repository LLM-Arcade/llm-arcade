// Reads a result file (a receipt) and checks it against the pinned key before any gate trusts it.
// The live receipt is made on another host, so nothing in it is taken on faith. Its side, origin
// and schema are checked, and so are the rows it may carry and the verdicts they may have. Each
// row's status comes from the key, never from the receipt.
// The file name says which receipt it is. A live receipt made against any site but production
// (a fixture, for a control) is rejected, so it can never stand in for the live verdict.
// Usage: node receipt.mjs KEY_JSON FILE   (prints PASS or FAIL RECEIPT, exits to match)
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const RECEIPT_SCHEMA = 1;
export const PRODUCTION = 'https://www.llmarcade.fun';
// A10 and D12 run on the checkout and A11 compares the two sides. Their one result is the build's.
export const BUILD_ONLY = new Set(['A10', 'A11', 'D12']);
const KINDS = {
  'browser-build.json': { side: 'build', rows: (id) => !BUILD_ONLY.has(id) },
  'browser-live.json': { side: 'live', rows: (id) => !BUILD_ONLY.has(id), origin: PRODUCTION },
  'repo.json': { side: 'build', rows: (id) => id === 'A10' || id === 'D12' },
  'parity.json': { side: 'build', rows: (id) => id === 'A11' },
};

const allowed = (row, key) => {
  if (row.status === 'human') return ['HUMAN'];
  const v = ['PASS', 'FAIL'];
  if (key.known.some((k) => k.id === row.id)) v.push('KNOWN');
  if (row.id === 'A7') v.push('WARN');
  if (row.id === 'A11') v.push('CHANGED');
  return v;
};

export function readReceipt(file, key) {
  const name = file.split(/[\\/]/).pop();
  const kind = KINDS[name];
  const errors = [];
  const reject = (why) => ({ errors: [why], results: [], text: null, writes: [] });
  if (!kind) return reject(`${name} is not a known receipt`);
  if (!existsSync(file)) return reject(`${name} is missing`);
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return reject(`${name} is not JSON: ${e.message}`);
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return reject(`${name} is not a receipt object`);
  if (json.schema !== RECEIPT_SCHEMA) errors.push(`${name} schema ${json.schema}, expected ${RECEIPT_SCHEMA}`);
  if (json.side !== kind.side) errors.push(`${name} says side "${json.side}", expected "${kind.side}"`);
  if (kind.origin && (typeof json.base !== 'string' || json.base.replace(/\/$/, '') !== kind.origin)) {
    errors.push(`${name} was made against "${json.base}", not ${kind.origin}`);
  }
  if (!Array.isArray(json.results)) errors.push(`${name} has no results list`);
  const results = [];
  const ids = new Set();
  for (const r of Array.isArray(json.results) ? json.results : []) {
    const row = key.rows.find((x) => x.id === r?.id);
    if (!row) { errors.push(`${name} has a result for "${r?.id}", which is not a key row`); continue; }
    if (!kind.rows(row.id)) { errors.push(`${name} may not carry ${row.id}`); continue; }
    if (ids.has(row.id)) { errors.push(`${name} has two results for ${row.id}`); continue; }
    ids.add(row.id);
    if (r.side !== kind.side) errors.push(`${name} ${row.id} says side "${r.side}"`);
    if (!allowed(row, key).includes(r.verdict)) errors.push(`${name} ${row.id} has verdict "${r.verdict}", allowed ${allowed(row, key).join(' ')}`);
    if (!Array.isArray(r.details) || r.details.some((d) => typeof d !== 'string')) errors.push(`${name} ${row.id} details are not a list of strings`);
    results.push({ ...r, side: kind.side, status: row.status, step: row.step });
  }
  const text = json.text ?? null;
  const writes = json.unexpectedWrites;
  if (name.startsWith('browser-')) {
    // A browser receipt carries the rendered text of every Pages route and missing state, and
    // both guard lists, even when they are empty.
    if (!text || typeof text !== 'object' || Array.isArray(text) || Object.values(text).some((t) => typeof t !== 'string')) {
      errors.push(`${name} has no rendered text map`);
    } else {
      const absent = [...key.pages.map((p) => p.path), ...key.missing.map((m) => m.path)].filter((p) => !text[p]);
      if (absent.length) errors.push(`${name} has no rendered text for ${absent.join(' ')}`);
    }
    for (const list of ['unexpectedWrites', 'blockedDuringD11']) {
      if (!Array.isArray(json[list]) || json[list].some((w) => typeof w !== 'string')) errors.push(`${name} ${list} is not a list of strings`);
    }
  }
  return { errors, results: errors.length ? [] : results, text, writes: Array.isArray(writes) ? writes : [] };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [keyFile, file] = process.argv.slice(2);
  const { errors } = readReceipt(file, JSON.parse(readFileSync(keyFile, 'utf8')));
  console.log(errors.length ? `FAIL    RECEIPT ${errors.join('. ')}` : `PASS    RECEIPT ${file.split(/[\\/]/).pop()} matches the key's rows, verdicts and origin`);
  process.exit(errors.length ? 1 : 0);
}
