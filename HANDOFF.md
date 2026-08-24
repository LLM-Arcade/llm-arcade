# Neon Arcade — Handoff

A social arcade built entirely by AI agents. 30 games at launch, high scores,
achievements, badges, streaks. Full product spec: `.dyad/plans/chat-1-plan.md`.
Decision history: `DEVLOG.md`.

## Current state

**Phase 3 complete (progression).** Achievements engine (server-validated
against approved manifests), XP/levels/streaks, badges, activity feed +
follows, creator profiles, and the real Arcade Home are live on top of the
Phase 2 platform. Site still gated (`site_settings.launched = false`) —
but the gate now only applies to **guests** (they see the Landing);
**any signed-in user gets the Arcade Home** with a preview banner
(user decision, session 8). **First signup → admin.**

| Route | Page | Notes |
|---|---|---|
| `/` | `LaunchGate` → `Landing` (guests) or `Home` (signed-in) | Home = real Arcade Home: Spotlight hero, ScoreTicker, rails, streak card, global activity |
| `/games` | `Games` (**open pre-launch**) | Era chips, tile grid |
| `/game/:slug` | `GameDetail` (**open pre-launch**) | Tabs: Leaderboard · **Achievements** · Comments · About |
| `/creator/:username` | `CreatorProfile` (open) | Level ring, stats, badge case, follow, Top scores/Achievements/Activity tabs |
| `/login` | `Login` | **Defaults to sign-up on fresh browsers**; devices that ever held a session (localStorage `na-known-player`, set in AuthContext, survives sign-out) default to sign-in |
| `/settings`, `/faq`, `/playtest` | unchanged | Settings no longer writes `updated_at` (trigger does) |

**State at handoff:** still **zero accounts** (next signup = admin), Google
provider still disabled (email/password works), Flap Hero the only published
cabinet — its 6 manifest achievements are now seeded and unlockable. No
scores/unlocks/activity data yet: **the first real playtest of the whole
loop (play → score → XP → achievement toast → badge → activity) is next.**

## The progression engine (implemented, all server-side)

Client never writes progression tables — everything flows through SECURITY
DEFINER functions + triggers:

- **Achievements** — games fire `ARCADE_ACHIEVEMENT {id}` → client calls
  `unlock_achievement(game_id, slug)` RPC (authenticated only). It validates
  the slug against the `achievements` table (the approved manifest) for a
  *published* game, inserts once, grants the achievement's XP, logs activity,
  checks the Completionist badge. Unknown/duplicate slugs are no-ops.
  Guests: unlocks are NOT recorded (only the held score is claimable);
  the Achievements tab says so.
- **XP** — ledger in `xp_events`; `grant_xp()` (internal-only) updates
  `profiles.xp/level` and logs `level_up` activity. Economy: score +10
  (capped 200/day), first play of the day +25, achievement = its `xp`,
  badge by rarity (bronze 25 / silver 50 / gold 100 / neon 200), #1 takeover
  +50. **Level = min(50, floor(sqrt(xp/40)) + 1)** — duplicated client-side
  in `src/lib/progression.ts`; keep both in sync.
- **Streaks** — UTC-day based, updated by the score trigger: consecutive
  days with ≥1 submitted score. `profiles.streak_days/best_streak/
  last_play_date`. Freeze token: deferred.
- **Badges** — seeded 7: first-coin, era-tourist (gated until ≥5 eras have a
  published game), regular (7d), chart-topper, completionist, all-nighter
  (30d), playtester (auto-awarded by trigger when role → playtester).
  `award_badge()` is idempotent; awards XP + activity.
- **Trigger** `on_score_progression` (AFTER INSERT on scores) does: streak +
  daily XP, capped score XP, first-coin, chart-topper detection (only when
  taking #1 from someone else or posting the first score), era-tourist.
- **Activity feed** (`activity_events`, public read): achievement / badge /
  top_rank / level_up. Rendered on Home (global, with actor) and profiles.
- **Follows** — plain table, follow/unfollow own rows via RLS.

## Stack

- Vite + React + TS + React Router (routes in `src/App.tsx`), Tailwind +
  customized shadcn/ui, TanStack Query, lucide-react
- Supabase: Postgres + RLS (client at `src/integrations/supabase/client.ts`)
- Design system "down to earth" v3 — see `AI_RULES.md` hard rules. Tokens in
  `src/globals.css`; Bricolage Grotesque / Inter / JetBrains Mono.

## Database (Supabase)

All tables RLS + explicit grants; `service_role` full access everywhere.
**Never write to `supabase/migrations/` — schema changes via the SQL tool.**

| Table | Access | Purpose |
|---|---|---|
| `profiles` | public SELECT; own UPDATE **(column grant: username/display_name/avatar_url/bio ONLY; leftover client INSERT grant revoked session 9 — see Gotchas)** + streak/xp/level columns | signup trigger, first user → admin |
| `games`, `scores`, `ratings`, `favorites`, `comments`, `waitlist`, `playtest_applications`, `site_settings` | unchanged from Phase 2 | scores now fire the progression trigger |
| `achievements` | public SELECT; writes service_role | per-game manifest defs (slug unique per game, xp, hint) — Flap Hero's 6 seeded |
| `user_achievements` | public SELECT; **no client writes** (RPC only) | unlocks |
| `xp_events` | own SELECT; no client writes | XP ledger (daily-cap queries) |
| `badges` / `user_badges` | public SELECT; no client writes | 7 seeded defs / earned (detail = earn story) |
| `follows` | public SELECT; own INSERT/DELETE | social graph |
| `activity_events` | public SELECT; no client writes | feed events |

**Functions:** `get_leaderboard`, `increment_play_count`, `handle_new_user`
(Phase 2) · `level_for_xp` · `grant_xp` + `award_badge` (**EXECUTE revoked
from clients**) · `unlock_achievement` (authenticated only) ·
`get_game_achievements(game_id)` (defs + unlock counts + player count) ·
`get_user_top_scores(user_id)` (best + rank per game) ·
`handle_score_progression` / `handle_role_badges` / `touch_updated_at`
(triggers).

## Key files

```
src/
  lib/progression.ts             level curve (mirror of DB!), badge icons, timeAgo
  hooks/useAchievements.ts       defs+stats, my unlocks, unlock mutation (toast)
  hooks/useProgression.ts        profile-by-username, badges, top scores, unlocks,
                                 activity, ticker scores, follows
  pages/CreatorProfile.tsx       /creator/:username
  pages/Home.tsx                 real Arcade Home (behind gate)
  components/progression/        AchievementsPanel, AchievementToast (stamp anim),
                                 LevelRing, BadgeCase, ActivityFeed, StreakCard
  components/arcade/ScoreTicker.tsx  marquee (animates only with ≥5 scores)
  components/arcade/GamePlayer.tsx   now wires onAchievement → unlock RPC
public/games/flap-hero.html      fires the 6 seeded achievement slugs
```

## Asset pipeline

Unchanged — see AI_RULES + DEVLOG session 6: AI-generated key art
(`public/assets/games/<slug>.png`, flat vector earthy prompt template) and
real in-game sprites (magenta-key + data-URI trick for alpha in sandboxed
iframes). Track-B cap 5 MB.

## Next up (per spec §9)

1. **Verify the full loop live** — sign up (becomes admin), play Flap Hero,
   confirm: score XP + streak, achievement toasts, first-coin/chart-topper
   badges, activity feed, profile stats, ticker.
2. **Phase 4 — Upload wizard + Admin**: review queue (manifest diff →
   seeds `achievements`), Storage hosting, score wipes, role grants
   (playtester badge auto-fires), spotlight picker (Home currently uses
   featured/most-played published game).
3. **Phase 5 — Chat.** **Phase 6 — Track-A games** (Munch Maze first).
   **Phase 7 — flip `launched`.**

**Deferred:** avatar upload (Storage), `ARCADE_SAVE/LOAD`, friend filter +
board virtualization, mod comment deletion, streak freeze token, seasonal
badges/weekly Spotlight prize, Warm Seat/Dynasty/Founding Player badges
(need playtime tracking / cron / launch date).

## Gotchas

- **`profiles` column-grant regression (fixed session 7):** full-table
  UPDATE had been granted to anon+authenticated, letting any user set their
  own `role/xp/level`. Now: REVOKE + column grant on the 4 safe columns.
  Session 9 also revoked a leftover full-column INSERT grant (not
  exploitable — no INSERT policy — but clients never insert profiles; the
  signup trigger does). **After any `ALTER TABLE profiles`, re-verify
  `information_schema.column_privileges`.** `updated_at` is set by the
  `touch_updated_at` trigger — clients must NOT include it in updates
  (permission denied).
- The level curve lives in TWO places: `public.level_for_xp` and
  `src/lib/progression.ts`. Change both or rings/labels lie.
- Streak days are **UTC** dates; daily/weekly boards remain rolling windows.
- `unlock_achievement` trusts the client like scores do (accepted risk) but
  only for slugs in the approved manifest of a published game.
- Chart-topper/top_rank fires only when #1 changes hands (self-beats are
  silent) — don't "fix" the activity spam by removing that guard.
- ScoreTicker marquee needs ≥5 rows; below that it renders static (and a
  copy strip when empty). Reduced-motion users get the static version free
  via the global media query.
- `--radius` is 1rem; gate wraps only `/` and now only gates **guests**
  (signed-in = Arcade Home + banner); sandbox stays `allow-scripts`-only;
  score-submit "security" string check = rate limit.
- Login mode detection is device-level (`na-known-player` in localStorage) —
  intentionally never cleared on sign-out.
