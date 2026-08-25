# LLM Arcade — Devlog

Running log of decisions and actions. Newest at the bottom.

---

## Session 1 — Foundation & Phase 1

**Goal:** Design system + Coming Soon experience from the v2 spec
(`.dyad/plans/chat-1-plan.md`).

**Actions**
- Connected Supabase; created `waitlist`, `playtest_applications`,
  `site_settings` (RLS + explicit grants, insert-only for visitors,
  single-row settings with `launched=false`).
- Built Landing (waitlist form with duplicate-email-as-success), `/faq`
  (deep-linkable accordions), `/playtest` (application form + perks),
  `LaunchGate` on `/`.

**Design v1 — "neon violet" (REJECTED)**
- Dark indigo base, electric violet/cyan/pink, glow rings, Space Grotesk,
  ASCII-rain hero. Straight from the spec's §2 token table.
- **Verdict:** user rejected hard. It was the textbook "AI slop" aesthetic —
  dark mode + purple glow + glassy rounded cards. Confirmed via web search
  that this is literally the recognized generic-AI look.

## Session 2 — Design v2 — "warm CRT / attract mode" (REJECTED)

**Decision:** kill all purple/blue. Went warm near-black + signal red +
marquee amber + phosphor green, Press Start 2P pixel wordmark, hard 4px
offset shadows, scanlines, scrolling ticker, blinking "OPENING SOON".

**Verdict:** rejected — "childish, lazy." Pixel-font cosplay and neubrutalist
hard shadows read as a costume, not a design. A severe editorial follow-up
(sharp corners, condensed display type) was started and cancelled midway —
too far the other direction.

## Session 3 — Design v3 — "down to earth" (APPROVED ✅)

**Reference:** user shared a Poki screenshot — take the *layout energy*
(games-first, dense tile wall, real product feel), not the colors.

**Decisions**
- Palette: warm paper `#F6F1E7`, ink text, terracotta `#C4491F` primary,
  olive + mustard support. Light theme. No neon anywhere.
- Type: Bricolage Grotesque display, Inter body, JetBrains Mono for data.
- Layout: sticky header → compact hero with inline waitlist → game tile wall
  (featured 2×2 + 1×1 tiles, "SOON" chips, era tags) with utility tiles mixed
  into the grid (playtester recruit, catalog stat) → facts strip → footer.
- Visuals carry the design: generated 8 cohesive key-art pieces (flat vector,
  earthy palette, paper grain) for the launch lineup instead of placeholders.
- Craft: focus rings, `aria-pressed` chips, lazy images + real alt text,
  reduced-motion safe, soft shadows + hairline rings.

**Verdict:** approved ("great").

## Session 4 — Brand assets & docs

**Actions**
- Logo: round terracotta arcade-token mark with cream joystick
  (`public/assets/brand/logo-mark.png`) — now in header, footer, favicon.
- 4 more key-art tiles: Sky Defense, Gem Columns, Kickflip City, Trailbound.
  Wall now shows **12 of 30 revealed**.
- Wrote `HANDOFF.md` (state, rules, pipeline, next steps) and this devlog.

**Standing rules distilled from feedback**
1. Never purple/blue/neon-glow ("AI slop").
2. Never pixel-font/blinking childish retro.
3. Games and imagery first; the layout should feel like a real product.
4. Warm, grounded palette; craft details matter (a11y, motion restraint).

**Next:** Phase 2 — auth (Google OAuth), profiles, game registry,
`/game/:slug` with sandboxed player + Arcade SDK, leaderboards.

## Session 5 — Conventions & session-handoff prep

**Actions**
- Audited all file/asset names; established conventions (PascalCase
  components/pages, kebab-case modules/assets, `useCamelCase` hooks,
  UPPERCASE root docs, snake_case DB). Asset slugs already matched — no
  renames needed.
- Extracted the landing's inline game array into `src/data/launch-lineup.ts`
  (typed `RevealedGame`, `Era` union, `TOTAL_LAUNCH_GAMES`, `gameArtPath()`);
  the "N OF 30 REVEALED" counter is now derived, not hardcoded.
- Rewrote `AI_RULES.md` as the persistent entry point for fresh sessions:
  doc index (HANDOFF/DEVLOG/spec), non-negotiable design rules, naming
  conventions, stack notes.

**Convention:** every future session appends a DEVLOG entry and keeps
HANDOFF.md's "Current state" section truthful.

## Session 6 — Phase 2: Platform core ✅

**Goal:** auth + profiles, game catalog, sandboxed player + Arcade SDK,
leaderboards, ratings/favorites/comments (spec §9 Phase 2).

**Schema:** `profiles` (signup trigger; username from email; **first account
becomes admin** so the gate can be operated without manual SQL), `games`
(12 seeded from the lineup), `scores`, `ratings`, `favorites`, `comments`,
plus `get_leaderboard()` and `increment_play_count()`. Anti-cheat v1 lives in
RLS itself: published-game check, per-game `score_cap`, 1 insert/10s/user/game.
`profiles` uses **column-level UPDATE grants** so users can never touch
role/xp/level.

**Decisions**
- **Custom login page** instead of `@supabase/auth-ui-react`: the package
  predates React 19 (peer-dep risk) and default-styled auth would violate the
  "never ship default shadcn/generic look" rule. Google OAuth button + email/
  password, `?next=` redirect, open-redirect guarded. Google works once the
  provider is enabled in the Supabase dashboard; email works immediately.
- **Launch gate bypass** for playtester/moderator/admin with a mustard
  preview banner; gate now wraps `/games` and `/game/:slug` too.
- **Guest score interception** (spec §4.4): run held in sessionStorage
  (30 min TTL, keeps best of multiple guest runs), auto-claimed after
  sign-in. Zero-score runs are never submitted.
- **Daily/weekly = rolling 24h/7d windows** (simpler + honest; labeled in UI).
- **Shipped one Track-B game early** (Flap Hero, `public/games/flap-hero.html`)
  even though games are Phase 6 — the platform loop (SDK → score → board →
  claim) needed a real cabinet to be testable end-to-end. It's the reference
  implementation for the external-agent brief: manifest JSON block, SDK
  postMessages, attract state, pause, touch + keyboard, palette-conformant.
- Achievements: SDK parses `ARCADE_ACHIEVEMENT` and Flap Hero fires them, but
  the platform ignores them until the Phase 3 manifest-validated engine.

**Deferred:** avatar upload (needs Storage), SAVE/LOAD persistence, friend
filter, board virtualization, mod deletion of comments.

**Addendum (user decisions):**
- Landing header now links to Games + Sign in (there was no door in).
- **Game floor opened to guests pre-launch** — user asked to "just play as
  guest". `LaunchGate` now wraps only `/`; `/games` + `/game/:slug` are
  public. Guest interception (play → held score → sign in to claim) is now
  fully testable pre-launch. Revisit gating at Phase 7 if secrecy matters.
- Google OAuth attempt surfaced `validation_failed: provider is not enabled`
  (raw JSON from the authorize endpoint — supabase-js builds the URL
  client-side, so no catchable pre-redirect error). Needs dashboard setup;
  email/password remains the working path.
- **In-game art must be real generated assets, not programmatic canvas
  shapes** (user: vector-drawn bird = "low quality"). Flap Hero now renders
  4 AI-generated sprites: parallax valley backdrop, carved pillar texture
  (cap = top 16% of the texture, mirrored for the top pipe), scrolling
  ground strip, and the bird. The bird is generated on solid magenta,
  inlined as a data URI (1.3 MB → 1.7 MB HTML, under the 5 MB Track-B cap)
  and chroma-keyed + trimmed at runtime — data URIs dodge canvas tainting
  inside the opaque-origin sandbox, where URL-loaded images can't be read
  back. Vector drawing kept only as a silent fallback. This is now part of
  the Track-B agent brief: ship real art, inline anything needing pixel work.

**Session close — state for session 7:** zero accounts in the DB (first
signup → admin) · Google provider still disabled (email/password works) ·
Flap Hero is the only published cabinet; no scores/comments/ratings data yet ·
full recipe + rules distilled into HANDOFF.md and AI_RULES.md. Next: verify
the play → score → claim loop end-to-end, then start **Phase 3 (progression)**
— achievements engine first so Flap Hero's manifest events stop being ignored.

## Session 7 — Phase 3: Progression ✅

**Goal:** achievements engine, XP/levels/streaks, badges, activity feed +
follows, real Arcade Home (spec §9 Phase 3).

**Security fix first:** discovered `profiles` had **full-table UPDATE granted
to anon+authenticated** — any signed-in user could have set their own
role/xp/level (RLS row policy alone doesn't restrict columns). Revoked and
re-granted column-level UPDATE on username/display_name/avatar_url/bio only.
`updated_at` is now maintained by a `touch_updated_at` trigger (Settings no
longer writes it — it would be denied). Rule going forward: after ALTERs on
profiles, re-check `information_schema.column_privileges`.

**Schema:** `achievements` (per-game manifest defs; Flap Hero's 6 seeded from
its JSON block), `user_achievements`, `xp_events`, `badges` (7 seeded) +
`user_badges`, `follows`, `activity_events`; `profiles` gains
streak_days/best_streak/last_play_date. Clients can only write `follows`;
everything else moves through SECURITY DEFINER functions with EXECUTE revoked
where internal (`grant_xp`, `award_badge`).

**Engine decisions**
- `unlock_achievement(game_id, slug)` RPC validates against the approved
  manifest (published games only), is idempotent, grants XP, logs activity,
  checks Completionist. Client-trust accepted like scores (v1 stance).
- XP economy: +10/score (200/day cap), +25 first play of day, achievement =
  manifest xp, badge rarity 25/50/100/200, #1 takeover +50. **Level =
  min(50, floor(sqrt(xp/40))+1)** — mirrored in `src/lib/progression.ts`.
- Streaks = consecutive **UTC** days with ≥1 score, updated in the score
  trigger; freeze token deferred.
- Chart-topper/top_rank only fires when #1 changes hands; era-tourist gated
  until ≥5 eras have published games; playtester badge auto-awards via role
  trigger (ready for Phase 4 approvals).
- Guests: achievements are NOT held/claimed (only scores are) — Achievements
  tab tells them; keeps the held-run payload simple.

**UI:** Achievements tab on GameDetail (locked hint + global unlock %,
unlocked date), stamp-animation unlock toast, `/creator/:username` (level
ring, stats strip, badge case, follow, top scores/achievements/activity),
real Arcade Home (Spotlight = featured/most-played published game until the
Phase 4 admin picker, ScoreTicker marquee — animates only with ≥5 rows,
rails, streak card, global feed), Profile link in the header menu.

**Session close — state for session 8:** still zero accounts; nothing
runtime-tested against real data (type checks clean, RPCs smoke-tested in
SQL). **First action next session: sign up and run the whole loop** — score
→ XP/streak → toasts → badges → feed → profile — then start Phase 4
(upload wizard + admin, incl. spotlight picker and playtester approvals).

## Session 8 — Sign-up default + Arcade Home for all players

**User feedback:** sign-up should be the default for browsers without an
account, and "we don't even have a home page yet" — the Arcade Home existed
but was invisible: the gate only showed it to playtester/mod/admin, and with
zero accounts everyone was stuck on the Landing.

**Decisions**
- **`na-known-player` localStorage flag** (`src/lib/known-player.ts`), set in
  AuthContext whenever a session exists (covers email, OAuth, restored
  sessions) and deliberately **never cleared on sign-out**. Login defaults:
  fresh browser → "Join the arcade" (sign-up), known device → "Welcome back"
  (sign-in). Toggle link unchanged; storage failures fail open to sign-up.
- **Gate loosened (user decision):** pre-launch, guests still get the
  Landing (waitlist front door), but **any signed-in user** now gets the
  real Arcade Home with a "PRE-LAUNCH PREVIEW · SCORES & STREAKS ALREADY
  COUNT" banner. Role-only bypass is gone; revisit at Phase 7 if needed.

**Next: Phase 4 (upload wizard + admin) in a new chat** — review queue that
seeds `achievements` from manifests, Storage hosting for Track-B files,
spotlight picker, score wipes, role grants, playtester approvals. Still zero
accounts: first signup becomes admin and should playtest the full
progression loop before building on top of it.

## Session 9 — Pre-flight verification of the progression loop

**Goal:** clear the runway for the first live playtest (HANDOFF next-step 1)
by verifying everything server-side that can be verified without a human.

**Verified green (SQL + code inspection):**
- Data state: `launched=false`, 0 accounts (next signup → admin, confirmed
  in `handle_new_user` source), 0 scores/unlocks/activity — clean slate.
- Seeds: 7 badges, Flap Hero published (`score_cap` 1000) with its 6
  manifest achievements; slugs in `public/games/flap-hero.html` match the
  seeded rows exactly (checked via file scan — grep false-negatives on the
  1.7 MB data-URI lines, don't trust it for that file).
- Wiring: `GamePlayer` routes `onAchievement` → `unlock_achievement` RPC
  (signed-in only) and invalidates profile/activity/ticker queries on score
  submit.
- Engine plumbing: all 4 triggers present (`on_score_progression`,
  `on_role_badges`, `on_profiles_touch`, `on_auth_user_created`); EXECUTE
  correctly revoked on `grant_xp`/`award_badge`, `unlock_achievement`
  authenticated-only; RLS enabled on all 16 public tables.

**One fix:** `anon`+`authenticated` still held a leftover **full-column
INSERT grant on `profiles`** (incl. role/xp/level) from before the session-7
column-grant fix. Not exploitable today (profiles has no INSERT policy), but
clients never insert profiles — revoked. Grants now: SELECT all columns,
UPDATE on the 4 safe columns only, no INSERT.

**Addendum — split auth routes (user request):** `/login` and `/signup` are
now separate routes rendering the one `Login` component (mode derived from
the URL — truthful, shareable, back-button-friendly). The session-8
sign-up-first default survives as a redirect: fresh devices (no
`na-known-player` flag) hitting `/login` are `Navigate`d to `/signup` with
the query string preserved, so every existing `/login?next=…` link in the
app keeps working unchanged. The mode toggle is now a real `<Link>` between
the routes (carries `?next=`, sets location state `manual` so an explicit
"Sign in" choice on a fresh device isn't bounced straight back). The two
routes swap without remounting, so a mode-change effect clears stale
error/notice copy.

**Addendum 2 — consistent auth CTAs (user request):** every logged-out CTA
was hardcoded "Sign in" → `/login`, so fresh visitors clicked a button
labeled "Sign in" and landed on "Join the arcade" — inconsistent. New
`authCta(next?)` helper in `src/lib/known-player.ts` is the single source
of truth: known devices (flag set) get "Sign in" → `/login`, fresh devices
get "Sign up" → `/signup`, with `?next=` encoded in one place. Rewired all
8 call sites: SiteHeader, Landing header, GamePlayer game-over panel
("Sign up to claim this score"), CommentsPanel composer gate,
AchievementsPanel guest note, StreakCard, CreatorProfile follow button,
Settings auth redirect. Login's held-score banner copy is mode-aware now
too. **Rule going forward: never hardcode `/login`/`/signup` links or
"Sign in" copy in components — always `authCta()`.**

**Addendum 3 — Google button fails in-app now:** user hit the session-6
`validation_failed: provider is not enabled` raw-JSON page again. The
provider still needs dashboard setup (Google Cloud OAuth client + enable in
Supabase Auth providers — can't be done via SQL). Code-side fix: the Google
button now calls `signInWithOAuth` with `skipBrowserRedirect: true`, probes
the authorize URL with `fetch(..., { redirect: "manual" })`, and only
navigates when the endpoint doesn't answer 400 — a disabled provider shows a
friendly in-app error instead of dumping the player on raw JSON. Probe
failures (CORS/network) fall through to navigation, so a working provider
is never blocked.

**Addendum 4 — production domain:** `llmarcade.fun`. Supabase auth URL
config set up around it: Site URL `https://llmarcade.fun`, redirect
allow-list `https://llmarcade.fun/**` + `http://localhost:8080/**` (dev).
Google OAuth client (when enabled) needs `https://llmarcade.fun` as an
authorized JS origin; the redirect URI stays the Supabase callback.

**Next:** the human playtest itself (sign up → play → score/XP/streak →
toasts → badges → feed → profile → ticker), then Phase 4.

## Session 10 — Playtest verified + Phase 4: Upload pipeline & Admin ✅

**Playtest happened.** First account signed up (→ admin) and played Flap
Hero. Verified server-side, ledger math exact: first-flight unlock (+10),
daily +25 / score +10, first-coin (+25), chart-topper (+100, correctly
treated the first-ever score as a takeover), top-rank +50 → **220 XP =
level 3**, streak 1, six activity events incl. two level-ups. Zero
anomalies — the Phase 3 engine works on real traffic.

**Security first — the grants story was fiction.** The audit revealed
Supabase's platform default grants ALL on every table to anon+authenticated
(the sessions 7/9 fixes had only patched `profiles`). Not exploitable —
RLS default-denies writes without policies — but the "explicit grants"
convention existed only on paper. Fixed for real: `REVOKE ALL` on every
public table, explicit re-grants matching the RLS policy map exactly
(xp_events auth-SELECT only, waitlist/playtest INSERT-only + new
admin-read policies, etc.), plus `ALTER DEFAULT PRIVILEGES` so **future
tables start with zero client grants — CREATE TABLE now requires explicit
GRANTs or requests fail**. New `is_admin()` helper (SECURITY DEFINER).

**Phase 4 schema:** `game_submissions` (pending/approved/rejected, manifest
+ checklist jsonb, versioning; own+admin SELECT, own INSERT ≤3 pending),
`games.art_url`, `site_settings.spotlight_game_id`, `creator` badge
(silver, 8 total), public `games` Storage bucket (5 MB, html+images,
uploads locked to `<uid>/…` folders, files immutable).

**Admin RPCs** (all SECURITY DEFINER + internal `is_admin()`):
`admin_review_submission` — reject-with-reason or approve → validates
manifest server-side, creates/updates the `games` row (Storage public URLs
in `html_path`/`art_url`), **syncs `achievements` by (game_id, slug) with
prune** (manifest = the approved set; removals cascade unlocks — surfaced
in the review UI, intentional), Creator badge, all in one transaction ·
`admin_wipe_scores` · `admin_set_role` (self-change blocked; playtester
badge auto-fires) · `admin_update_game` (status/featured) ·
`admin_set_spotlight` (published-only, NULL = automatic) ·
`admin_set_launched` · `admin_review_playtest` (email-match role grant,
only upgrades plain players).

**UI:** `/upload` 3-step wizard (manifest form editor with auto-kebab
slugs; 5 MB/2 MB client validation; slug-taken + already-queued checks;
**test flight** = srcDoc iframe in the production sandbox with a live SDK
checklist — submit requires READY + SCORE, unknown achievement slugs get a
red callout), `/uploads` (status chips, rejection reasons verbatim,
new-version/resubmit via location state), `/admin` (section chips: Review
queue with pending-count badge + sandbox preview + manifest diff (+/~/−),
Games (status/featured/spotlight/wipe with confirms), Players (search +
role select), Signups (playtest approve/decline + waitlist CSV export),
Site (launch flag behind a scary confirm). Header menu: My uploads for
everyone, Admin for admins. Home spotlight honors the admin pick with the
old automatic fallback; `gameArt()` resolves Storage art vs the /assets
convention everywhere.

**Craft note:** slug inputs sanitize per keystroke to `[a-z0-9-]` but must
not run `kebab()` per keystroke — it strips trailing hyphens, which makes
typing one impossible. Caught and fixed in both slug fields.

**Session close — state for session 11:** 1 account (admin), Flap Hero
still the only cabinet, upload pipeline untested with real traffic. Next:
run a Track-B game through the full pipeline (second account → wizard →
queue → approve → floor), then Phase 5 (chat) / Phase 6 (Track-A games,
Munch Maze first) — Track-B agent briefs can now point at the real wizard.

## Session 11 — Phase 6 begins: Munch Maze 🌳

**User decision:** skip the second-account pipeline test entirely and jump
the phase order — games now, chat later. Phase 5 formally deferred; noted
in the plan's progress tracker.

**Shipped: Munch Maze**, the first Track-A cabinet (`src/games/munch-maze/`,
registered in the previously-empty `gameRegistry`). Published with 7 seeded
achievements (`first-maze`, `full-course`, `untouchable`, `ghost-hunter`,
`seed-baron`, `deep-runner`, `maze-legend` — slugs mirror the engine's
`achieve()` calls).

**Design decisions**
- **Original 19×21 maze** (not the classic layout — IP hygiene), defined as
  legend strings in `maze.ts`. Hand-checked: no dead ends, tunnel row wraps,
  4 power acorns, 158 seeds, ghost house with one-way door.
- **Engine as a framework-free class** with an event queue the React shell
  drains once per frame (sfx / achievements / gameover→onScore). Center-
  snapped grid movement: turns only at tile centers, instant reversals,
  capped dt so nothing tunnels through walls.
- **Ghost AI = classic target-tile model, renamed personalities:** Rusty
  (direct chase), Sprig (4 ahead), Marigold (mirrors Rusty through a point
  2 ahead), Bramble (shy — retreats inside 8 tiles). 7s scatter / 20s chase;
  frightened pauses the mode clock; staggered house releases at 0/2.5/5.5/
  8.5s.
- **Eaten ghosts fade out and respawn in the house** instead of returning as
  "eyes" — eyes would have required drawn art, which the no-programmatic-art
  rule bans. Fade + respawn reads fine and keeps the rule intact.
- **Sprite pipeline evolved for Track A:** same magenta-key generation
  recipe, but same-origin means runtime `getImageData` is legal — no data-
  URI inlining. New trick: single-generation **multi-frame sheets** (2-frame
  muncher chomp, 5-ghost row incl. frightened cream variant, 3-item row)
  keep style consistent across frames; slicing detects transparent gaps and
  falls back to equal columns; every frame gets bbox-trimmed. Walls are the
  generated hedge texture as a canvas pattern.
- **Palette conformance in-game:** frightened state is pale cream (not the
  classic blue — blue is banned), ground is dark soil, HUD/overlays use the
  site's mustard/olive/terra chips. WebAudio synth blips (original, no
  samples), M mute / P pause / auto-pause on tab hide, swipe steering on
  touch.
- Berry bonus at 60/120 seeds eaten spawns below the house (300 + 100·level
  capped). Ghost combos 200→1600. Fright duration 7.5s shrinking to 2s by
  maze 6; ghost speed +0.25 tiles/s per maze, capped just above player
  speed.

**State for session 12:** Munch Maze is **untested by a human** — engine
logic was desk-checked only. First action: playtest it (tuning constants
live at the top of `engine.ts`; watch for sprite-sheet slicing artifacts —
regenerate sheets with clearer spacing if frames clip). Then keep shipping
Phase 6 games (Rune & Ruin next per spec order) and circle back to the
pipeline test + Phase 5 chat eventually.

## Session 12 — Two more cabinets: Rune & Ruin ⚔ and Trailbound 🐂

**Shipped #2: Rune & Ruin** (`src/games/rune-ruin/`, Track A, 8 seeded
achievements) — the classic-Rogue homage and the **precedent for the whole
Text & Originals shelf**: the board is a real DOM character grid (JetBrains
Mono spans), *typography, not canvas* — fonts are not programmatic art, so
the no-drawn-art rule stays intact with zero sprites needed.

- 40×22 procgen floors (rooms + L-corridors + one loop), Bresenham LOS,
  radius-7.5 FOV with remembered-tile dimming.
- Turn-based engine, same event-queue contract as Munch Maze but **no rAF
  loop** — the shell runs one engine turn per input. 9-monster depth-banded
  bestiary (slow/fast/erratic traits), bump combat, ×1.7 XP curve,
  auto-equip gear, tonics, 1 HP/10-turn regen.
- Discovery: turn-based cabinets need no in-game restart — fire `onScore`
  on death and GamePlayer's RUN OVER panel remounts a fresh engine.
- Vi keys + 80 ms input throttle (held keys walk, don't sprint); touch
  D-pad with hold-repeat on `pointer: coarse` only.

**Shipped #3: Trailbound** (`public/games/trailbound.html`, **Track B** per
the catalog — first Track-B cabinet since Flap Hero, dev-hosted). Oregon
Trail homage with fully original geography (Split Creek → Golden Valley,
1,120 mi — zero MECC names/assets, invented forts & rivers).

- Day-tick travel loop (640 ms auto-days while "SET OUT"), pace × rations ×
  weather math, region-based weather (mountains after mile 640), party of
  five with per-member HP.
- Choice-modal events (trail fever/axle/riders = decisions; berries/
  salvage/snakes = flavor), fort trading posts, river crossings
  (ford-risk-by-depth / ferry / wait-for-lower-water), and a
  stop-the-marker hunt minigame (perfect center = `sharp-eye`).
- Survivor score: survivors·500 + health·2 + supplies + speed bonus; total
  party death submits miles·2 instead. Cap 10k.
- Art: journey panorama that **pans with trail progress** (whole 1,120 mi
  mapped across one generated landscape) + magenta-keyed wagon sprite
  (chroma-keyed at runtime — data URIs aren't origin-tainted even in the
  sandbox, the documented trick). Final file 4.48 MB, under the 5 MB cap.
- Gotcha hit: `games.era` is CHECK-constrained (no "Amiga/DOS" combo —
  it's `Amiga` or `DOS`), and **teaser rows already exist as
  `coming_soon`** for lineup games (Trailbound's row, lineup entry, and key
  art slot all pre-existed) — UPDATE, don't INSERT, and check
  `launch-lineup.ts` before adding entries.

**State for session 13:** THREE unplaytested cabinets now (Munch Maze,
Rune & Ruin, Trailbound) — a feel-check pass is overdue before the pile
grows. Balance knobs: Munch Maze top of `engine.ts`, Rune & Ruin Tuning
block + `content.ts`, Trailbound's PACES/RATIONS/event weights near the top
of its `<script>`. Then more Phase 6 (spec order: Hyper Circuit → Starfall
→ Run 'n Gunner → flagship trio; more Track-B catalog picks fair game too).
Pipeline live-test + Phase 5 chat still deferred.

## Session 13 — Starfall Squadron 🚀 + the asset diet

**User mandates (both recorded in AI_RULES):**
1. **Game queue reordered:** Starfall Squadron → Rockbuster → Boulder Rush
   → Hyper Circuit (overrides the spec's Hyper-Circuit-first order).
2. **Asset diet:** 4–5 MB per game is too heavy for the web. In-game art
   must be light — the fix that actually works with our PNG-only generator
   is prompting for **flat solid colors with NO paper grain/noise/
   gradients** (noise is what defeats PNG compression). Starfall's two
   sheets landed at **1.18 MB total** vs Munch Maze's 4.3 MB and
   Trailbound's 4.5 MB inline payload. Grain stays on key-art tiles only.

**Shipped #4: Starfall Squadron** (`src/games/starfall-squadron/`, Track A,
Arcade shelf, 7 achievements) — the Galaga homage and the second sprite-
pipeline cabinet.

- 40-enemy formation (4 captors / 16 warriors / 20 drones) with global
  sway + breathe; staggered bezier entries that blend into live slot
  positions over the last 18% of the path.
- Dive scheduler scales with wave (interval 2.1s→0.55s, 1→4 simultaneous
  divers); divers fire aimed shots at path thresholds; challenge waves
  every 4th (3 trains × 8, no return fire, perfect = +3000).
- **The capture mechanic:** captors beam-dive to mid-screen, tractor cone
  pulses, caught fighter tweens up and docks on the captor. Kill that
  captor *mid-dive* → the fighter glides back down and docks → dual
  fighter (4 shots, wider hitbox). Kill it in formation → fighter lost.
  Beam hit while dual just strips the dual (generous on purpose).
- Kill chains (<1.3 s apart): ×2 points at 5, ×3 at 10 — feeds Hot Streak /
  Unbroken achievements.
- Two sheets only (ships.png 730 KB, fx.png 447 KB), sliced by the reused
  Munch Maze gap-slicer. Starfield = instanced star sparkle sprite at
  varied scale/alpha (transforms, not drawn dots). Beam cone = generated
  sprite stretched to the player row with pulsing alpha.
- Engine detail: wave-clear breather runs on engine time, not
  `setTimeout` — pause-safe.

**State for session 14:** FOUR unplaytested cabinets (add Starfall).
Queue next: **Rockbuster** (B, Arcade, Asteroids homage) → Boulder Rush
(B, DOS) → Hyper Circuit (A, SNES, Mode-7 showpiece). Track-B builds must
respect the asset diet — flat sprites, small sheets, no fat panoramas.
Pipeline live-test + Phase 5 chat still deferred.

## Session 14 — Rockbuster ☄ (first Track-B on the asset diet)

**Shipped #5: Rockbuster** (`public/games/rockbuster.html`, Track B,
Arcade shelf, 7 achievements) — the Asteroids homage, dev-hosted like
Flap Hero/Trailbound, published via SQL (teaser row UPDATEd, not
inserted).

- **Asset diet proof for Track B:** two flat sheets (ships/fx 436 KB,
  rocks 514 KB) inlined as data URIs → **1.26 MB total HTML** vs
  Trailbound's 4.48 MB. Sheets prompted flat-solid-color/no-grain on
  magenta; runtime chroma-key + gap-based column slicing with
  equal-column fallback + per-sprite bbox trim (the Munch Maze recipe,
  rewritten inline for the sandbox).
- **Instancing everywhere:** ONE rock sheet (3 variants) drawn at 3
  scales for L/M/S; saucer sprite at 2 scales for big/small; the spark
  sprite quadruple-duties as starfield, explosion debris, saucer bullets,
  and hyperspace flash. 5 + 3 sprites render the whole game.
- Classic loop: wraparound physics, rocks split L→2M→4S (20/50/100 pts),
  max-4 bullets with ship-velocity inheritance, big saucer (200, random
  fire) vs small saucer (1000, aimed with error shrinking as score
  grows), Shift/H hyperspace with 14% jump-death risk, extra ship every
  10k, safe-spot respawn check. Fields grow 4→11 rocks, speed scales
  with field number. Balance knobs in `TUNE` at the top of the script.
- Touch: on-screen pads (rotate/thrust/fire/hyper) shown via
  `pointer: coarse`; tap-to-start; auto-pause on tab hide; M mute;
  WebAudio synth (fire blip, filtered-noise booms by size, thrust
  rumble loop, two-tone saucer warble, extra-life jingle).
- Achievement slugs (seeded + fired): `first-blast`, `clean-sweep`,
  `saucer-down`, `dead-eye`, `untouchable`, `deep-space` (field 5),
  `rock-legend` (15k). One `ARCADE_SCORE` per run on game over with
  stats (field, rocks_busted, saucers_downed, accuracy).

**State for session 15:** FIVE unplaytested cabinets. Queue next:
**Boulder Rush** (B, DOS, Boulder Dash homage) → Hyper Circuit (A, SNES).
Pipeline live-test + Phase 5 chat still deferred.

## Session 15 — Boulder Rush ⛏ (second Track-B diet cabinet)

**Shipped #6: Boulder Rush** (`public/games/boulder-rush.html`, Track B,
DOS shelf, 7 achievements) — the Boulder Dash homage, dev-hosted,
published via SQL (teaser row UPDATEd; key art already existed from the
session-3 lineup batch and was kept).

- **1.43 MB total** on the asset diet: two flat sheets (tiles 558 KB /
  actors 543 KB) inlined as data URIs, magenta-keyed + gap-sliced with
  the Rockbuster recipe. Dirt tile variety via mirrored transforms on
  alternate cells — one frame does the whole cave.
- **Procedural caves instead of handcrafted layouts** (also IP hygiene —
  zero First Star level data): 40×22 grid, steel border, random brick
  segments, carved pockets, 5×3 critter chambers, boulders/gems scattered
  on remaining dirt, quota = 62% of placed gems, exit hatch replaces a
  far border cell. Difficulty scales to cave 10 (quota 10+2n, time
  135−5n, density up, more bugs). Death regenerates the same cave fresh —
  no stuck states carry over; R self-detonates (costs a life) as the
  explicit anti-softlock valve.
- **Classic BD physics preserved:** single top-down scan with `moved`
  flags, 8 ticks/s, 1-cell-per-tick falls, rounded-surface rolling
  (boulder/gem/brick), falling-only kills, player-supported boulders
  (dig-under escape), 55%/tick pushes, Shift-grab digging. Wall-follower
  bugs: gnats turn left / beetles turn right; touch = detonation;
  crushed beetles rain 3×3 gems (the score farm that feeds `gem-hoard`).
- Economy: gems 15/30 (pre/post quota), bugs 50, clear bonus 2×seconds
  left, extra life per 2k (max 6), cap 250k. `swift-pick` retuned from
  30→60 spare seconds mid-session (30 was near-automatic on cave 1's
  130 s clock). `rush-legend` 7,500 ≈ 10+ caves or beetle farming.
- Slugs seeded + fired: `first-spark`, `daylight`, `bug-squasher`,
  `gem-hoard`, `swift-pick`, `deep-digger`, `rush-legend`.

**State for session 16:** SIX unplaytested cabinets — the feel-check pass
is now seriously overdue. Queue next: **Hyper Circuit** (A, SNES, Mode-7
showpiece) → Run 'n Gunner → flagship trio. Pipeline live-test + Phase 5
chat still deferred.

## Session 16 — Hyper Circuit 🏁 (Track A, the mode-7 showpiece, stand-in art)

F-Zero homage grand prix at `src/games/hyper-circuit/`: three original
circuits, four rivals, shield economy (boost spends, rails and bumps
drain, pit strip refills, zero = blowout DNF), session ghost of your best
lap replayed translucent at 30 Hz. Registered in the registry but the DB
row stays `coming_soon`: Zo image generation was down all session, so
every sprite is a borrowed Starfall/Munch Maze sheet behind a
`// STAND-IN ART:` comment, and publishing waits on the real art set.

- **Renderer is the flagship piece:** per-pixel mode-7 ground sampler
  (precomputed row depths, incremental world walk, fog blend, reused
  ImageData, zero per-frame allocation) over a ground texture composed
  once per circuit from the same centerline table the physics use. Flat
  road/terrain fills ride the Munch Maze level-geometry exception;
  everything else is stamped sprite transforms.
- **Geometry lessons paid for in blood:** uniform Catmull-Rom cusps on
  unevenly spaced control points (a designed 145-radius hairpin measured
  curv·hw 2.47), so courses run centripetal knots, and curvature is
  Menger on a 96-unit chord because short chords measure spline ripple,
  not corner radius. A circle-of-known-radius probe separated the
  measurement bug from a real geometry bug.
- **Balance found by harness, felt in browser:** brake now beats an
  active boost burn (before that, a burn carried into the hairpin was an
  unavoidable 6-hit rail grind), and the rival rubber band tightened from
  1.06 to 1.03 overspeed because 1.06 glued the pack to the player and
  bled shield through bumps. Terrace Canyon widened 54→58 and rail base
  cost 4→3 after the ace bot kept dying there. `boost-artist` relaxed
  6→5 clean boosts (6 demanded perfect play in a ~33 s race).
- **Proof:** `node scripts/harness/hyper-circuit.mjs` (committed) checks
  geometry validity, an ace bot winning circuit 1 and finishing the GP at
  18,546 of the 40k cap with every achievement, and a cruiser bot proving
  `clean-circuit`. Browser playtest via the new dev lever: full GP driven
  by a console autopilot through the real key handlers, all 7 slugs
  logged, one score payload, pause/mute/touch overlay verified, DNF path
  exercised, boost flame and speed streaks retuned brighter after the
  first pass looked timid.
- **New permanent lever:** `/dev/:slug` (DEV builds only) mounts any
  registry cabinet with console-log stubs, plus `window.__hc` exposes the
  engine for autopilot playtests. Future Track-A cabinets get browser
  playtests before their rows publish.
- Slugs seeded (via `db/seed-hyper-circuit.sql`, teaser row UPDATE):
  `first-finish`, `front-runner`, `clean-circuit`, `ghost-chaser`,
  `boost-artist`, `grand-circuit`, `circuit-legend`.

**State for session 17:** SEVEN cabinets await the human feel-check pass.
Queue next: **Run 'n Gunner** → flagship trio. Hyper Circuit needs art
regeneration + row publish when Zo is back. Pipeline live-test + Phase 5
chat still deferred.

## Session 16 addendum — platform, pipeline, and review (orchestrator)

**Rename:** the site is LLM Arcade (llmarcade.fun) everywhere a player
looks: wordmark, alt text, FAQ, title, OG/canonical meta, CSV export,
doc headers. Old DEVLOG entries keep the Neon Arcade name.

**CI/CD proven:** `pnpm check` (lint + typecheck + build) is the gate,
enforced by `.githooks/pre-push` and mirrored in
`.github/workflows/ci.yml`. Hosted Actions runs green on this repo
(the old billing assumption was wrong). Push → CI → Vercel →
llmarcade.fun verified by playing Rockbuster live as a guest.

**Four-angle adversarial review** (security, platform, Track A games,
Track B games), all confirmed findings fixed and verified in the real
runtime: Munch Maze level-clear softlock (regression probe committed at
`scripts/harness/munch-maze-clear-race.ts`), one-ARCADE_SCORE-per-run
guard in GamePlayer, mute-state desync in all three Track A cabinets,
Starfall breather bullet freeze, Rockbuster saucer-drone leak,
Trailbound hidden-tab travel, pad multi-touch releases, Settings
username race, admin approval now invalidates single-game queries.
"Sunforged Blade" renamed Sunsteel Blade (branding ban). Two findings
need decisions, not code: uploaded HTML is publicly reachable in
Storage before review (fix is a private bucket + signed URLs), and the
eslint gate now exempts generated shadcn ui files.

**Trailbound diet:** 4.48 MB → 1.17 MB with zero gameplay change
(panorama quantized, wagon pre-keyed at build time). New art for it,
and all new cabinet art, is blocked: Zo media generation is down with
`media_billing_target_missing`, a Zo-subscription line item only the
user can restore via Zo support.

**TypeStorm (B, `public/games/typestorm.html`, 8 ach)** built as the
text-shelf typing cabinet, 36 KB, simulator-tuned, all eight
achievements earned in one live run. It is deliberately NOT seeded in
the DB: it will be the first real submission through the upload wizard
and admin queue, which creates its rows via the approval RPC. Blocked
until the user signs in on llmarcade.fun in the driven browser.

**DB:** Hyper Circuit teaser row updated (cap 40k, coming_soon) and its
7 achievements seeded through the Supabase dashboard SQL editor.

## Session 17 — Run 'n Gunner 🔫 (Track A, run-and-gun, stand-in art)

- **Run 'n Gunner** (A, `src/games/run-n-gunner/`, 7 ach): Contra-homage
  side scroller, fully original. Three chunk-built stages (Canyon Road,
  Scrap Ramparts, Dynamo Core), forward-only camera, runner/turret/lobber/
  supply-drone enemies, six parameterized bosses (mid + end per stage),
  three weapon crates (FAN spread, RAKER auto, SLUG piercing), drop-through
  platforms, checkpoint respawns, 3 HP × 3 lives with i-frames. Social
  hook: a full clear without losing a life doubles the run score and earns
  `one-life-run`. Cap 100k, `TUNE` in `stages.ts`.
- **Fairness rules found by the harness, kept for humans:** enemies aim at
  the standing center at the player's last grounded height (a jump is a
  real dodge, nothing tracks you mid-air), boss volleys keep 1.25 s of
  daylight between them, bosses never fire mid-charge, and the boss patrol
  floor is `arenaX + 220` so holding distance can't corner you on the
  camera wall. Each rule closed a repeatable death the trace bots hit.
- **Beatability harness** `node scripts/harness/run-n-gunner.mjs`: a grunt
  bot (late dodges) and an ace bot both full-clear; the ace proves the
  one-life run and all 7 slugs; cap never exceeded; 12/12 PASS after the
  aim fix. Browser playtest on `/dev/run-n-gunner` via the console
  autopilot: victory at 33.7k, five slugs logged live, one score payload,
  pause/mute/touch pads/drop-through verified; bolt draw size retuned
  after the first pass rendered shots as giant capsules.
- **STAND-IN ART** (Zo still down): borrowed Starfall ships/fx + Munch
  Maze items sheets, every load site tagged `// STAND-IN ART:`. Final
  sheets to generate: gunner.png (3), foes.png (5), fx.png (5),
  pickups.png (3). Row seeded `coming_soon` via `db/seed-run-n-gunner.sql`
  (INSERT ... ON CONFLICT — no teaser row exists for this slug).

## Session 18 — Hyper Circuit original art + publication

- Replaced every borrowed Hyper Circuit sprite with four generated original
  flat-color assets: five angular racing craft, four warm effects, three
  track stamps, and a sparse desert-scrub tile. The magenta sheets were
  recomposed with deterministic gutters, palette-quantized, and stripped to
  18,302 bytes total (1.75% of the 1 MiB cabinet budget).
- The runtime gap-slicer found exactly 5/4/3 frames. The beatability harness
  stayed PASS and `pnpm check` stayed green. A real keyboard browser run on
  `/dev/hyper-circuit` reached racing speed, used steering and boost, and
  ended in a rail-hit DNF; the mid-play review showed a cohesive warm
  terracotta/olive set with clean keying and no clipart mismatch.
- Hyper Circuit shipped atomically, deployed through Vercel, and was opened
  to guests with `db/publish-hyper-circuit.sql`; the production guest run
  was played through game over and screenshotted before Run 'n Gunner work
  began.

## Session 18 — Run 'n Gunner original art + publication

- Replaced all borrowed cabinet art with an original three-pose gunner,
  five machine foes, five combat effects, three weapon crates, and a new
  square canyon key-art tile. The four magenta sheets were manually
  recomposed into equal cells, palette-quantized, and stripped; the runtime
  slicer resolves exactly 3/5/5/3 frames.
- In-game sheets total 9,950 bytes and the 768 px key art is 320,084 bytes:
  330,034 bytes total, or 31.47% of the 1 MiB cabinet budget. The player and
  foes now mirror as side-view sprites; engine, stages, scoring, collision,
  and balance code did not change.
- Both cabinet harnesses print PASS and `pnpm check` is green. Real keyboard
  play on `/dev/run-n-gunner` exercised movement, jumping, firing, damage,
  and enemies; the generated set stayed legible and cohesive at cabinet
  scale, with clean chroma keying and no clipart clash.
- Run 'n Gunner shipped in its own commit after Hyper Circuit was already
  live, deployed through Vercel, and was opened to guests with
  `db/publish-run-n-gunner.sql`; a fresh guest run reached game over on the
  production route and was screenshotted.

## Session 19 — Protected dev/prod delivery workflow

- Replaced direct-to-main delivery with a two-stage branch model: game
  feature branches start from `dev` and merge by green PR; releases promote
  `dev` to `prod` through a second green PR. Legacy `main` is frozen.
- Expanded the single CI contract to `pnpm run ci`: lint, typecheck,
  production build, Hyper Circuit harness, and Run 'n Gunner harness. The
  local pre-push hook and GitHub Actions run the same command.
- Added repeatable GitHub protection configuration with strict required
  checks, pull-request-only changes, linear history, conversation
  resolution, no force pushes/deletions, and admin enforcement. The target
  Vercel production branch is `prod`, but that external setting remains a
  release gate: the local Vercel session is logged out, and GitHub's
  deployment records confirm Vercel still ignores `dev` and `prod` pushes.
- Visual acceptance is an explicit gate, not something CI can infer:
  changed cabinets must be keyboard-played at `/dev/<slug>` and checked for
  asset failures, frame clipping, sprite overlap, animation jank, console
  errors, and palette cohesion before promotion.

## Session 19 — Hyper Circuit animation quality pass

- Kept the five original craft sprites and made their motion stateful:
  damped player steering bank, track-heading rival bank, independent hover
  and thruster phases, capped near-camera rival scale, and animated cruise
  and boost flames. The previously unused shield asset now pulses behind
  the craft during boosts and low-shield warnings.
- Moved every craft/flame composition through one anchored renderer. The
  first browser pass exposed a boost flame crossing the canvas bottom; the
  player anchor moved up and the second pass showed the full effect with no
  edge clipping or sprite distortion.
- Fixed the cabinet canvas itself after mobile proof found the 400×260
  render stretched into a 342×362 box. Container-relative sizing now holds
  1.5385 exactly on desktop and 390 px mobile, with no horizontal overflow.
- Real keyboard steering/boost proof stayed in the racing phase with all
  four rivals rendered. A 120-frame stress sample measured 6.95 ms average,
  7.3 ms p95, 7.9 ms max, and zero frames over 25 ms; the Hyper harness and
  TypeScript gate remained green without physics or balance changes.

## Session 19 — Run 'n Gunner animation quality pass

- Generated `foes-motion.png`, a flat-color magenta-keyed companion row with
  alternate poses for the existing runner, turret, lobber, drone, and boss.
  The source prompt preserved the original silhouettes and rust/olive/cream
  palette while asking for stride, recoil, brace, rotor, and cannon motion.
  Cleanup left exactly five gap-sliced frames with no detached fragments.
- Paired each base foe with its alternate at role-specific frame rates. The
  gunner's existing run and jump poses now use the same stable foot anchor;
  grounded foes and bosses cannot sink, hop, or clip through the floor when
  differently proportioned frames alternate. Pickup sway, orb pulse, muzzle
  recoil, and restrained airborne lean add feedback without changing rules.
- Real keyboard play exercised movement, jumping, firing, damage, and enemy
  encounters. Controlled side-by-side staging of all five foe classes showed
  fixed ground contact and separated silhouettes. A 120-frame move-and-fire
  sample measured 6.88 ms average, 7.4 ms p95, 7.7 ms max, and zero frames
  over 25 ms, with no browser errors or missing assets.
- Fixed the same mobile canvas stretch found in Hyper Circuit. The 640x360
  logical frame now renders at 832x468 desktop and 342x192.375 at 390 px
  mobile width, both exactly 16:9 with no overflow. The new 3,005-byte sheet
  brings in-game art to 12,955 bytes and total cabinet art to 333,039 bytes,
  31.76% of the 1 MiB budget. No engine, stage, collision, score, or balance
  code changed.

## Session 23 — Lastwatch phase 2: the whole game, headless

- Built the complete Lastwatch simulation in `src/games/lastwatch/`: a
  DOM-free 60 Hz deterministic engine (seeded mulberry32, event queue,
  relative imports) covering movement, three class kits, five weapons per
  class with quality tiers, armor, consumables, the five-district hold
  with convex-room portal pathing, twelve Gloam types across three
  intelligence tiers with engine-level coordination, four milestone
  bosses, the valor economy, downs and revives, difficulty levels,
  scoring, and all twelve achievements.
- `scripts/harness/lastwatch.mjs` proves the phase 2 gate and now runs in
  `pnpm test:games`: determinism by event-log hash, an ace duo reaching
  wave 22 on Long Watch, casual floors at all three difficulties on all
  three classes (nine runs, every one surviving the full 300 s window),
  a do-nothing loss, exact kit arithmetic, coordination and raid stages,
  five partner behaviors, economy and difficulty arithmetic, district
  effects, the flood cap, and 12/12 achievements firing in simulation.
- The harness earned its keep before any renderer exists. It caught the
  knight partner's heavy swing never releasing (zero melee damage all
  run), the Shepherd besieging unkillably from outside the walls, lone
  hexers and slit-camping lobbers softlocking waves, boss caches
  auto-claiming before the player could choose, and a gear ladder that
  could strand a class on its starting weapon for ten waves. Each fix is
  an engine rule now: bosses present themselves, artillery presses in,
  no walker outruns a sprinting archer, guaranteed rack slots never
  offer sidegrades, and an idle leftover horde retreats instead of
  freezing the night.
- Calibration replaced guesses per the GDD's (cal) contract: watch-legend
  landed at 20,000 (sloppy ceiling 1,782, skilled floor 46,438), the wave
  budget quadratic settled at 2.2 -> 2.0, concurrency capped at 32, and
  characters catch their breath (30% of missing HP) when the horn quiets.

## Session 23 — Lastwatch phases 3 and 4, and the first live playtest

- Phase 3: the 3D realm on three.js 0.185.1 (pinned exact, release well
  past the 72-hour rule). Fire-lit warm night from the sim's own room
  data, a rippling apocalyptic sky shader with a low ivory moon, an
  instanced 17-type horde with ember eyes, rigid-part hero figures,
  runtime stone/plank/cobble textures, tracer-free flying arrows,
  elemental spell glows, splinters, death presentations, and the DOM
  HUD with barks, boss bars, ledger, and command wheel. Measured on the
  dev machine: 1.2 ms average, 2.6 ms max render at near-1080p.
- Phase 4: the synthesized score and full SFX in WebAudio, no files.
  Layered siege bed keyed to the wave, ledger motif, answering horn,
  per-class footsteps, ducking. Mixed low under the action by direction.
- Jeff played mid-build and his findings drove a round of rulings:
  physical rebuildable barricades, visible board destruction, surface
  texture, arrows as arrows with a first-person draw, elemental magic,
  and a real sword-swing arc. All applied and re-proven; the harness
  ace gate recalibrated to the Coalhide milestone (observed band 15 to
  22) with the wave-20 trigger staged.
- Ship prep: `db/seed-lastwatch.sql` (12 achievements, cap 5,000,000,
  upsert-safe) and `db/publish-lastwatch.sql` as files only, GDD carried
  onto this branch with a revision 3 record. Key art is blocked on the
  image-generation outage (`media_identity_missing`) and stays the one
  missing deliverable; the row stays coming_soon.

## Session 21 — Game stage becomes the page hero (desktop)

- The play stage was capped at a fixed 520 px and shared its row with a
  300 px sidebar, so on any desktop monitor the cabinet rendered small and
  off-center. GamePlayer now scales to `min(74vh, 820px)` at the `lg`
  breakpoint, GameDetail moves the player above the meta/sidebar grid at
  full `max-w-7xl` width, and DevGame gets the same treatment.
- Measured at 1440x900: the stage grew from about 800x520 (left-aligned)
  to 1232x666 centered, and Hyper Circuit's canvas from about 740x480 to
  935x608. Mobile and tablet layouts are unchanged; only `lg:` rules were
  added.

## Session 21 — Brickstorm 🧱 (Track A, brick breaker, Matter.js)

- **Brickstorm** (A, `src/games/brickstorm/`, 7 ach): brick breaker across
  three boards (Pottery Workshop, Olive Greenhouse, Terracotta Kiln) built
  from the finished session-20 art pack. Matter.js 0.20.0 (pinned, first
  physics dependency) drives ball contacts at a fixed 120 Hz substep;
  everything above it (damage, chains, drops, boards, scoring) is plain
  seeded state, so the node harness replays the exact simulation. Six brick
  materials with engine-owned hp (tile/glass 1, plaster/mosaic 2, firebrick
  3, basalt 4) map hp to the sheet's four damage rows. Eight powerups draw
  from a reshuffled bag so variety is guaranteed: expand, split, slow, fire,
  shield, sticky, extra life, x2. Score cap 50,000; `storm-legend` at 12,000.
- **Paddle deflection is the whole game feel:** the bounce angle comes from
  hit offset with a 62-degree clamp and a 12 percent minimum deflection,
  because a dead-center return loops forever (the ace bot proved it by
  stalling 900 simulated seconds). Matter's velocity unit is px per 1/60 s
  regardless of substep, so one `toMatterSpeed` helper owns the conversion.
- **Review pass caught four bugs before browser proof:** the expand powerup
  grew the visual paddle but never the collision body (fixed with
  `Matter.Body.scale` plus a harness proof), ball spin and streak frames
  shared one normalization canvas so the ball shrank at speed, powerup
  icon/pulse pairs normalized in separate families, and auto-pause fired on
  the victory screen.
- **Chroma despill:** the shared soft-fringe rule kept anti-aliased magenta
  pixels at partial alpha, which read as a purple halo on the dark playfield
  panel and turned the crack/debris sprites into purple spider legs (banned
  palette). The Brickstorm slicer now subtracts the magenta component
  (min(r,b) above g) instead; a playfield readback counts zero
  magenta-leaning pixels and the crack overlay reads charcoal with ember
  tips. Worth porting if any other cabinet shows purple fringe on dark
  ground.
- **Harness** `node scripts/harness/brickstorm.mjs` (in `test:games`): ace
  bot full-clears at 15,020 with zero lives lost and all seven slugs; grunt
  clears board 1; idle bot proves the loss path; two same-seed runs match
  exactly; edge proofs cover expanded-paddle contact, corner speed, double
  destroys in one substep, multiball drain, 60 s max-speed containment,
  serve reset, board handover, chain reset, and the score cap under forced
  multi.
- **Headless browser proof** (pane hidden, so rAF was simulated by stepping
  the real engine/render modules via dynamic import): all seven assets 200,
  zero console errors, engine step plus full 2x draw 0.33 ms avg / 1.3 ms
  max over 120 frames, canvas exactly 16:9 at desktop and 375 px mobile
  with no overflow, and captured frames for all three boards, multiball
  with expanded paddle, and the board-clear badge moment. Human keyboard
  play on `/dev/brickstorm` still pending Jeff's approval session.
- Row seeded via `db/seed-brickstorm.sql` (upsert; a teaser row exists for
  this slug), publish flip in `db/publish-brickstorm.sql`. Neither has been
  run against Supabase yet.

## Session 21 — Gem Columns 💎 (Track A, falling-triad puzzle)

- **Gem Columns** (A, `src/games/gem-columns/`, 7 ach): falling-triad puzzle
  over the session-20 art pack. Three wells (Artisan Foundry, Conservatory,
  Archaeological Archive), each drawing six of the ten authored gem
  identities; matches run horizontal, vertical, and both diagonals with
  cascades. One `Int8Array` grid (3 hidden spawn rows + 13 visible), every
  rule a pure function (`simulateDrop`, `findMatches`, `applyGravity`) shared
  verbatim by the harness ace bot, seeded PRNG, framework-free.
- **Economy depth pass (review finding):** the first build's spread between a
  bare finish (3,885 floor) and a perfect run (4,140) was 6 percent, which
  flattens the leaderboard, and gem-legend at 3,500 fired below the victory
  floor. Now chains pay x3 then x6, cells past three in one step earn +20
  each, and each well pays a speed bonus of 8/s under a 90 s par capped at
  600. Ace seed spread became 5,996 to 6,159 and gem-legend sits at 5,000:
  finishing alone cannot reach it, speed and cascades can.
- **Render polish from headless frames:** next-triad preview laid out
  horizontally to match the authored three-slot frame, score digits in ink on
  the cream plaque band, danger meter clamped at 0 FREE, and the falling
  piece clipped to a 44 px well-mouth window so spawning gems no longer
  float over the surround's crown art. The Brickstorm magenta despill is
  ported; a full-canvas spill scan counts zero magenta-leaning pixels.
- **Harness** `node scripts/harness/gem-columns.mjs` (in `test:games`):
  greedy ace victory on six seeds via the engine's own `simulateDrop`,
  stacker loss path, same-seed determinism, and staged proofs for diagonal
  matches, overlap counted once plus the big-clear bonus, three-step cascade
  multipliers, spawn blocking, danger-dancer, and the 60,000 cap.
- Headless browser proof: assets 200, zero console errors, engine step plus
  full draw 0.13 ms avg / 0.6 ms max, frames captured for all three wells.
  Seed row era corrected to Genesis to match `launch-lineup.ts`. Human play
  on `/dev/gem-columns` still pending approval. Seed/publish SQL not run.
- Post-playtest redesign from Jeff's feedback: the cabinet widened from
  720x540 to 960x540 so the canvas fills the stage (210 px HUD bands plus
  the 540 px environment exactly), the next-triad gems now sit on the
  frame's measured ring-slot centers (the authored triplet is right of the
  trimmed bbox center: fractions 0.352/0.636/0.909), the falling piece
  clips to the well mouth, and the danger state lost its mid-board flashing
  sprite and "0 FREE" text in favor of column chevrons plus the meter icon.

## Session 21 — Sky Defense 🛡️ (Track A, interception)

- **Sky Defense** (A, `src/games/sky-defense/`, 7 ach): interception game
  across the Desert Relay, River City, and Mountain Observatory. Eight
  fictional threat families (the manifest's vocabulary only), an
  eight-bearing battery, bursts that kill only while growing, and ember
  mines that chain. The organizing structure is the burst group: one shot
  opens a group, its burst and every chained detonation credit it, and it
  settles when nothing in it can still kill, so multi-kill scoring is a
  property of the data.
- Region health (100, +30 repair between regions) drives the horizon art
  tiers at 67/34 and the building damage states; zero regional damage earns
  `perfect-sky`. Accuracy at or above 80 percent pays 400 per region, so
  balloon decoys are a real economy. `defense-legend` is 11,500, calibrated
  against a 24-seed ace floor of 12,610 and a degraded-aim bot that tops
  out at 11,220: a scraped win cannot reach it.
- The desert horizon sheet is authored as 3 rows of 360x40, not the 3
  columns its manifest claims; the corrected rects live in `sprites.ts`
  (seam analysis confirmed y=40/y=80) and the manifest stays untouched.
  The launch-lineup alt text for this slug described real weapons and now
  uses the fictional vocabulary.
- **Harness** `node scripts/harness/sky-defense.mjs` (in `test:games`):
  lead-aiming ace wins all six seeds (spread 12,680 to 13,880), a no-lead
  sloppy bot loses, same-seed determinism, and staged proofs for burst
  timing, ember chains crediting one group, health tiers, the ammo cycle,
  zero-damage balloons, the accuracy gate, and the cap.
- Headless-built; browser play on `/dev/sky-defense` pending, and the
  burst-growth-versus-skiff-speed lead requirement is the difficulty knob
  to feel out (`TUNE.burstGrow`).
- Review pass: props-ui.png diverges from its manifest past cell 4 (six
  building states, weather shifted one cell, radar chrome where the manifest
  claims reticle/cursor cells, two decorative leftovers). The slicer now
  names the true cells, erases six measured stray sub-motifs after keying,
  damaged bridges and observatories use their own authored frames, and the
  aiming reticle comes from the effects sheet's ring cell.

## Session 21 — Kickflip City 🛹 (Track A, skate lines, Matter.js)

- **Kickflip City** (A, `src/games/kickflip-city/`, 7 ach): three districts
  on 75 s clocks, crouch-loaded ollies, flip/grab tricks as authored-pose
  transforms (the sheet ships four states per facing, not the wishlist
  twelve), rail grinds with a balance meter, and line scoring that banks on
  a 1.2 s settle. A bail voids the unbanked line and six seconds.
- Anti-spam economy from review: plain ollies pay but never grow the
  multiplier, repeated moves in one line decay to a 0.4 floor, and
  city-legend recalibrated to 9,000 against ace 11,170..14,185 versus a
  never-links plodder ceiling of 5,280.
- Live-review renders: mirror-tiled district panorama (the art has no seam
  match), a pavement face with dimmed art below instead of a dead ink slab,
  street life stepped off the play lane, ground-anchored parallax only, and
  chip-backed clock/line readouts. Three engine findings recorded for the
  next Matter cabinet: own the forward speed instead of reading vx back,
  ground from contact normals not bounding boxes, and the normal points at
  the skater (y -1 on supports).

## Session 21 — The Undervault 🕯️ (Track A flagship, turn-based expedition)

- **The Undervault** (A, `src/games/the-undervault/`, 7 ach): five seeded
  depths behind their surround art, typography floor with sprite actors,
  eleven monster families with traits, five gimmick bosses, four playable
  portraits, relics, statuses, traps, a merchant, and event cards. Turn
  contract follows Rune & Ruin; a 20-seed harness sweep proves every floor
  reaches its boss, stair, and items with keys outside their locks.
- The pack's manifest is wrong in three ways the pixels settled: gutters
  were punched into a continuous frieze (cells straddle them; the slicer
  closes gutters and cuts by measured bands), eleven families ship rather
  than twelve (no vault leech), and seven portraits rather than eight.
- vault-legend is 6,000: no failed harness run reaches it (best loss
  3,975) and every clear passes it (lowest win 6,902). Live-review polish:
  taller monster draws, bigger player token, ink underlay beneath the
  region-panel captions, and the portrait chooser no longer auto-pauses
  into an unclickable state when the tab hides.
