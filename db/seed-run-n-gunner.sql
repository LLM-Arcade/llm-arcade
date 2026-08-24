-- Run 'n Gunner seed. Run via the Supabase SQL tool (never supabase/migrations/).
-- No teaser row is guaranteed for this slug (it is not in launch-lineup.ts),
-- so this is an upsert on the slug unique key: INSERT when absent, UPDATE the
-- teaser when one exists.
--
-- STAND-IN ART: the cabinet currently runs on borrowed Starfall Squadron and
-- Munch Maze sheets because Zo image generation is down. status stays
-- 'coming_soon' here on purpose. Flip to 'published' only after the
-- run-n-gunner art set is regenerated and dropped in.

INSERT INTO games (slug, title, description, era, genre, controls, track, status, score_cap)
VALUES (
  'run-n-gunner',
  'Run ''n Gunner',
  'A one-soldier push down Canyon Road and into the Dynamo Core. Three stages of runner bots, turret pods, and mortar lobbers, six bosses that telegraph every volley, three weapon crates worth grabbing, and a score that doubles if you clear the whole campaign without losing a life.',
  'NES',
  'Run & gun',
  'Arrows/AD run, W/Up aims up, Space/Z jumps (Down+jump drops through platforms), X/J fires. P pause, M mute. Touch: run pads left, JUMP and FIRE right.',
  'A',
  'coming_soon',
  100000
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
    ('open-road', 'Open Road', 'Clear stage 1.', 'Canyon Road ends at the Road Breaker.', 10, 1),
    ('arsenal', 'Arsenal', 'Carry all three special weapons in one run.', 'Fan, Raker, and Slug crates are out there.', 25, 2),
    ('wrecking-crew', 'Wrecking Crew', 'Destroy 60 enemies in one run.', 'The road keeps sending runners.', 50, 3),
    ('flawless-duel', 'Flawless Duel', 'Defeat a boss without taking a hit.', 'Learn the volley rhythm, then own it.', 50, 4),
    ('long-march', 'Long March', 'Clear all three stages.', 'Canyon Road, Scrap Ramparts, Dynamo Core.', 100, 5),
    ('one-life-run', 'One-Life Run', 'Clear the campaign without losing a life.', 'The score doubles. Brag accordingly.', 150, 6),
    ('gunner-legend', 'Gunner Legend', 'Score 40,000 in one run.', 'Flawless duels and a one-life finale add up.', 150, 7)
) AS a(slug, name, description, hint, xp, sort_order)
WHERE g.slug = 'run-n-gunner'
ON CONFLICT (game_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    hint = EXCLUDED.hint,
    xp = EXCLUDED.xp,
    sort_order = EXCLUDED.sort_order;
