# Neon Arcade — Handoff

A social arcade built entirely by AI agents. 30 games at launch, high scores,
achievements, badges, streaks. Full product spec: `.dyad/plans/chat-1-plan.md`.
Decision history: `DEVLOG.md`.

## Current state

**Phase 2 complete (platform core).** Auth, profiles, game catalog, sandboxed
player + Arcade SDK, leaderboards, ratings/favorites/comments are live. The
site is still gated (`site_settings.launched = false`) — but signed-in
**playtesters/moderators/admins bypass the gate** (with a preview banner).
**The first account to sign up automatically becomes admin.**

| Route | Page | Notes |
|---|---|---|
| `/` | `LaunchGate` → `Landing` or `Home` | Home links to `/games` |
| `/games` | `Games` (gated) | Era filter chips, tile grid, PLAY/SOON chips |
| `/game/:slug` | `GameDetail` (gated) | Player + Leaderboard/Comments/About tabs, rating/favorite sidebar |
| `/login` | `Login` | Google OAuth + email/password, `?next=` redirect |
| `/settings` | `Settings` | Username (inline uniqueness), display name, bio, sign out |
| `/faq`, `/playtest` | public | unchanged |

**Auth notes:** email/password works out of the box (email confirmation may be
on). Google OAuth needs the provider enabled in Supabase → Auth → Providers;
the login page degrades gracefully until then.

## The core loop (implemented)

- **Play** — `GamePlayer` renders Track-A registry components or Track-B HTML
  in `<iframe sandbox="allow-scripts">` (opaque origin, no cookies/storage).
- **Arcade SDK** (`src/lib/arcade-sdk.ts`) — postMessage protocol:
  `ARCADE_READY` · `ARCADE_SCORE {score, stats}` · `ARCADE_ACHIEVEMENT {id}`
  (parsed, acted on in Phase 3) · `ARCADE_SAVE/LOAD` (Phase 3). Source-checked
  against the iframe, scores sanitized + capped client- AND server-side.
- **Game over** — overlay with score, personal-best delta, weekly rank,
  auto-submit for signed-in players. **Guest interception:** run is held in
  `sessionStorage` (`held-score:<slug>`, 30 min TTL, keeps best) → sign-in →
  auto-claimed with a toast. Zero-score runs are never submitted.
- **First playable cabinet:** Flap Hero (`public/games/flap-hero.html`) — a
  real Track-B build (manifest JSON block, SDK events, attract state, pause,
  touch + keyboard). Future uploads live in Supabase Storage instead.

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
| `profiles` | public SELECT; own UPDATE (column-grant: username/display_name/avatar_url/bio only — role/xp/level protected) | Created by `handle_new_user()` trigger; username from email, **first user → admin** |
| `games` | public SELECT; writes service_role only | Catalog. 12 seeded, `flap-hero` published (`track='B'`, `html_path`) |
| `scores` | public SELECT; own INSERT — RLS enforces published game, `score <= games.score_cap`, **1 insert /10 s/user/game** | `stats` jsonb from SDK |
| `ratings` | public SELECT; own INSERT/UPDATE/DELETE (PK game+user) | 1–5 stars |
| `favorites` | public SELECT; own INSERT/DELETE | hearts |
| `comments` | public SELECT; own INSERT/DELETE; 1-level threading via `parent_id` | body ≤1000 chars |
| `waitlist`, `playtest_applications`, `site_settings` | unchanged from Phase 1 | |

**Functions:** `get_leaderboard(game_id, since)` → best-per-user top 100
(invoker) · `increment_play_count(game_id)` (definer, published games only) ·
`handle_new_user()` (definer, signup trigger).

## Key files

```
src/
  App.tsx                        routes + AuthProvider + LaunchGate
  contexts/AuthContext.tsx       session + profile + signOut (useAuth)
  lib/arcade-sdk.ts              SDK bridge: useArcadeBridge, sanitizeScore
  games/registry.ts              Track-A slug → lazy component (empty; Phase 6)
  hooks/{useGames,useLeaderboard}.ts
  pages/{Landing,Home,Games,GameDetail,Login,Settings,Faq,Playtest,NotFound}.tsx
  components/
    layout/{LaunchGate,SiteHeader,SiteFooter}.tsx
    arcade/{GamePlayer,GameTile,LeaderboardPanel,CommentsPanel,
            RatingWidget,FavoriteButton,WaitlistForm,BadgeChip}.tsx
  data/launch-lineup.ts          landing wall data + gameArtPath()
public/
  assets/brand/logo-mark.png · assets/games/<slug>.png (12 pieces)
  games/flap-hero.html           Track-B game file (dev hosting; Storage later)
```

## Asset pipeline (game key art)

Unchanged — square AI-generated originals in `public/assets/games/<slug>.png`.
Prompt template (keep the set cohesive):

> Video game key art: [scene description]. Flat vector illustration, warm
> earthy retro palette: cream, terracotta orange, olive green, mustard yellow,
> dark umber. Paper grain texture, bold shapes, no text, no logos.
> Square composition.

## Next up (per spec §9)

1. **Phase 3 — Progression:** achievements engine (validate manifest IDs
   server-side, unlock toasts, Achievements tab on `GameDetail`), XP/levels/
   streaks, badges + `BadgeChip` case, activity feed + follows, real Arcade
   Home (Spotlight, rails, ScoreTicker) behind the gate.
2. **Phase 4 — Upload wizard + Admin** (review queue, Storage hosting for
   Track-B files, score wipes, role grants, playtester approvals).
3. **Phase 5 — Chat.** **Phase 6 — Track-A games** (Munch Maze first).
   **Phase 7 — flip `launched`.**

**Deferred small items:** avatar upload/crop (needs Storage), `ARCADE_SAVE/LOAD`
persistence, leaderboard friend filter + virtualization, mod comment deletion.

## Gotchas

- `--radius` is 1rem; shadcn components inherit it — don't hardcode radii.
- The gate wraps `/`, `/games`, `/game/:slug`. `/login`, `/settings`, `/faq`,
  `/playtest` are reachable pre-launch by design.
- Score submit failures whose message contains "security" are shown as
  rate-limit feedback (RLS denial) — keep that string check in mind if
  policies change.
- Daily/weekly boards are **rolling 24 h / 7 d windows**, not calendar days.
- Uploaded games: `sandbox="allow-scripts"` ONLY (never same-origin);
  achievement IDs must be validated against the approved manifest server-side
  (Phase 3).
