-- Flagstone seed. Run via the Supabase SQL tool (never supabase/migrations/).
-- No teaser row exists for this slug yet, so this INSERT creates it.
--
-- status stays 'coming_soon'. Two things must happen before
-- db/publish-flagstone.sql is run:
--   1. local browser play on /dev/flagstone passes,
--   2. key art exists at public/assets/games/flagstone.png (square,
--      AI-generated, flat solid colours, no grain — the asset diet rule).
--      The cabinet itself needs no sprite sheets: it draws no sprites.
-- Until the art lands, the game is playable at /dev/flagstone but must not
-- appear on the landing wall or as a published tile.

INSERT INTO games (slug, title, description, era, genre, controls, track, status, score_cap)
VALUES (
  'flagstone',
  'Flagstone',
  'Six slabs of stacked stone, each one described only by the counts along its rows and columns. Read the clues, set the stones, and the picture appears: a boot, a gate post, a cairn, a kiln, a well, a quarry crane. Five wrong stones end the run. Finishing fast is not the point — finishing clean is, and clean slabs pay a bonus the next slab inherits.',
  'DOS',
  'Logic puzzle',
  'Arrows/WASD move the cursor, Space/Z/Enter set a stone, X/F flags a cell, C/Backspace lifts a stone. P pause, M mute. Touch: hold the pad to move, HAMMER sets, FLAG marks.',
  'A',
  'coming_soon',
  60000
)
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    era = EXCLUDED.era,
    genre = EXCLUDED.genre,
    controls = EXCLUDED.controls,
    track = EXCLUDED.track,
    status = EXCLUDED.status,
    score_cap = EXCLUDED.score_cap;

-- 6 achievements. Slugs must match what src/games/flagstone/engine.ts fires,
-- and scripts/harness/flagstone.mjs proves a perfect run reaches every one.
-- Idempotent via the (game_id, slug) unique key the review RPC syncs on.
INSERT INTO achievements (game_id, slug, name, description, hint, xp, sort_order)
SELECT g.id, a.slug, a.name, a.description, a.hint, a.xp, a.sort_order
FROM games g
CROSS JOIN (
  VALUES
    ('first-line', 'First Line', 'Satisfy a full row or column clue.', 'Count the runs in a line and fill exactly those cells.', 10, 1),
    ('first-slab', 'First Slab', 'Finish your first slab.', 'Every row and column clue has to agree at once.', 20, 2),
    ('clean-cut', 'Clean Cut', 'Finish a slab without setting a single wrong stone.', 'Read the long runs first: they pin whole lines down.', 30, 3),
    ('hot-quarry', 'Hot Quarry', 'Finish two slabs in a row without a wrong stone.', 'Streaks carry across slabs, not within one.', 40, 4),
    ('three-slabs', 'Three Slabs', 'Finish three slabs in a single run.', 'You only have five wrong stones for the whole run.', 50, 5),
    ('quarry-legend', 'Quarry Legend', 'Score 5,000 in one run.', 'Clean slabs are worth far more than fast ones.', 60, 6)
) AS a(slug, name, description, hint, xp, sort_order)
WHERE g.slug = 'flagstone'
ON CONFLICT (game_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    hint = EXCLUDED.hint,
    xp = EXCLUDED.xp,
    sort_order = EXCLUDED.sort_order;
