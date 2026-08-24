# CLAUDE.md

Guidance for AI agents working in this repo.

## What this is

LLM Arcade (llmarcade.fun), a social arcade built entirely by AI agents.
30 games at launch, with high scores, achievements, badges, and streaks.
It is a Dyad app. The project was named Neon Arcade before 2026-08-24, so
older docs and DEVLOG entries use that name. The site is gated pre-launch
(`site_settings.launched = false`).

## Read these before working

| Doc | Contents |
|---|---|
| `HANDOFF.md` | Current state, DB schema, asset pipeline, gotchas, next steps |
| `AI_RULES.md` | Hard design rules, naming conventions, tech-stack rules |
| `DEVLOG.md` | Decision history, including rejected designs |
| `.dyad/plans/chat-1-plan.md` | Full product spec (pages, progression, 100-game catalog, phases) |

## Commands

Use pnpm, never npm.

```bash
pnpm dev        # Vite dev server on http://localhost:8080
pnpm build      # production build
pnpm lint       # eslint
pnpm typecheck  # tsc over app + node configs
pnpm check      # the CI gate: lint + typecheck + build
```

CI runs locally. GitHub-hosted Actions don't run on this account, so the
pre-push hook in `.githooks/` is the enforcement point. Enable it once per
clone with `git config core.hooksPath .githooks`. The
`.github/workflows/ci.yml` workflow mirrors `pnpm check` and activates if
the repo ever moves to an org with working billing. Vercel builds and
deploys on push (CD).

There is no test suite. Verification means running the app and playing the
game. New cabinets are not done until a human playtest passes, and HANDOFF
tracks which cabinets still need one.

## Stack

Vite + React 19 + TypeScript. React Router with all routes in
`src/App.tsx`. Tailwind plus shadcn/ui (always restyled, never the default
look). TanStack Query for server state. Supabase for Postgres, auth, and
Storage (client at `src/integrations/supabase/client.ts`). Path alias `@`
maps to `src/`.

## Session workflow

1. Read `HANDOFF.md` and the latest `DEVLOG.md` entries before changing
   anything.
2. After meaningful work, append a session entry to `DEVLOG.md` (newest at
   the bottom) and update the current state and next steps in `HANDOFF.md`.
3. Rejected designs stay in the DEVLOG. Do not retry them.

## Hard rules

Each rule below has broken something before or guards a user mandate.
Details live in `AI_RULES.md` and the HANDOFF gotchas.

- **Design bans.** No purple, no blue, no neon glows, no gradient
  backgrounds, no pixel fonts. Warm paper/terracotta palette, tokens in
  `src/globals.css`.
- **No programmatic canvas/SVG art inside games.** Sprites are
  AI-generated PNGs, magenta-keyed at runtime. Transforms of sprites are
  fine. Drawing shapes is not. Text-shelf games render as DOM typography
  instead.
- **Asset diet.** In-game sprites are flat solid color, no grain or noise.
  Target well under 1 MB of art per game. Grain is allowed on key-art
  tiles only.
- **Schema changes go through the Supabase SQL tool.** Never write to
  `supabase/migrations/`. After CREATE TABLE, grant exactly what anon and
  authenticated need, because default grants were revoked and new tables
  start with zero client access.
- **Admin writes go through the `admin_*` SECURITY DEFINER RPCs.** Never
  direct table writes.
- **Every logged-out CTA goes through `authCta()`** from
  `src/lib/known-player.ts`. Never hardcode `/login` links or "Sign in"
  copy.
- **Achievement slugs fired by a game engine must exactly match the seeded
  `achievements` rows** for that game.
- **The level curve lives in two places.** `level_for_xp` in SQL and
  `src/lib/progression.ts`. Change both or neither.
- **Never edit `src/components/ui/`** (shadcn files).
- **No trademarked names, art, or audio.** Games are original homages with
  invented content.

## Building a game

Two tracks. Pick the reference implementation and follow it.

- **Track A** lives in `src/games/<slug>/` and registers lazily in
  `src/games/registry.ts`. Sprite games follow Munch Maze and Starfall
  Squadron. Text-shelf games follow Rune & Ruin. Seed achievements via SQL
  and publish the `games` row manually.
- **Track B** is a single self-contained file at
  `public/games/<slug>.html`, 5 MB cap, sprites inlined as data URIs.
  Follow Rockbuster, the asset-diet reference. Balance knobs go in a
  `TUNE` object at the top of the script.

Teaser rows for launch-lineup games already exist with
`status='coming_soon'`. When shipping one, UPDATE the `games` row (INSERT
hits the slug unique key) and check `src/data/launch-lineup.ts` before
adding entries. Key art goes to `public/assets/games/<slug>.png` and
overwriting teaser art is expected.

## Naming

Conventions are enumerated in `AI_RULES.md`. The short version: PascalCase
components, kebab-case modules and slugs, `useCamelCase` hooks, snake_case
DB names, UPPERCASE.md root docs.
