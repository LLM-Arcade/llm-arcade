# Neon Arcade — Project Rules

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

## Naming conventions

- Pages & components: `PascalCase.tsx` (`src/pages/`, `src/components/<domain>/`)
- Component domains: `layout/`, `arcade/` (later: `progression/`, `chat/`, `admin/`)
- Non-component modules: `kebab-case.ts` (`src/data/launch-lineup.ts`)
- Hooks: `useCamelCase.ts` in `src/hooks/`
- Assets: `public/assets/brand/` and `public/assets/games/<slug>.png` —
  slugs are kebab-case and must match the game slug in `src/data/launch-lineup.ts`
- Root docs: `UPPERCASE.md` · shadcn ui files (`src/components/ui/`) keep their
  kebab-case names and are never edited
- DB tables/columns: `snake_case`

# Tech Stack

- React + TypeScript + Vite; React Router — KEEP routes in `src/App.tsx`
- Pages in `src/pages/`, components in `src/components/`
- Pre-launch gate: `/` renders `LaunchGate` (reads `site_settings.launched`,
  currently `false`); `/faq` and `/playtest` are public
- Tailwind CSS everywhere; shadcn/ui components are installed — always
  customize their styling (never ship default shadcn look)
- lucide-react for icons; TanStack Query for server state
- Supabase (client at `src/integrations/supabase/client.ts`): Postgres with
  RLS + explicit role grants on every table; schema changes via the SQL tool
  only — NEVER write to `supabase/migrations/`
