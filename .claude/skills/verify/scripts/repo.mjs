// The repo rows, judged on the checkout: A10 from the ci log, and D12.
// Usage: node repo.mjs KEY_JSON REPO EVIDENCE_DIR INSTALL_EXIT CI_EXIT   (reads EVIDENCE_DIR/ci.log)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECEIPT_SCHEMA } from './receipt.mjs';

const [keyFile, repo, evidence, installExit, ciExit] = process.argv.slice(2);
const key = JSON.parse(readFileSync(keyFile, 'utf8'));
const results = [];
function report(id, ok, name, details) {
  const row = key.rows.find((r) => r.id === id);
  const verdict = ok ? 'PASS' : 'FAIL';
  results.push({ id, side: 'build', verdict, status: row.status, step: row.step, name, details });
  console.log(`${verdict.padEnd(7)} ${id.padEnd(4)} build ${row.status === 'target' ? `[target, step ${row.step}] ` : ''}${name}`);
  for (const d of details) console.log(`        ${d}`);
}

// A10: both commands exit 0, and the log shows every part the key names actually ran.
{
  const log = existsSync(join(evidence, 'ci.log')) ? readFileSync(join(evidence, 'ci.log'), 'utf8') : '';
  const bad = [];
  if (installExit !== '0') bad.push(`pnpm install --frozen-lockfile exit ${installExit}`);
  if (ciExit !== '0') bad.push(`pnpm run ci exit ${ciExit}, see ci.log`);
  for (const part of ['lint', 'typecheck', 'build', 'test:games', 'test:auth']) {
    if (!new RegExp(`^> \\S+ ${part} `, 'm').test(log)) bad.push(`ci.log shows no "${part}" step`);
  }
  const harnesses = [...new Set([...log.matchAll(/node (scripts\/harness\/[\w-]+\.mjs)/g)].map((m) => m[1]))];
  if (!harnesses.length) bad.push('ci.log shows no game harness');
  report('A10', !bad.length, 'pnpm install --frozen-lockfile and pnpm run ci exit 0', [...bad, `harnesses in the chain: ${harnesses.join(' ') || 'none'}`]);
}

// D12: neither rules file requires the old palette or bans pixel fonts, and both point to DESIGN.md.
{
  const bad = [];
  const retired = /retire|replac|no longer|old |former|do not|don't|never|instead/i;
  for (const f of ['AI_RULES.md', 'CLAUDE.md']) {
    const path = join(repo, f);
    if (!existsSync(path)) { bad.push(`${f} is missing`); continue; }
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/\b(cream|terracotta|terra)\b/i.test(line) && !retired.test(line)) bad.push(`${f}:${i + 1} asks for the cream and terracotta palette: "${line.trim().slice(0, 90)}"`);
      if (/no pixel fonts|pixel fonts? (are |is )?(banned|forbidden|not allowed)|ban\w* pixel fonts/i.test(line)) bad.push(`${f}:${i + 1} bans pixel fonts: "${line.trim().slice(0, 90)}"`);
    });
    if (!lines.some((l) => l.includes('DESIGN.md'))) bad.push(`${f} does not point to DESIGN.md`);
  }
  report('D12', !bad.length, 'AI_RULES.md and CLAUDE.md follow DESIGN.md, not the old palette and font ban', bad);
}
writeFileSync(join(evidence, 'repo.json'), JSON.stringify({ schema: RECEIPT_SCHEMA, side: 'build', results }, null, 1));
process.exit(results.some((r) => r.status === 'invariant' && r.verdict === 'FAIL') ? 1 : 0);
