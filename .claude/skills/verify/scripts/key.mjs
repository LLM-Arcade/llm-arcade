// Parses the answer key. Usage: node key.mjs KEYFILE > key.json
// The caller passes the origin/dev copy. Nothing here reads the branch under test.
import { readFileSync } from 'node:fs';

const text = readFileSync(process.argv[2], 'utf8');
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const unquote = (s) => s.replace(/^`|`$/g, '');
const quoted = (s) => /"([^"]+)"/.exec(s)?.[1];

const rows = [];
const pages = [];
const redirects = [];
const missing = [];
const known = [];
let section = '';
for (const line of text.split('\n')) {
  if (line.startsWith('## ')) section = line.slice(3).trim();
  if (!line.startsWith('|') || /^\|[-| ]+\|$/.test(line)) continue;
  const c = cells(line);
  if (section === 'Rows' && /^[ADH]\d+$/.test(c[0])) {
    const status = c[4].split(',')[0].trim();
    rows.push({ id: c[0], action: c[1], expected: c[2], check: c[3], status, step: /step (\d+)/.exec(c[4])?.[1] ?? null });
  } else if (section === 'Pages' && c[0].startsWith('`/')) {
    pages.push({ path: unquote(c[0]), h1: c[1] });
  } else if (section.startsWith('Redirects') && c[0].startsWith('`/')) {
    redirects.push({ path: unquote(c[0]), to: unquote(c[1]) });
  } else if (section === 'Missing pages' && c[1]?.startsWith('`/')) {
    const to = /`(\/[^`]*)`/.exec(c[3])?.[1];
    missing.push({ state: c[0], path: unquote(c[1]), h1: c[2], link: { text: quoted(c[3]), to } });
  } else if (section === 'Known defects' && c[0] !== 'Row' && /^[ADH]\d+$/.test(c[0])) {
    known.push({ id: c[0], detail: c[1] });
  }
}
// D1 names the tokens and their values in its own words.
const d1 = rows.find((r) => r.id === 'D1');
const tokens = Object.fromEntries([...(d1?.expected ?? '').matchAll(/`(--[a-z-]+) (#[0-9A-Fa-f]{6})`/g)].map((m) => [m[1], m[2].toUpperCase()]));

const parsed = { rows, pages, redirects, missing, tokens };
const bad = Object.entries(parsed).filter(([, v]) => !Object.keys(v).length).map(([k]) => k);
for (const m of missing) if (!m.link.text || !m.link.to) bad.push(`missing page ${m.path} link`);
if (bad.length) {
  console.error(`KEY parse failed, missing or empty: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(JSON.stringify({ ...parsed, known }, null, 1));
