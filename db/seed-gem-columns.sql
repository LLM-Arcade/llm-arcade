-- Gem Columns seed. Run via the Supabase SQL tool (never supabase/migrations/).
-- A teaser row already exists for this slug (it is in launch-lineup.ts), so
-- this is an upsert on the slug unique key: it updates the teaser in place.
--
-- status stays 'coming_soon'. Flip it with db/publish-gem-columns.sql only
-- after local browser play on /dev/gem-columns passes and the deploy serves
-- the real art.

INSERT INTO games (slug, title, description, era, genre, controls, track, status, score_cap)
VALUES (
  'gem-columns',
  'Gem Columns',
  'A falling-triad puzzle down three wells: the artisan foundry, the conservatory, and the archaeological archive. Ten gem identities in all, six per well. Cycle the triad as it drops, line up three of one gem across, down, or on either diagonal, and clear the well''s quota to move on. Cascades pay triple, then six times, long lines earn extra, and finishing a well fast earns a speed bonus.',
  'Genesis',
  'Falling-block puzzle',
  'Arrows/AD move, Down/S soft-drops, Space/W/Up cycles the triad. P pause, M mute. Touch: move pads left, CYCLE and DROP right.',
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

-- 7 achievements, slugs must match what the engine fires. Idempotent via the
-- (game_id, slug) unique key the review RPC also syncs on.
INSERT INTO achievements (game_id, slug, name, description, hint, xp, sort_order)
SELECT g.id, a.slug, a.name, a.description, a.hint, a.xp, a.sort_order
FROM games g
CROSS JOIN (
  VALUES
    ('first-match', 'First Cut', 'Clear your first line of gems.', 'Three of one gem in any direction.', 10, 1),
    ('cascade', 'Cascade', 'Reach a chain of two in one drop.', 'Clear a line that lets the gems above it fall into another.', 20, 2),
    ('foundry-clear', 'Foundry Cleared', 'Meet the artisan foundry quota.', 'Thirty gems out of the first well.', 25, 3),
    ('conservatory-clear', 'Conservatory Cleared', 'Meet the conservatory quota.', 'The gems fall faster here than in the foundry.', 30, 4),
    ('archive-clear', 'Archive Cleared', 'Clear the archaeological archive and finish the run.', 'The third well, and the last.', 45, 5),
    ('danger-dancer', 'Danger Dancer', 'Clear from a stack at the top of the well and finish four rows clear of it.', 'Let the well fill, then take the line that empties it.', 40, 6),
    ('gem-legend', 'Gem Legend', 'Score 5,000 in one run.', 'Finishing is not enough: clear the wells fast and chase cascades.', 50, 7)
) AS a(slug, name, description, hint, xp, sort_order)
WHERE g.slug = 'gem-columns'
ON CONFLICT (game_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    hint = EXCLUDED.hint,
    xp = EXCLUDED.xp,
    sort_order = EXCLUDED.sort_order;
