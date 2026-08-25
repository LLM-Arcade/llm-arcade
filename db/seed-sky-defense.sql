-- Sky Defense seed. Run via the Supabase SQL tool (never supabase/migrations/).
-- A teaser row already exists for this slug (it is in launch-lineup.ts), so
-- this is an upsert on the slug unique key: it UPDATEs the teaser in place.
-- status stays 'coming_soon'. db/publish-sky-defense.sql flips it after the
-- cabinet is deployed and verified in production.

INSERT INTO games (slug, title, description, era, genre, controls, track, status, score_cap)
VALUES (
  'sky-defense',
  'Sky Defense',
  'Hold three skylines with one interceptor battery: the Desert Relay, River City, and the Mountain Observatory. Twelve waves send seed pods, clockwork kites, ember mines, balloon decoys, beetle drones, orbiting masks, wind-up swarms, and leaf-sail skiffs down at your towns. Lead your shots, because a burst opens small and grows. Ember mines set off their neighbours, and every kill from one burst scores together.',
  'Arcade',
  'Interception',
  'Move the mouse to aim, click to fire. Left/A and Right/D step the aim through eight bearings, Space fires. P pause, M mute. Touch: drag to aim, aim pads left, FIRE right.',
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
    ('first-intercept', 'First Intercept', 'Destroy your first threat.', 'Aim ahead of it, not at it.', 10, 1),
    ('relay-held', 'Relay Held', 'Hold the Desert Relay.', 'Three waves over the solar receivers.', 20, 2),
    ('river-guardian', 'River Guardian', 'Hold River City.', 'Four waves, and the beetle drones steer.', 30, 3),
    ('observatory-held', 'Observatory Held', 'Hold the Mountain Observatory.', 'Five waves using all eight threat families.', 40, 4),
    ('shield-wall', 'Shield Wall', 'Take four threats with one burst.', 'Ember mines set off whatever is beside them.', 40, 5),
    ('perfect-sky', 'Perfect Sky', 'Clear a region without losing any health.', 'Balloon decoys are harmless. Let them land.', 50, 6),
    ('defense-legend', 'Defense Legend', 'Score 11,500 in one run.', 'Accuracy bonuses and full-health clears add up.', 50, 7)
) AS a(slug, name, description, hint, xp, sort_order)
WHERE g.slug = 'sky-defense'
ON CONFLICT (game_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    hint = EXCLUDED.hint,
    xp = EXCLUDED.xp,
    sort_order = EXCLUDED.sort_order;
