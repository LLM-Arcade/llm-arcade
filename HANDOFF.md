# Neon Arcade — Handoff

A social arcade built entirely by AI agents. 30 games at launch, high scores,
achievements, badges, streaks. Full product spec: `.dyad/plans/chat-1-plan.md`.
Decision history: `DEVLOG.md`.

**Production domain: `llmarcade.fun`** — Supabase auth URL config (Site URL
+ `/**` redirect allow-list, alongside `http://localhost:8080/**` for dev)
and Google OAuth origins use it.

## Current state

**Phase 4 complete; Phase 6 started (session 11, user-directed: games before
chat).** First Track-A cabinet shipped: **Munch Maze** (`src/games/munch-maze/`),
published with 7 seeded achievements. The Phase-4 pipeline test with a second
account was explicitly skipped (user decision) — the upload wizard/admin queue
remain untested with real traffic. Site still gated
(`site_settings.launched = false`, guests → Landing, signed-in → Arcade Home
+ preview banner). **1 account (the admin), 2 published cabinets (Flap Hero
Track B, Munch Maze Track A). Munch Maze has NOT been playtested by a human
yet.**

| Route | Page | Notes |
|---|---|---|
| `/` | `LaunchGate` → `Landing` (guests) or `Home` (signed-in) | Spotlight hero honors the admin pick (`site_settings.spotlight_game_id`), falls back to featured/most-played |
| `/games`, `/game/:slug` | open pre-launch | unchanged |
| `/creator/:username` | `CreatorProfile` | unchanged |
| `/login` + `/signup` | `Login` | sign-up-first via `na-known-player`; all CTAs via `authCta()` |
| `/upload` | `Upload` (auth-gated) | 3-step wizard: metadata + manifest editor → files → **test flight** (srcDoc sandbox + SDK checklist; submit needs READY + SCORE) |
| `/uploads` | `MyUploads` (auth-gated) | status chips, rejection reasons verbatim, "Upload new version" / "Fix & resubmit" (carries prior submission via location state) |
| `/admin` | `Admin` (admin role only) | Review queue (badge count) · Games · Players · Signups · Site |
| `/settings`, `/faq`, `/playtest` | unchanged | |

## The upload pipeline (implemented)

1. Creator runs the wizard: manifest edited as a form (max 12, slugs
   auto-kebab), HTML ≤5 MB validated client-side, key art required for new
   games (optional on versions — keeps current art), test flight boots the
   file with `srcDoc` + `sandbox="allow-scripts"` and records the checklist
   (ready/score/achievement/save + invalid slug warnings).
2. Files upload to the **public `games` Storage bucket** (5 MB cap,
   html/png/jpg/webp only; INSERT policy restricts to `<uid>/…` folder; no
   client update/delete — files immutable per version). Row inserted into
   `game_submissions` (`pending`; RLS: own+admin SELECT, own INSERT only —
   max 3 pending, manifest must be array ≤12).
3. Admin reviews in `/admin`: sandbox preview straight from Storage,
   **manifest diff** vs the approved `achievements` set (+/~/− with a
   "removed = unlocks deleted" warning), submit-time checklist chips.
4. `admin_review_submission` RPC (SECURITY DEFINER): reject stores the
   reason verbatim; approve validates the manifest server-side, creates or
   updates the `games` row (track B, published, `html_path`/`art_url` =
   full Storage public URLs), **syncs `achievements` by (game_id, slug)**
   (upsert + prune, prune cascades user_achievements), awards the
   **Creator badge** (idempotent), stamps the submission.

## Admin console (all writes via SECURITY DEFINER RPCs, `is_admin()` inside)

`admin_review_submission` · `admin_wipe_scores` (returns count) ·
`admin_set_role` (can't change own role; playtester badge auto-fires via
existing trigger) · `admin_update_game` (status/featured) ·
`admin_set_spotlight` (published-only, NULL = automatic) ·
`admin_set_launched` · `admin_review_playtest` (approve → sets profile role
to playtester by email match iff current role is player). EXECUTE revoked
from PUBLIC/anon, granted to authenticated; the role check is server-side.

## Munch Maze (Track A reference implementation)

`src/games/munch-maze/` — registered in `src/games/registry.ts` (lazy):

- `maze.ts` — original 19×21 layout as strings (`#.o =GTP` legend), grid
  helpers, scatter corners, house/door/berry tiles. NOT the classic maze
  (IP hygiene).
- `engine.ts` — framework-free class: center-snapped grid movement
  (`stepActor` — turns only at tile centers, tunnel wrap, instant player
  reversal), 4 ghost personalities (chase / 4-ahead ambush / mirror-through-
  Rusty / shy), 7s scatter · 20s chase cycles (frightened pauses the clock),
  staggered house releases, eaten ghosts fade + respawn in house (**no eyes
  sprite — deliberate, avoids programmatic art**), berry at 60/120 seeds,
  per-run achievement flags, event queue drained by the component.
- `sprites.ts` — runtime magenta chroma-key + **gap-based sheet slicing**
  (falls back to equal columns), per-frame bbox trim. Track A is
  same-origin so canvas readback is legal — no data-URI trick needed.
- `render.ts` — hedge-pattern walls, sprite placement only (rotate/mirror
  muncher, bob ghosts, pulse acorns, death spin = transforms, not drawing).
- `audio.ts` — tiny WebAudio synth blips, `M` mute.
- `MunchMaze.tsx` — rAF loop, HUD (score/maze/lives/pause/mute), arrows +
  WASD + swipe, auto-pause on tab hide, READY/PAUSED/CLEAR overlays.

Assets: `public/assets/games/munch-maze/{muncher,ghosts,items,hedge}.png`
(muncher = 2-frame sheet, ghosts = 5-frame: 4 colors + frightened cream,
items = seed/acorn/berry, hedge = seamless texture). Achievement slugs fired
by the engine MUST match the seeded `achievements` rows: `first-maze`,
`full-course`, `untouchable`, `ghost-hunter`, `seed-baron`, `deep-runner`,
`maze-legend`.

## The progression engine (Phase 3, unchanged)

Client never writes progression tables — SECURITY DEFINER functions +
triggers: `unlock_achievement` RPC (manifest-validated, published games
only), XP ledger (`xp_events`, score +10 capped 200/day, first play +25,
badge rarity 25/50/100/200, #1 takeover +50), **level =
min(50, floor(sqrt(xp/40))+1)** (mirrored in `src/lib/progression.ts` —
change both!), UTC streaks in the score trigger, 8 badges seeded (7 + new
`creator`), activity feed, follows.

## Stack

- Vite + React + TS + React Router (routes in `src/App.tsx`), Tailwind +
  customized shadcn/ui, TanStack Query, lucide-react
- Supabase: Postgres + RLS (client at `src/integrations/supabase/client.ts`),
  Storage bucket `games`
- Design system "down to earth" v3 — see `AI_RULES.md` hard rules.

## Database (Supabase)

All tables RLS + **explicit grants only** — session 10 revoked the blanket
Supabase default grants from every table AND changed default privileges so
new tables start with zero client grants (see Gotchas).
**Never write to `supabase/migrations/` — schema changes via the SQL tool.**

| Table | Client access | Purpose |
|---|---|---|
| `profiles` | SELECT all; UPDATE column-grant (username/display_name/avatar_url/bio) | first signup → admin |
| `games` | SELECT only (admin writes via RPC) | + `art_url` (Storage art for uploads; `gameArt()` helper falls back to `/assets/games/<slug>.png`) |
| `scores` | SELECT + INSERT (RLS: cap, rate limit) | wipes via RPC |
| `ratings` | SELECT + INSERT/UPDATE/DELETE own | |
| `favorites`, `comments`, `follows` | SELECT + INSERT/DELETE own | |
| `waitlist`, `playtest_applications` | INSERT (anon+auth); SELECT admin-only policy | admin Signups panel |
| `site_settings` | SELECT | + `spotlight_game_id` |
| `achievements`, `badges`, `user_badges`, `user_achievements`, `activity_events` | SELECT only | |
| `xp_events` | SELECT own | |
| `game_submissions` | SELECT own+admin; INSERT own (pending only, ≤3 in queue) | upload pipeline |

**Functions:** Phase 2/3 set (`get_leaderboard`, `increment_play_count`,
`handle_new_user`, `level_for_xp`, `grant_xp`/`award_badge` internal-only,
`unlock_achievement`, `get_game_achievements`, `get_user_top_scores`,
triggers) + `is_admin()` + the 7 `admin_*` RPCs above.

## Key files

```
src/
  hooks/useSiteSettings.ts       shared settings hook (gate + Home + admin)
  hooks/useSubmissions.ts        my submissions, submit mutation (Storage upload)
  hooks/useAdmin.ts              admin queries + RPC mutations (toasts inside)
  pages/Upload.tsx               3-step wizard
  pages/MyUploads.tsx            status/rejections/new-version
  pages/Admin.tsx                section chips + role guard
  components/upload/             ManifestEditor (kebab/validation), TestFlight
  components/admin/              ReviewQueue (manifest diff), GamesPanel,
                                 UsersPanel, SignupsPanel, SitePanel
  hooks/useGames.ts              Game type + gameArt() art resolver
```

## Asset pipeline

Unchanged (AI_RULES + DEVLOG session 6). Uploaded games: key art lives in
Storage (`games` bucket) via `games.art_url`; in-repo games keep
`public/assets/games/<slug>.png`. Track-B cap 5 MB, sprites inlined as data
URIs (sandbox can't read external images back).

## Next up

1. **Playtest Munch Maze** — feel check (speeds, fright duration, collision
   forgiveness are all constants at the top of `engine.ts`), verify sprite
   sheets sliced cleanly (if a frame looks clipped, regenerate the sheet
   with clearer spacing — slicing falls back to equal columns), confirm
   achievements unlock and the score submits.
2. **More Phase 6 games** (user-directed priority): Track-A order per spec —
   Rune & Ruin → Hyper Circuit → Starfall Squadron → Run 'n Gunner →
   flagship trio last. Reuse the Munch Maze patterns (engine class + event
   queue + sprite pipeline). Track-B briefs can be dispatched through the
   real wizard anytime.
3. **Phase 5 — Chat** (deferred behind games by user decision, session 11).
4. **Phase 7 — flip `launched`** (button exists in `/admin` → Site).
5. (Whenever convenient) run one Track-B submission through the upload
   pipeline end-to-end — it's still untested with real traffic.

**Deferred:** avatar upload, `ARCADE_SAVE/LOAD` persistence, friend filter +
board virtualization, mod comment deletion, streak freeze, seasonal badges /
weekly Spotlight prize + anomaly flags (spec §4.10), Warm Seat / Dynasty /
Founding Player badges, in-browser thumbnail cropping.

## Gotchas

- **Grants are now explicit everywhere (session 10).** Supabase's default
  `GRANT ALL` to anon/authenticated was revoked on every table and via
  `ALTER DEFAULT PRIVILEGES` for future tables. **After CREATE TABLE you
  MUST add grants yourself** or every request 42501s — that's by design.
  RLS remains the row boundary; grants are the verb boundary.
- `admin_review_submission` **prunes achievements** missing from the new
  manifest — cascades `user_achievements` deletes. The review UI warns, but
  don't "optimize" the prune away: manifest = approved set is the contract.
- Uploaded games get **full Storage public URLs** in `games.html_path` /
  `art_url`; dev-hosted cabinets (Flap Hero) keep relative paths. Use
  `gameArt(game)` for art everywhere — never `gameArtPath` directly for DB
  games.
- The profiles column-grant rule stands: after ANY `ALTER TABLE profiles`,
  re-verify `information_schema.column_privileges`. `updated_at` is
  trigger-set; clients must not write it.
- Level curve in TWO places (`level_for_xp` + `src/lib/progression.ts`).
- Chart-topper fires only when #1 changes hands; ScoreTicker needs ≥5 rows
  to animate; streaks are UTC days; sandbox stays `allow-scripts`-only
  (test flight uses `srcDoc` = same opaque-origin guarantee).
- `authCta()` for every logged-out CTA — never hardcode `/login` or
  "Sign in" copy. `na-known-player` flag is device-level, never cleared.
- Slug inputs sanitize to `[a-z0-9-]` on keystroke but must NOT run
  `kebab()` per keystroke (it strips trailing hyphens — you couldn't type
  one). `kebab()` is only for deriving slugs from names/titles.
- Google provider still disabled in the dashboard (email/password works;
  the login button probes and fails friendly).
- **Track-A game rules distilled from Munch Maze:** engine fires achievement
  slugs that must exactly match seeded `achievements` rows (Track A skips
  the upload pipeline — seed via SQL and publish the games row manually).
  Sprites still AI-generated on magenta, keyed at runtime; sheet slicing is
  gap-based with equal-column fallback. Transforms (rotate/mirror/fade/
  scale) of generated sprites are fine; *drawing* shapes is not. Eaten
  ghosts respawn via fade instead of "eyes" for exactly that reason.
- Munch Maze scoring: ~15k max/maze early (158 seeds ·10 + 4 acorns ·50 +
  full combos 12k + berries). `seed-baron` 10k / `maze-legend` 30k tuned to
  that — retune both if the economy changes. Score cap 500k.
