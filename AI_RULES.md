# LLM Arcade — Project Rules

A social arcade built entirely by AI agents. Before working on this project,
read these three docs:

| Doc | Contents |
|---|---|
| `HANDOFF.md` | Current state, design system, DB schema, asset pipeline, next steps |
| `DEVLOG.md` | Decision history (incl. rejected designs) — append a session entry after meaningful work |
| `.dyad/plans/chat-1-plan.md` | Full product spec (pages, progression, 100-game catalog, phases) |

## Design rules (user-mandated, non-negotiable)

- ❌ **NO purple, NO blue, NO neon glows, NO gradient backgrounds** — the
  generic "AI slop" look is banned.
- ❌ **NO pixel fonts, blinking text, or childish retro cosplay.**
- ✅ Warm "down to earth" palette: paper `#F6F1E7` bg, ink text, terracotta
  primary (`terra`), `olive` + `mustard` accents. Tokens in `src/globals.css`.
- ✅ Fonts: Bricolage Grotesque (`font-display`) · Inter (`font-sans`) ·
  JetBrains Mono (`font-mono`, data/labels only).
- ✅ `rounded-2xl` cards, `rounded-full` buttons/chips, soft shadows +
  `ring-1 ring-foreground/10` hairlines. Games/imagery first, real product feel.
- All game art is AI-generated originals — use the prompt template in
  `HANDOFF.md` (flat vector, earthy palette, paper grain, square, no text).
  No trademarked names/art/audio anywhere.
- ❌ **NO programmatic canvas/SVG art inside games** — in-game sprites must be
  real generated assets too (pipeline recipe in `HANDOFF.md`, incl. the
  magenta-key + data-URI trick for transparency in sandboxed iframes).
- ✅ **Asset diet (user-mandated, session 13):** in-game art must be LIGHT.
  Prompt for **flat solid colors, NO paper grain / noise / gradients** on
  in-game sprites (noise is what bloats PNGs — grain stays allowed on
  key-art tiles only), few small sheets over many files, flat-color
  backgrounds from design tokens, sprite instancing/transforms over extra
  frames. Target well under ~1 MB of art per game; avoid multi-MB
  data-URI payloads like Trailbound's (4.5 MB — grandfathered, don't
  repeat it).

## Naming conventions

- Pages & components: `PascalCase.tsx` (`src/pages/`, `src/components/<domain>/`)
- Component domains: `layout/`, `arcade/`, `progression/`, `upload/`, `admin/` (later: `chat/`)
- Non-component modules: `kebab-case.ts` (`src/data/launch-lineup.ts`)
- Hooks: `useCamelCase.ts` in `src/hooks/`
- Assets: `public/assets/brand/` and `public/assets/games/<slug>.png` —
  slugs are kebab-case and must match the game slug in `src/data/launch-lineup.ts`
- Track-B game files (dev hosting until Storage): `public/games/<slug>.html`,
  slug matches the `games` DB row
- Root docs: `UPPERCASE.md` · shadcn ui files (`src/components/ui/`) keep their
  kebab-case names and are never edited
- DB tables/columns: `snake_case`

# Tech Stack

- React + TypeScript + Vite; React Router — KEEP routes in `src/App.tsx`
- Pages in `src/pages/`, components in `src/components/`
- Pre-launch gate: only `/` renders through `LaunchGate` (reads
  `site_settings.launched`, currently `false`). Guests see the Landing;
  **any signed-in user gets the Arcade Home** with a preview banner
  (session 8). `/games` and `/game/:slug` are OPEN pre-launch — guests can
  play, scores require sign-in (session 6). Auth is `/login` + `/signup`
  (one component, mode from URL); fresh browsers hitting `/login` redirect
  to `/signup` via the `na-known-player` localStorage flag, and every
  logged-out CTA goes through `authCta()` in `src/lib/known-player.ts` —
  never hardcode `/login` links or "Sign in" copy (session 9)
- `/upload` + `/uploads` (creator pipeline, auth-gated) and `/admin`
  (admin role only); all admin writes go through `admin_*` SECURITY DEFINER
  RPCs — never direct table writes (session 10)
- Tailwind CSS everywhere; shadcn/ui components are installed — always
  customize their styling (never ship default shadcn look)
- lucide-react for icons; TanStack Query for server state
- Supabase (client at `src/integrations/supabase/client.ts`): Postgres with
  RLS + explicit role grants on every table; schema changes via the SQL tool
  only — NEVER write to `supabase/migrations/`
- Default privileges were revoked (session 10): **new tables get ZERO client
  grants automatically** — always GRANT exactly what anon/authenticated
  need after CREATE TABLE, or every request fails with permission denied
- Game art: use `gameArt(game)` from `src/hooks/useGames.ts` for DB games
  (Storage `art_url` for uploads, `/assets/games/<slug>.png` fallback)
