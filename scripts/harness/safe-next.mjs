// Post-login redirect harness. Run: node scripts/harness/safe-next.mjs
// Proves the ?next= target can only stay on this site, including the
// backslash and tab forms that browsers resolve to another host.

import { safeNextPath } from "../../src/lib/safe-next.ts";

const ORIGIN = "https://www.llmarcade.fun";
let failures = 0;
const check = (raw, expected) => {
  const actual = safeNextPath(raw, ORIGIN);
  if (actual !== expected) {
    failures++;
    console.log(`FAIL safeNextPath(${JSON.stringify(raw)}) = ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
};

// Same-site paths survive, with their query and hash.
check("/", "/");
check("/game/brickstorm", "/game/brickstorm");
check("/settings?tab=profile#avatar", "/settings?tab=profile#avatar");
check("/creator/some%20one", "/creator/some%20one");
check("/%5Cevil.example", "/%5Cevil.example");

// Anything that can leave the site falls back to home.
for (const raw of [
  null,
  "",
  "game/brickstorm",
  "https://evil.example/",
  "//evil.example",
  "/\\evil.example",
  "/\\/evil.example",
  "\\\\evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "javascript:alert(1)",
  // Dot-segments that normalize to a protocol-relative path.
  "/.//evil.example",
  "/..//evil.example",
  "/%2e//evil.example",
  "/x/..//evil.example",
  "/./\t/evil.example",
]) check(raw, "/");

if (failures) {
  console.log(`safe-next: ${failures} failure(s)`);
  process.exit(1);
}
console.log("PASS safe-next: every hostile next target in this list falls back to /");
