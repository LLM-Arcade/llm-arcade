# TypeStorm: the upload-wizard submission handoff

**Written 2026-08-25.** The next session's job: run TypeStorm through the
site's upload wizard as the pipeline's first real submission, end to end,
until the game is live on the floor with Jeff's creator credit.

Read `CLAUDE.md`, `HANDOFF.md`, and the newest `DEVLOG.md` entries before
touching anything.

## Why this exists

TypeStorm is finished on purpose but unpublished on purpose. Jeff ruled
that it must NOT be seeded by SQL like the in-house cabinets. It is the
test cargo for the community submission pipeline: upload wizard, test
flight, review queue, approval RPC. If the pipeline can't ship TypeStorm,
it can't ship a stranger's game.

## The game's state

- Track B cabinet at `public/games/typestorm.html` (36 KB, one file,
  everything inlined). Built and tuned in a prior session, commit
  `29380c5` on dev. The static file is already deployed with the site,
  but that copy is NOT the submission: the wizard stores its own copy in
  Supabase Storage and the approval RPC creates the `games` row.
- Speaks the protocol: `ARCADE_READY`, `ARCADE_ACHIEVEMENT`,
  `ARCADE_SCORE`, and carries an inline manifest of 8 achievements
  (`id`/`name`/`hint` objects near the top of the script).
- There is deliberately no `games` row, no `db/seed-typestorm.sql`, and
  no key art at `public/assets/games/typestorm.png`.

## The task

1. Read the wizard and review code first: `src/pages/Upload.tsx`,
   `src/pages/MyUploads.tsx`, `src/pages/Admin.tsx`,
   `src/hooks/useSubmissions.ts`, `src/hooks/useAdmin.ts`. The approval
   RPCs are `admin_review_submission` and `admin_review_playtest`.
   Learn what the wizard actually requires (metadata fields, manifest
   editor, key art, test flight) before driving it.
2. Dry-run the wizard on the local preview first
   (`..\jolly-bear-cheer-preview`, launch config `arcade-dev`, port
   8080) to catch wizard bugs without dirtying production data.
3. Then run it for real on https://llmarcade.fun with Jeff at the
   keyboard for auth (see constraints). Fill the wizard from the game
   file: name TypeStorm, era/description to match the catalog voice,
   the 8 achievements copied exactly from the inline manifest (slugs
   must match what the game fires), the HTML file, and key art.
4. Pass the test flight, submit, then have Jeff's admin account approve
   it through the Admin review screen (not direct SQL) so the approval
   RPC path gets exercised.
5. Verify like the other launches: the game appears on /games with PLAY,
   a guest run works in production, achievements fire, one score
   submits. Screenshot proof.
6. Fix any pipeline bug found along the way in a `feature/*` branch off
   dev, PR into dev with the `check` gate, release to prod via the
   release-branch dance if needed (see `docs/BRANCH-WORKFLOW.md` and
   DEVLOG for the `merge -s ours origin/prod` recipe).
7. Append DEVLOG entry, update HANDOFF.md, and update this file's status
   line when done.

## Open blocker: key art

The wizard needs a square PNG tile and none exists. Zo image generation
is DOWN (`media_billing_target_missing`, support ticket pending), which
is also blocking the Lastwatch tile. Options, in order: check whether Zo
media gen recovered, ask Jeff for a tile, or propose a typographic tile
(TypeStorm is a typing game, so a type-driven tile in the warm paper
palette is on-brand; the no-programmatic-art rule governs in-game
sprites and Jeff has final say on tile style). Do not block the dry run
on this: use a placeholder locally, real art before production.

## Constraints that bind

- Claude never enters passwords or creates accounts. Jeff logs into
  llmarcade.fun himself in the browser tab before the production run,
  and stays for the admin approval click.
- pnpm, never npm. No direct table writes for admin actions, RPCs only.
- Supabase schema changes only through the SQL editor via Jeff.
- The wizard caps submissions at 3 pending per account and requires the
  test flight to pass before queueing.
- Achievement slugs fired by the game must exactly match the manifest
  rows the approval creates.

## The wizard payload (built and dry-run 2026-08-25, copy verbatim)

Metadata, exactly as validated in the local dry run:

| Field | Value |
|---|---|
| Title | TypeStorm |
| Slug | typestorm |
| Era | Original |
| Genre | Typing defense |
| Score label | Score |
| Score cap | 250000 |
| AI credit | Claude Code |

Description: "Words fall out of the weather and the only weapon is your
keyboard. Lock a word by its first letter, land flawless kills to grow the
multiplier, and bank ten clean words to charge a storm break that clears
the sky. Waves add fast, heavy, and mending words until the line breaks.
Three breaches and the storm wins."

Controls: "Type a word's first letter to lock on, finish it to destroy it.
Enter fires a charged storm break. Esc or P pauses, M mutes. Touch: type
in the field, Burst fires the break."

Manifest, in order (names and hints from the inline `arcade-manifest`,
XP assigned to the house ladder). Row 2's slug does NOT follow its name:
type `chain-ten` by hand.

| # | Name | Slug | XP | Hint |
|---|---|---|---|---|
| 1 | First Word | first-word | 10 | Destroy your first word. |
| 2 | Ten Chain | chain-ten | 50 | Land ten flawless words in a row. |
| 3 | Storm Break | storm-break | 25 | Charge the meter and clear the sky. |
| 4 | Clean Wave | clean-wave | 50 | Clear a wave with nothing crossing the line. |
| 5 | Long Hauler | long-hauler | 25 | Type a nine-letter word with no mistakes. |
| 6 | Deep Storm | deep-storm | 100 | Reach wave 5. |
| 7 | Sharp Keys | sharp-keys | 150 | End a run at 95% accuracy over 40 words. |
| 8 | Storm Legend | storm-legend | 150 | Score 20,000 in a single run. |

Files: the game is `public/games/typestorm.html` (36 KB, md5
`f706ff0055353a1a5e165557bc795507`). The proposed key art is
`scripts/art/typestorm-tile.png` (typographic tile, 24.7 KB), generated by
`scripts/art/typestorm-tile.ps1`. Jeff rules on the tile before it ships.

## Status

- 2026-08-25: handoff written, nothing attempted yet. 14 games live in
  production, Lastwatch still awaiting key art, both unrelated to this
  task.
- 2026-08-25 (session 23): wizard and review code read, no defects found.
  Local dry run completed through the test-flight boot with the payload
  above: step 1 validated with the live slug check, step 2 accepted both
  files, ARCADE_READY registered in the sandbox. Nothing submitted
  anywhere. Two findings for the next session: the driven browser pane
  must be DISPLAYED for any cabinet to run (hidden pages get no
  requestAnimationFrame and trigger pause-on-hidden, so the SCORE event
  cannot fire headlessly), and the wizard's auth gate means the local
  route needs either Jeff's login or the one-line `DRY-RUN BYPASS` edit
  in the preview clone (uncommitted, currently reverted). Key-art
  proposal built (see above), awaiting Jeff's call. Remaining work is the
  production run on llmarcade.fun with Jeff at the keyboard: sign in,
  wizard with the payload above, play the flight to a real score, Submit,
  then approve in /admin, then the step-5 verification pass.
