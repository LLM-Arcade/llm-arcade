-- Brickstorm seed. Run via the Supabase SQL tool (never supabase/migrations/).
-- A teaser row already exists for this slug, so this is an upsert on the slug
-- unique key: it UPDATEs the teaser rather than colliding with it.
--
-- status stays 'coming_soon' here on purpose. Flip it with
-- db/publish-brickstorm.sql once the cabinet is deployed and verified.

INSERT INTO games (slug, title, description, era, genre, controls, track, status, score_cap)
VALUES (
  'brickstorm',
  'Brickstorm',
  'Three boards of workshop ceramics behind a paddle. The ball speeds up with every break, firebrick takes three hits and basalt takes four, and eight powerups arrive from a shuffled bag so a long run sees all of them. Clear a board without dropping a ball for the bonus, and remember the shield only saves you once.',
  'Arcade',
  'Brick breaker',
  'Arrows/AD or the mouse slide the paddle, Space/W/Up launches and frees a caught ball. P pause, M mute. Touch: slide pads left, LAUNCH right.',
  'A',
  'coming_soon',
  50000
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
    ('first-break', 'First Break', 'Destroy your first brick.', 'Launch and aim for the pottery tiles.', 10, 1),
    ('workshop-clear', 'Workshop Cleared', 'Clear the Pottery Workshop board.', 'The firebrick spine down the middle takes three hits each.', 15, 2),
    ('triple-ball', 'Triple Ball', 'Have three balls in play at once.', 'Catch the split drop.', 25, 3),
    ('untouched-board', 'Untouched', 'Clear a board without losing a ball.', 'Worth 300 points on top of the clear bonus.', 35, 4),
    ('brick-chain', 'Brick Chain', 'Break four bricks before the ball comes back to your paddle.', 'Multiball keeps the run going while one ball stays up top.', 40, 5),
    ('kiln-master', 'Kiln Master', 'Clear all three boards.', 'Workshop, greenhouse, then the kiln.', 50, 6),
    ('storm-legend', 'Storm Legend', 'Score 12,000 in one run.', 'Clear bonuses and the multiplier drop carry the total.', 50, 7)
) AS a(slug, name, description, hint, xp, sort_order)
WHERE g.slug = 'brickstorm'
ON CONFLICT (game_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    hint = EXCLUDED.hint,
    xp = EXCLUDED.xp,
    sort_order = EXCLUDED.sort_order;
