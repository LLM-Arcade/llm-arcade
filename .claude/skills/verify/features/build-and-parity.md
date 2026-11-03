# The tree and parity with production

| Row | How the check works |
|---|---|
| A10 | Removes any `dist` an earlier build left, then runs `pnpm install --frozen-lockfile` and `pnpm run ci` in the checkout. With ci failing before its build, there is no `dist` and the browser rows do not run on a stale one. Both must exit 0, and `ci.log` must show the `lint`, `typecheck`, `build`, `test:games` and `test:auth` steps. The result lists every `scripts/harness/*.mjs` the chain ran |
| A11 | Compares the rendered text of every Pages route, both missing states and every cabinet between the build and live. A difference is CHANGED with the first differing passage, never FAIL. A route that rendered on one side only is CHANGED too. The text comes from the two receipts, `browser-build.json` and `browser-live.json`, after `receipt.mjs` accepts them. A rejected receipt, such as a live one made against a fixture, is FAIL |

A11 compares whole-page text, so a cabinet's play count or a new leaderboard entry between the
two runs shows as CHANGED. Read each difference against the branch's intent. Both halves run
Chromium in UTC with the `en-US` locale, so relative dates and number formats match whatever the
hosts' own settings are. A leaderboard avatar the build host cannot load renders its fallback
initial (a lone "J" before "jeff kazzee"). That difference is the host's network, as in A8.

`vite preview` serves the `dist` that `pnpm run ci` built, so the browser rows judge the same
build A10 judged.
