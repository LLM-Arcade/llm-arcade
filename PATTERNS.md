# PATTERNS.md

Code-level conventions for LLM Arcade, extracted from the actual source. Read
this before building a new cabinet or a platform feature. AI_RULES.md,
CLAUDE.md, and HANDOFF.md cover design bans, DB rules, and naming. This file
covers the layer underneath: how the code is actually shaped.

## 1. Track A cabinet anatomy

Every Track A game registers as a lazy component keyed by slug in
`src/games/registry.ts:13-20`. The shared prop contract is
`ArcadeGameProps { onScore, onAchievement }` (`src/games/registry.ts:6-9`),
described in a comment as "same semantics as the postMessage SDK spoken by
Track-B uploads, one backend path for both."

Module split, sprite games (Munch Maze, Starfall Squadron): `engine.ts`
(framework-free game state and rules), `sprites.ts` (chroma-key + slicing),
`render.ts` (canvas placement only), `audio.ts` (WebAudio synth), and a
`<Name>.tsx` React shell. Munch Maze adds `maze.ts` for static layout data.
Rune & Ruin (text-shelf) drops `sprites.ts` and `render.ts` entirely and
renders a DOM glyph grid instead (`src/games/rune-ruin/RuneRuin.tsx:187-236`),
adding `dungeon.ts` and `content.ts` for procgen and bestiary data. A new
sprite cabinet should copy Munch Maze's five files. A new text-shelf cabinet
should copy Rune & Ruin's four.

The engine is a plain class with public state fields, private mutators, and
an `events: GameEvent[]` array (`src/games/munch-maze/engine.ts:58-90`). The
component instantiates it once via a lazy ref, not `useState`:

```ts
const engineRef = useRef<Engine>(null!);
if (!engineRef.current) engineRef.current = new Engine();
```

(`src/games/munch-maze/MunchMaze.tsx:26-27`, same shape in
`src/games/rune-ruin/RuneRuin.tsx:47-48`). The engine is never reset in
place. A fresh instance only appears when the whole component remounts.

**Event queue contract.** `GameEvent` is a discriminated union
(`src/games/munch-maze/engine.ts:25-29`: `sfx`, `sfx-ghost`, `achievement`,
`gameover`). A private `emit()` pushes, a public `drainEvents()` swaps the
array out and returns it (`engine.ts:96-105`). The component owns draining
and dispatch. Sfx events call the audio module, `achievement` events call
`onAchievement(slug)`, `gameover` calls `onScore(...)`. rAF cabinets drain
once per frame inside the loop (`MunchMaze.tsx:74-89`). The turn-based
cabinet drains once per input inside `dispatch()` (`RuneRuin.tsx:78-90`).
The engine never calls a callback prop directly, only its own queue.

**rAF loop vs turn-based.** Munch Maze and Starfall Squadron drive
`eng.update(dt)` from a `requestAnimationFrame` loop with `dt` computed from
a `performance.now()` delta, skipped while `pausedRef.current` is true, then
call `render()` every frame regardless of pause state
(`MunchMaze.tsx:68-105`). Rune & Ruin has no rAF loop at all. `playerAct()`
only runs from `dispatch()`, gated by phase and by an 80 ms throttle so a
held key walks instead of sprinting (`RuneRuin.tsx:69-92`). A new turn-based
cabinet should not add a render loop. An input handler that calls the engine
directly is the whole game loop.

**Restart via key remount.** `GamePlayer.tsx` holds `frameKey`, incremented
in `start()` (`src/components/arcade/GamePlayer.tsx:179`), and passes it as
`key={frameKey}` to both the Track A component and the Track B iframe
(`GamePlayer.tsx:257`, `:267`). Because the engine ref initializes lazily on
first render, a key change force-unmounts and remounts the cabinet, which
recreates the engine from scratch. Turn-based cabinets skip an in-game
restart flow for exactly this reason. Death fires `gameover`, GamePlayer
shows the RUN OVER panel, and "Play again" bumps `frameKey`.

**Same-tick race guards.** `engine.ts:216-217` in Munch Maze has an early
return right after `updatePlayer(dt)`:

```ts
// Eating the last seed wins the frame: a ghost touch after it would
// overwrite "clear" with "dying" and the level could never re-clear.
if (this.phase !== "running") return;
```

Guarding a phase transition with an early return inside `update()` is the
pattern to follow when two state changes could race in the same tick.
Each cabinet's `audio.ts` exports a module-level `isMuted()` getter rather
than a raw exported boolean, because module state outlives the
`key={frameKey}` remount. Every shell seeds its mute HUD state from it
(`useState(isMuted)` in `MunchMaze.tsx:32`, `RuneRuin.tsx:53`, and
`StarfallSquadron.tsx:29`) so the icon stays correct across restarts.

## 2. The sprite pipeline

All in-game art starts as flat-color PNGs generated on solid magenta, keyed
transparent at runtime, per AI_RULES's no-programmatic-art rule. The Track A
recipe lives in `sprites.ts` as three composed steps
(`src/games/munch-maze/sprites.ts:29-128`):

1. `chromaKey(data)` zeroes alpha where `r > 150 && b > 150 && g < 120`, and
   softens anti-aliased magenta fringe pixels to low alpha instead of a hard
   cut (`sprites.ts:29-40`).
2. `sliceSheet(img, count)` builds a per-column opacity histogram, finds
   runs of opaque columns merging any gap smaller than 1.5% of the sheet
   width, and only trusts that gap-based split if it produces exactly
   `count` segments. Otherwise it falls back to `count` equal-width columns
   (`sprites.ts:53-98`).
3. Each resulting frame is bbox-trimmed to its own opaque pixels
   (`sprites.ts:100-127`), so a sheet with uneven frame sizes doesn't carry
   dead padding into every sprite.

Starfall Squadron reimplements the same three functions independently in
its own `sprites.ts` rather than importing Munch Maze's
(`src/games/starfall-squadron/sprites.ts:1-30`). There is no shared sprite
module. A new Track A cabinet is expected to copy this file, not reference
it.

`render.ts` only places sprites, it never draws them. `drawSprite()` is a
single `ctx.drawImage()` scaled to a target size
(`src/games/munch-maze/render.ts:14-25`). Facing and animation come from
`ctx.rotate()`/`ctx.scale()`/`ctx.globalAlpha` around a translated origin.
The muncher's death spin, for example, is rotate + shrink + fade, not a
drawn effect (`render.ts:33-49`). The only `ctx.fillRect` calls in the file
are static level geometry, ground, walls, the ghost-house door
(`render.ts:93-124`), which is level structure, not creature or item art,
and matches the exception AI_RULES already carves out for maze walls.

## 3. Track B cabinet anatomy

A Track B cabinet is one file at `public/games/<slug>.html`, capped at 5 MB,
loaded into `<iframe sandbox="allow-scripts">` with no `allow-same-origin`
(`GamePlayer.tsx:270`). Top to bottom: `<style>` with a fixed canvas layout
and touch-pad CSS gated by `@media (pointer: coarse)`
(`public/games/rockbuster.html:18`), an
`<script type="application/json" id="arcade-manifest">` block listing the
achievement manifest that mirrors what's seeded server-side
(`rockbuster.html:21-33`), then `<body>` with the canvas and a `#pads` div,
then one `<script>` holding everything else: SDK helpers, `TUNE`, palette,
audio, sprite data URIs, the slicer, game logic, input, render, boot. There
are no `import` statements anywhere in the file.

**TUNE knobs.** A single `const TUNE = { ... }` near the top of the script
holds every balance number with an inline unit comment, for example
`shipTurn: 3.9, // rad/s` and `rockSpeed: (wave) => 38 + Math.min(wave, 10) *
6` (`rockbuster.html:57-79`, same shape in `boulder-rush.html:56+`). A few
named constants like `LEGEND_SCORE`/`DEEP_WAVE` live just outside `TUNE` for
one-off thresholds (`rockbuster.html:80-81`).

**Sprite sheets as data URIs.** Marked with a `// ---------- Sprites
----------` comment (`rockbuster.html:144`, `boulder-rush.html:122`), one
`const` per sheet holding a `data:image/png;base64,...` string. Data URIs
avoid canvas taint. Because the iframe has no `allow-same-origin`, it's an
opaque origin, and an external `<img src>` would poison canvas readback. A
`data:` URI has no origin problem.

**Keying and slicing, inline.** `keyAndSlice(img, expected)` fuses all three
Track A steps into one function: zero magenta alpha, build column occupancy,
merge gaps > 10px into spans, fall back to `expected` equal columns if the
span count is wrong, then bbox-trim each span
(`rockbuster.html:148-193`, byte-identical structure in
`boulder-rush.html:126+`). `loadSheet(src, expected)` wraps it in an
`Image.onload` promise.

**ARCADE_\* protocol, outbound only.** `post = (msg) => parent.postMessage(msg,
"*")`, wrapped in try/catch so the file still runs standalone
(`rockbuster.html:52`). Three message types actually fire:

- `{ type: "ARCADE_READY" }` sent once after the sprite promises resolve,
  and also sent from the `.catch()` branch if assets fail to load, so the
  shell never hangs waiting for readiness (`rockbuster.html:636`, `:641`).
- `{ type: "ARCADE_ACHIEVEMENT", id }` from `unlock(id)`, deduped through a
  `Set` so a slug posts once per run (`rockbuster.html:53-54`).
- `{ type: "ARCADE_SCORE", score, stats }` sent once at game over behind a
  `scorePosted` flag, with a game-specific `stats` object, for example
  `{ field, rocks_busted, saucers_downed, accuracy }`
  (`rockbuster.html:300-302`).

Neither file registers a `window.addEventListener("message", ...)`. There is
no inbound half of the protocol in practice. `arcade-sdk.ts` documents
`ARCADE_SAVE`/`ARCADE_LOAD` as spoken-but-unhandled
(`src/lib/arcade-sdk.ts:6-9`, `:79-81`), and nothing sends the game a pause
or mute command from the host. Auto-pause is each game's own local
`visibilitychange` handler, not a parent-driven message.

**Touch controls.** `@media (pointer: coarse) { #pads { display: flex; } }`
(`rockbuster.html:18`) shows a fixed-position `#pads` div of `.pad` buttons
tagged with `data-btn` attributes. A single
`document.querySelectorAll(".pad").forEach(...)` wires pointer events to all
of them at once (`rockbuster.html:371`). There's no per-button handler.

**Auto-pause on hide.** `document.addEventListener("visibilitychange", ...)`
sets a local `paused` flag when `document.hidden && mode === "play"`
(`rockbuster.html:387-390`, `boulder-rush.html:489-491`). Rockbuster also
kills its looping thrust and saucer-drone sound nodes on hide so they don't
keep humming in a backgrounded tab.

**WebAudio synth.** Same shape as Track A: a lazily-created `AudioContext`
and a `blip(freq, dur, type, vol, slide)` helper building an
`OscillatorNode` + `GainNode` with a frequency ramp, gated by a module-level
`muted` flag (`rockbuster.html:90-100`).

Boulder Rush and Rockbuster share identical function and variable names
(`post`, `unlock`, `TUNE`, `keyAndSlice`, `loadSheet`) and near-identical
file layout. Boulder Rush was built by copying Rockbuster and swapping the
game logic, not by factoring out a shared library, because Track B files
can't import anything.

## 4. Achievement wiring

An engine fires an achievement by pushing `{ type: "achievement", slug }`
onto its own event queue, guarded by a per-run `Set` so a slug can't fire
twice in one run (`munch-maze/engine.ts:107-111`, the private `achieve()`
helper). The component drains that event and calls the `onAchievement(slug)`
prop. `GamePlayer.handleAchievement` only calls the unlock mutation for a
signed-in user, "guests don't accrue unlocks" (`GamePlayer.tsx:66-69`).
`useUnlockAchievement` calls the `unlock_achievement` RPC
(`src/hooks/useAchievements.ts:64-73`), documented as server-validating the
slug "against the game's approved manifest (achievements table), games
can't invent achievements." Track B's path converges on the same call.
`unlock(id)` posts `ARCADE_ACHIEVEMENT` (`rockbuster.html:53-54`), and
`useArcadeBridge`'s `onAchievement` handler in `GamePlayer` receives it and
calls the identical `handleAchievement`/`unlock.mutate` path. Both tracks
share the seeded-rows contract. Achievement slugs fired by a cabinet's code
must exactly match rows already seeded in the `achievements` table for that
`game_id`. Nothing in the client enforces this at write time. The RPC is
the only place an unknown slug gets rejected (returns `{ unlocked: false
}`, no row created).

## 5. Platform conventions

**GamePlayer's track decision.** `TrackAGame = gameRegistry[game.slug]`
(`GamePlayer.tsx:39`). If it resolves, render it inside `<Suspense>`. If not,
and `game.html_path` is set, render `<iframe sandbox="allow-scripts">`
pointed at that path (`GamePlayer.tsx:248-273`). Both branches carry the
same `key={frameKey}` and feed the same `onScore`/`onAchievement` handlers,
so the rest of the component (personal best, submit mutation, RUN OVER
panel) doesn't know which track it's driving.

**arcade-sdk.ts** exports the `ArcadeScorePayload` type, `sanitizeScore`
(clamps an untrusted score to a non-negative integer under the game's cap,
`arcade-sdk.ts:28-31`), and the `useArcadeBridge` hook, which filters
`message` events by `event.source === frame.contentWindow` so a Track B
iframe can't be spoofed by an unrelated postMessage sender
(`arcade-sdk.ts:56-59`), then sanitizes score and stats before calling the
handler props. Track A doesn't call `arcade-sdk.ts` at all. It speaks the
"same semantics" through plain `onScore`/`onAchievement` props instead
(`registry.ts:4-9`), and `GamePlayer` wires the same
`handleGameOver`/`handleAchievement` closures to both paths
(`GamePlayer.tsx:157-161` for Track B, `:258-263` for Track A). One
submission code path serves both tracks.

**TanStack Query.** Query keys are arrays: a flat list key like `["games"]`
(`src/hooks/useGames.ts:32`), an entity key like `["game", slug]`
(`useGames.ts:49`), or a user-scoped tuple like
`["personal-best", game.id, user?.id]` (`GamePlayer.tsx:43`). Read-mostly
queries set `staleTime` (`useGames.ts:44` at 60s, `useAchievements.ts:28` at
30s). Queries feeding a mutation flow generally don't. Invalidation happens
inside the triggering mutation's `onSuccess`, listing every dependent key
by hand rather than a broad refetch. The score-submit mutation, for
example, invalidates `leaderboard`, `personal-best`, `profile`, `activity`,
and `recent-scores` together (`GamePlayer.tsx:84-89`) because "progression
side effects (XP, streak, badges) happen in a DB trigger." Toasts live
inside the hook for background and admin actions. `useAdmin.ts`'s RPC
wrapper calls `showSuccess`/`showError` directly (`useAdmin.ts:118-123`),
and achievement-unlock toasts fire inside `useUnlockAchievement`'s
`onSuccess` (`useAchievements.ts:77`). The primary score-submit flow in
`GamePlayer` skips toasts and drives visible `submitState` UI instead.

**RPC-mutation pattern.** `useAdmin.ts` has one generic wrapper,
`useAdminRpc<TArgs>(rpc, invalidate: string[][], successMessage)`, that
builds a `useMutation` whose `onSuccess` shows a toast and loops over
`invalidate` calling `invalidateQueries` per key, and whose `onError` shows
the raw Postgres/RPC error message (`useAdmin.ts:109-124`). Every admin
action (`useReviewSubmission`, `useWipeScores`, `useSetRole`,
`useUpdateGame`, `useSetSpotlight`, `useSetLaunched`, `useReviewPlaytest`) is
a thin call into that wrapper supplying its own `supabase.rpc("admin_*",
{...})` call and message formatter (`useAdmin.ts:126-227`). The file's own
header comment names the real security boundary: "the client role grant
here is only convenience, never the security boundary" (`useAdmin.ts:1-3`),
because every `admin_*` RPC re-checks the role server-side.

**Upload wizard state.** `Upload.tsx` tracks the active step as a single
`useState<number>` index into `STEPS` (`Upload.tsx:75`), not a reducer.
Each concern gets its own `useState` (`meta`, `manifest`, `htmlFile`/
`htmlText`, `artFile`/`artPreview`, `flight`) instead of one combined form
object. Step validity (`step1Valid`, `step2Valid`, `flightPassed`) is
derived on every render from that state rather than stored. The wizard
hands off controlled state to `ManifestEditor` (`entries`/`onChange`) and
`TestFlight` (`html`/`manifestSlugs`/`onResult`), and only calls the
`useSubmitGame` mutation from the final step (`Upload.tsx:100`, `:196-222`).

**Auth context.** `src/contexts/AuthContext.tsx` exports `AuthProvider` and
a `useAuth()` hook that throws outside the provider
(`AuthContext.tsx:95-99`). It tracks the Supabase session directly, then
layers a TanStack Query for the profile row keyed `["profile", userId]`
with a 60s `staleTime` (`AuthContext.tsx:67-80`), and calls
`markKnownPlayer()` from `known-player.ts` whenever a session exists
(`AuthContext.tsx:49`, `:55`). `authCta(next?)` in `src/lib/known-player.ts`
reads a persistent `localStorage` flag to decide "Sign in" -> `/login` vs
"Sign up" -> `/signup`, with an optional `?next=` redirect
(`known-player.ts:28-37`). `GamePlayer.tsx:219` and `Upload.tsx:225` both
call it instead of hardcoding an auth route or button copy, matching the
hard rule in `AI_RULES.md`.

## 6. Other repeated conventions

Every cabinet component keeps a `callbacksRef` mirroring the latest
`onScore`/`onAchievement` props each render, and a `pausedRef` mirroring
`paused` state, so long-lived closures (the rAF loop, the keydown listener)
always read the current value without re-subscribing the effect
(`MunchMaze.tsx:37-40`, `RuneRuin.tsx:57-60`). The auto-pause-on-hide effect
(`document.hidden && phase === "running"`) is copy-pasted verbatim across
both Track A shells. `P`/`Escape` toggles pause and `M` toggles mute in
every cabinet on both tracks. Loading and failure states follow one shape
too. Track A shells show a spinner while sprites load and a plain text
failure message if they don't (`MunchMaze.tsx:165-177`). Track B always
posts `ARCADE_READY` even when its own asset load fails, then renders an
in-canvas error string, so the shell's 5-second `ARCADE_READY` timeout
(`GamePlayer.tsx:164-168`) is a last-resort fallback rather than the normal
path.
