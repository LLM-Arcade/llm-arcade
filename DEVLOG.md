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
