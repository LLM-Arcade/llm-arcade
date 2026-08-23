# Neon Arcade — Handoff

A social arcade built entirely by AI agents. 30 games at launch, high scores,
achievements, badges, streaks. Full product spec: `.dyad/plans/chat-1-plan.md`.
Decision history: `DEVLOG.md`.

## Current state

**Phase 1 complete (pre-launch).** The site is gated behind
`site_settings.launched = false` — visitors see the Coming Soon landing.
Live routes:

| Route | Page | Notes |
|---|---|---|
| `/` | `LaunchGate` → `Landing` (pre-launch) or `Home` (post-launch placeholder) | Gate reads `site_settings.launched` |
| `/faq` | `Faq` | Accordion groups, deep-linkable anchors (`/faq#uploading`) |
| `/playtest` | `Playtest` | Application form → `playtest_applications` |

## Stack

- Vite + React + TypeScript + React Router (routes live in `src/App.tsx`)
- Tailwind + shadcn/ui (customized — never ship default shadcn styling)
- TanStack Query for server state
- Supabase: Postgres + RLS (auth, storage, realtime planned for Phase 2+)
  - Client: `src/integrations/supabase/client.ts`

## Design system — "down to earth" (v3, approved)

**Hard rules (user-mandated, do not violate):**
- ❌ No purple, no blue, no neon glows, no gradient backgrounds — the
  "AI slop" look is explicitly banned
- ❌ No pixel fonts, blinking text, or childish retro cosplay
- ✅ Warm, grounded palette; games-first layouts (Poki-style density,
  original execution); real product polish

**Tokens** (CSS vars in `src/globals.css`, mapped in `tailwind.config.ts`):

| Token | Value | Use |
|---|---|---|
| `background` | `#F6F1E7` warm paper | App background |
| `foreground` | `#2B241D` ink | Text |
| `primary` / `terra` | `#C4491F` terracotta | CTAs, accents, brand |
| `olive` | `#6E7546` | Secondary accent, success-ish states |
| `mustard` | `#E6A518` | Chips ("SOON"), highlights |
| `card` | warm white | Cards, panels |

**Type:** Bricolage Grotesque (`font-display`, headings/wordmark) ·
Inter (`font-sans`, body) · JetBrains Mono (`font-mono`, data labels, era tags).

**Shape & depth:** `rounded-2xl` cards, `rounded-full` buttons/chips,
soft shadows + 1px `ring-foreground/10` hairlines. No hard drop shadows.

**Motion:** one staggered `.fade-up` entrance per page (inline
`animation-delay`), hover lift `-translate-y-1` + shadow on tiles.
Everything disabled under `prefers-reduced-motion`.

**Wordmark:** lowercase `neonarcade` — "neon" in ink, "arcade" in terracotta,
with the round token logo (`public/assets/brand/logo-mark.png`, also favicon).

## Asset pipeline (game key art)

All art is AI-generated, original (no trademarked names/art). Files live in
`public/assets/games/<slug>.png`, square, referenced by the `games` array in
`src/pages/Landing.tsx`.

**Prompt template for new art (keep the set cohesive):**

> Video game key art: [scene description]. Flat vector illustration, warm
> earthy retro palette: cream, terracotta orange, olive green, mustard yellow,
> dark umber. Paper grain texture, bold shapes, no text, no logos.
> Square composition.

**Generated so far (12 of 30 revealed):** starfall-squadron (featured),
munch-maze, brickstorm, rockbuster, boulder-rush, hyper-circuit,
the-undervault, flap-hero, sky-defense, gem-columns, kickflip-city,
trailbound · plus `brand/logo-mark.png`.

## Database (Supabase)

All tables have RLS enabled with explicit role grants:

| Table | Access | Purpose |
|---|---|---|
| `waitlist` | `anon`/`authenticated` INSERT only; email UNIQUE | Email signups. Duplicate insert (code `23505`) is treated as success in `WaitlistForm` |
| `playtest_applications` | `anon`/`authenticated` INSERT only | name, email, devices[], hours_per_week, favorite_eras[], status (default `pending`) |
| `site_settings` | public SELECT; single row `id=1` | `launched` (false), `slow_mode_seconds` |

`service_role` has full access everywhere. **Never write files to
`supabase/migrations/` — schema changes go through the SQL tool.**

## Key files

```
src/
  App.tsx                        routes + providers + LaunchGate
  globals.css                    design tokens, fade-up, reduced-motion
  data/launch-lineup.ts          revealed games + gameArtPath() helper
  pages/{Landing,Home,Faq,Playtest,NotFound}.tsx
  components/
    layout/{LaunchGate,SiteFooter}.tsx
    arcade/{WaitlistForm,BadgeChip}.tsx
  integrations/supabase/client.ts
public/assets/
  brand/logo-mark.png            logo (also favicon)
  games/<slug>.png               key art, slug matches launch-lineup.ts
```

## Naming conventions

Defined in `AI_RULES.md` (authoritative). Summary: PascalCase components/pages,
kebab-case non-component modules and assets, `useCamelCase` hooks,
UPPERCASE root docs, snake_case DB. Asset slugs must match game slugs.

`BadgeChip` takes `rarity: "bronze" | "silver" | "gold" | "neon"` — the
progression system (spec §3) builds on it.

## Next up (in order, per spec §9)

1. **Phase 2 — Platform core:** Google OAuth + `AuthContext`, `profiles`
   table (+ signup trigger), `/settings`, game registry (`src/games/registry.ts`),
   `/game/:slug` detail page, sandboxed iframe player + Arcade SDK
   (postMessage: `ARCADE_READY/SCORE/ACHIEVEMENT/SAVE/LOAD`), leaderboards
   (daily/weekly/all-time), ratings/favorites/comments.
2. **Phase 3 — Progression:** achievements, XP/levels/streaks, badges,
   activity feed, real Arcade Home behind the gate.
3. **Phase 4 — Upload wizard + Admin** (review queue approves Track-B games).
4. **Phase 5 — Chat.** **Phase 6 — Track-A games.** **Phase 7 — flip `launched`.**

## Gotchas

- `--radius` is `1rem`; shadcn components inherit it — don't hardcode radii.
- The launch gate only hides `/` content; `/faq` and `/playtest` are
  intentionally public pre-launch.
- Guest score interception (spec §4.4) is a core conversion mechanic — design
  the score submit path around it from the start.
- Uploaded games must run in `iframe sandbox="allow-scripts"` (no same-origin);
  validate achievement IDs against the approved manifest server-side.
