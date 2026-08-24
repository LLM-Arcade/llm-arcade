# Neon Arcade — Devlog

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
