-- Kickflip City seed. Run via the Supabase SQL tool (never supabase/migrations/).
-- A teaser row already exists for this slug (it is in launch-lineup.ts), so this
-- is an upsert on the slug unique key: UPDATE the teaser, INSERT if it is gone.
--
-- status stays 'coming_soon' here on purpose. Flip it with
-- db/publish-kickflip-city.sql once the cabinet is deployed and played through
-- on the live site.

INSERT INTO games (slug, title, description, era, genre, controls, track, status, score_cap)
VALUES (
  'kickflip-city',
  'Kickflip City',
  'Three districts on one board: the civic steps, the market underpass, and the warehouse roofs. Rails, ledges, curb ramps, stair sets and roof gaps, on a 75-second clock per district. Every trick and grind extends an open line and its multiplier, and the line only banks once you settle. Bail and the whole line is gone along with six seconds.',
  'PS1',
  'Skate',
  'Arrows/AD push and brake, Down/S crouch loads a bigger ollie, Space ollies, J kickflip, K heelflip, L grab (hold), Left/Right hold your balance on a grind. P pause, M mute. Touch: brake and push pads left, TRICK and OLLIE right.',
  'A',
  'coming_soon',
  80000
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
    ('first-ollie', 'First Ollie', 'Bank your first line.', 'Land a trick, then settle for a beat.', 10, 1),
    ('line-starter', 'Line Starter', 'Bank a line of three links.', 'Keep tricking before the line settles.', 20, 2),
    ('rail-worker', 'Rail Worker', 'Grind 400 px in a single line.', 'Chain two grindables without banking.', 30, 3),
    ('market-run', 'Market Run', 'Clear the market underpass.', 'District two ends at the finish line.', 30, 4),
    ('roofline', 'Roofline', 'Clear the warehouse roofs.', 'Mind the gaps between the roofs.', 40, 5),
    ('clean-landing', 'Clean Landing', 'Bank a five-link line without bailing all run.', 'One wreck anywhere ends the attempt.', 50, 6),
    ('city-legend', 'City Legend', 'Score 12,000 in one run.', 'Long lines pay far more than finishing does.', 50, 7)
) AS a(slug, name, description, hint, xp, sort_order)
WHERE g.slug = 'kickflip-city'
ON CONFLICT (game_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    hint = EXCLUDED.hint,
    xp = EXCLUDED.xp,
    sort_order = EXCLUDED.sort_order;
