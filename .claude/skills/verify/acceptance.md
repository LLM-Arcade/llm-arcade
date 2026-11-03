# Acceptance table

The answer key for llmarcade.fun's verify skill. Written 2026-11-01 by the
Engineer, before the skill and before the Direction K redesign, from three
sources:

- What live `https://www.llmarcade.fun` rendered on 2026-11-01 in headless
  Chrome, as an anonymous visitor (probe record:
  `<LOCAL_PATH>`).
- `llmarcade-DESIGN.md` (Direction K, final as of 2026-11-01) and the candidate
  rows in `Shared/sprints/2026-11-01-riso-teletext-sites/VERIFY-DESIGN-ROWS.md`.
- Jeff's overrides of 2026-11-01: only 303 (Brickstorm) is a settled game number.
  Holiday themes are overlays that add no colors, scripts or requests.

The checks read this file from `origin/dev` only. A branch that edits or deletes
it, or a run where `origin/dev` has no readable copy, fails the KEY check. A
change to this file lands in its own reviewed PR.

## Status column

- **invariant** rows describe today's site and gate every merge.
- **target** rows describe the Direction K redesign. They are reported on every
  run but do not gate. A redesign PR is judged by the Reviewer on the target
  rows tagged with its build step from `llmarcade-DESIGN.md`. When a step lands,
  a separate key PR moves its rows to invariant. The same key PR rewrites any
  invariant row the step changes on purpose, such as a heading or a nav label.
- **human** rows are judged by Jeff. The skill prints `HUMAN` for them, never
  `PASS`, and gives him the screenshots and routes to look at.

## Rules for every run

- The skill drives the site as an anonymous visitor. It never submits a form,
  never signs up or logs in, never uploads, and never writes to Supabase. The
  local build reads production Supabase with the public anon key, so a write
  would be a real write.
- Text is compared after collapsing whitespace, including non-breaking spaces,
  to single spaces.

## Pages

| Route | h1 |
|---|---|
| `/` | An arcade built entirely by machines. |
| `/games` | Game floor |
| `/faq` | Questions, answered |
| `/guides` | Creator guides |
| `/playtest` | Become a playtester |
| `/signup` | Join the arcade |

## Redirects for an anonymous visitor

| Route | Lands on |
|---|---|
| `/login` | `/signup` |
| `/settings` | `/signup` |
| `/upload` | `/signup` |
| `/uploads` | `/signup` |
| `/admin` | `/` |

## Missing pages

The server answers 200 for every path, because the app is a single-page app,
so a missing page is known only by what it renders. The app has two missing
states. A page in either state is a missing page.

| State | Example route | h1 | Link |
|---|---|---|---|
| Unknown route | `/does-not-exist` | 404 | "Return to Home", to `/` |
| Unknown game | `/game/does-not-exist` | This cabinet doesn't exist. | "Back to the floor", to `/games` |

## Rows

| ID | User action | Expected result | Check | Status |
|---|---|---|---|---|
| A1 | Open each route in the Pages table | Its first `h1` matches the table | browser | invariant |
| A2 | Open each route in the Redirects table | The browser ends on the route the table names | browser | invariant |
| A3 | Open each example route in the Missing pages table | Each shows the `h1` and the link its row names | browser | invariant |
| A4 | On `/`, click each link in the header nav that points inside the site | Each click lands on a route in the Pages table and shows its `h1`, or on a game page | browser | invariant |
| A5 | Open `/games` | The number in the "N PLAYABLE" label equals the number of distinct `/game/<slug>` links on the page, and is at least 1 | browser | invariant |
| A6 | Open every `/game/<slug>` linked from `/games` | None is a missing page, and the text of the card link on `/games` that points to it contains that `h1` (probe record: `live-a6-probe.jsonl` beside `live-probe.jsonl`) | browser | invariant |
| A7 | Follow every link on the Pages routes and the game pages | No internal link reaches a missing page in either state of the Missing pages table. No external link returns a 5xx. A 4xx, a timeout or a network failure is a warning | browser, http | invariant |
| A8 | Load every Pages route and game page | No uncaught exception, no `console.error`, no error-level log entry | browser | invariant |
| A9 | Load every Pages route | No request to `/halloween/` and no `data-halloween` attribute. The Halloween 2026 theme was removed on 2026-11-01 | browser | invariant |
| A10 | Run `pnpm install --frozen-lockfile` and `pnpm run ci` in the exact tree | Exit 0. That covers lint, typecheck, build, the game harnesses and the auth harness | repo | invariant |
| A11 | Any page a branch does not mean to change | Its rendered page text matches live production. A difference is reported as CHANGED, never FAIL, and needs a reason from the branch's intent | parity | invariant |
| D1 | Load `/` | `:root` defines `--screen #111111`, `--paper #F1F0EB`, `--paper-muted #C9C9C4`, `--pink #FF48B0`, `--yellow #FFE800` and `--ink #161616` | browser | target, step 1 |
| D2 | Load every Pages route and game page | No request to `fonts.googleapis.com` or `fonts.gstatic.com`. Every font file is woff2 from the site's own origin. `public/games/typestorm.html` is unpublished and outside this row until it is fixed | browser | target, step 1 |
| D3 | Load every Pages route | No element set in VT323 computes a font size below 20px | browser | target, step 1 |
| D4 | Load every Pages route | No `box-shadow` or `text-shadow` has a blur radius above 0. No `filter` or `backdrop-filter` uses `blur()` or `drop-shadow()`. The only gradients are the ground dots (`radial-gradient`) and the coin rim (`repeating-conic-gradient`). No `linear-gradient` | browser | target, step 3 |
| D5 | Load every Pages route | Every element computes `border-radius: 0`, except a square element whose radius makes it a circle (the coin) | browser | target, step 3 |
| D6 | Load every Pages route | Text whose nearest background is `--pink` or `--yellow` computes to `--ink` | browser | target, step 3 |
| D7 | Load `/` | The game count on the home page equals the number of distinct `/game/<slug>` links on `/games` | browser | target, step 3 |
| D8 | Load `/` and `/games` at widths 360 and 390 | No horizontal scroll | browser | target, step 3 |
| D9 | On the Pages routes, find every visible three-digit number in the header nav, the index and the button bar, whether or not it is a link. The top strip's own page number is outside this row | Each one sits inside a link, and the link's target passes A7 | browser | target, step 6 |
| D10 | Open every game page | Each shows its own three-digit number in the top strip. Numbers are unique across games and between 301 and 389. Brickstorm's is 303. No other game number is fixed by this key | browser | target, step 7 |
| D11 | On a game page, give the game focus and type three digits | The page does not navigate. Games need the keyboard | browser | target, step 5 |
| D12 | Read `AI_RULES.md` and `CLAUDE.md` | Neither requires the cream and terracotta palette or bans pixel fonts. Both point to `DESIGN.md` for the visual system | repo | target, step 1 |
| H1 | Play any new or changed cabinet on `/dev/<slug>` or `/game/<slug>`, Rink Rivals included when it lands | Jeff judges the handling. The skill gives him the route and a screenshot | human | human |
| H2 | Use the email form with a test address | Jeff reaches all five states (idle, sending, success, invalid, error) and hears each through `aria-live`. The skill never submits the form | human | human |
| H3 | Look at `/` at 1440 and 390 against the Direction K mockup | Jeff judges the match. The skill gives him both screenshots | human | human |

## Known defects

Defects live production has, checked on 2026-11-01. A check reports a match as
KNOWN, not FAIL. Delete a row when its fix lands. Never add a row to make a new
failure pass.

| Row | Detail |
|---|---|
| none | No known defects on 2026-11-01 |
