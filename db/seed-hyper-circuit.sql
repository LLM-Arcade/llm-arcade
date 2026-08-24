-- Hyper Circuit seed. Run via the Supabase SQL tool (never supabase/migrations/).
-- The games row already exists as a coming_soon teaser: UPDATE it, an INSERT
-- would hit the slug unique key.
--
-- STAND-IN ART: the cabinet currently runs on borrowed Starfall Squadron and
-- Munch Maze sheets because Zo image generation is down. status stays
-- 'coming_soon' here on purpose. Flip to 'published' only after the
-- hyper-circuit art set is regenerated and dropped in.

UPDATE games
SET
  title = 'Hyper Circuit',
  description = 'Anti-gravity racing over sun-baked flats. Three original circuits, four rivals, a shield that boost and rail scrapes both feed on, and a translucent ghost that learns your best lap and dares you to beat it.',
  era = 'SNES',
  genre = 'Racing',
  controls = 'Arrows/WASD steer, accelerate and brake. Space or Shift to boost (spends shield). P pause, M mute. Touch: drag to steer, hold to accelerate, BOOST button.',
  score_cap = 40000,
  status = 'coming_soon'
WHERE slug = 'hyper-circuit';

-- 7 achievements, slugs must match what the engine fires. Idempotent via the
-- (game_id, slug) unique key the review RPC also syncs on.
INSERT INTO achievements (game_id, slug, name, description, hint, xp, sort_order)
SELECT g.id, a.slug, a.name, a.description, a.hint, a.xp, a.sort_order
FROM games g
CROSS JOIN (
  VALUES
    ('first-finish', 'First Finish', 'Finish a race.', 'Cross the line, any position counts.', 10, 1),
    ('front-runner', 'Front Runner', 'Win a race.', 'Beat all four rivals to the line.', 50, 2),
    ('clean-circuit', 'Clean Circuit', 'Finish a race without touching a rail.', 'Smooth lines, no scrapes.', 50, 3),
    ('ghost-chaser', 'Ghost Chaser', 'Beat your own ghost lap.', 'Outrun the translucent you.', 50, 4),
    ('boost-artist', 'Boost Artist', 'Land 5 clean boosts in one race.', 'Boost and do not hit anything while it burns.', 25, 5),
    ('grand-circuit', 'Grand Circuit', 'Finish all three circuits in one run.', 'Alkali Flats, Terrace Canyon, Basalt Rim.', 100, 6),
    ('circuit-legend', 'Circuit Legend', 'Score 18,000 in one run.', 'Podiums, par laps, and clean boosts add up.', 150, 7)
) AS a(slug, name, description, hint, xp, sort_order)
WHERE g.slug = 'hyper-circuit'
ON CONFLICT (game_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    hint = EXCLUDED.hint,
    xp = EXCLUDED.xp,
    sort_order = EXCLUDED.sort_order;
