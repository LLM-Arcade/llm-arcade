-- The Undervault seed. Run via the Supabase SQL tool (never supabase/migrations/).
-- A teaser row already exists for this slug because the-undervault is in
-- src/data/launch-lineup.ts, so this is an upsert on the slug unique key:
-- UPDATE the teaser in place, INSERT only if it went missing.
--
-- status stays 'coming_soon'. Flip it with db/publish-the-undervault.sql once
-- the cabinet has passed local browser play on /dev/the-undervault and the
-- deploy is serving the art.

INSERT INTO games (slug, title, description, era, genre, controls, track, status, score_cap)
VALUES (
  'the-undervault',
  'The Undervault',
  'A five floor expedition under a dead city: the Gatehouse, the Ossuary, the Fungal Cistern, the Buried Court, and the Deep Mechanism. Pick one of four delvers at the stair, each with a different edge, then bump-fight your way down through eleven monster families to a keeper who guards every staircase. Each keeper fights its own way, from a colossus that winds up a full turn before it swings to an engine that charges twice and fires down its own row.',
  'Original',
  'Dungeon expedition',
  'Arrows/WASD/HJKL step and strike. Q drinks a tonic, G takes what is underfoot, > goes down once the keeper falls, Space waits. P pause, M mute. Touch: D-pad left, TONIC and WAIT right.',
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

-- 7 achievements. Slugs must match exactly what the engine fires; the
-- unlock_achievement RPC rejects anything not seeded here. Idempotent via the
-- (game_id, slug) unique key the review RPC also syncs on.
INSERT INTO achievements (game_id, slug, name, description, hint, xp, sort_order)
SELECT g.id, a.slug, a.name, a.description, a.hint, a.xp, a.sort_order
FROM games g
CROSS JOIN (
  VALUES
    ('first-descent', 'First Descent', 'Reach the second floor.', 'The Gatehouse keeper sits on the stair.', 10, 1),
    ('monster-breaker', 'Monster Breaker', 'Put down 20 things in one run.', 'Keepers count.', 20, 2),
    ('relic-bearer', 'Relic Bearer', 'Carry 3 relics at once.', 'Locked side vaults hold one each, and the merchant sells them.', 25, 3),
    ('ossuary', 'Ossuary', 'Break the Obsidian Spider Queen.', 'Kill the brood before you kill the queen.', 30, 4),
    ('deep-mechanism', 'Deep Mechanism', 'Reach the fifth floor.', 'Four keepers stand between you and the gears.', 40, 5),
    ('boss-breaker', 'Boss Breaker', 'Stop the Buried Engine.', 'It charges two turns, then fires down its row and column.', 50, 6),
    ('vault-legend', 'Vault Legend', 'Score 6,000 in one run.', 'Only a full clear gets there.', 50, 7)
) AS a(slug, name, description, hint, xp, sort_order)
WHERE g.slug = 'the-undervault'
ON CONFLICT (game_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    hint = EXCLUDED.hint,
    xp = EXCLUDED.xp,
    sort_order = EXCLUDED.sort_order;
