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
