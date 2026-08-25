-- Lastwatch seed. Run via the Supabase SQL tool (never supabase/migrations/).
-- No teaser row exists for this slug (it is not in launch-lineup.ts), so this
-- is an upsert on the slug unique key: INSERT when absent, UPDATE otherwise.
--
-- status stays 'coming_soon' here. Flip with db/publish-lastwatch.sql only
-- after Jeff's playtest approval and the key-art tile lands at
-- public/assets/games/lastwatch.png.

INSERT INTO games (slug, title, description, era, genre, controls, track, status, score_cap)
VALUES (
  'lastwatch',
  'Lastwatch',
  'The catalog''s 3D flagship: a third-person co-op horde defense. Nine holds kept the line and eight are dark; you and an AI partner hold the ninth through an endless night. Three classes, a five-district hold you open door by door, twelve kinds of Gloam that hunt in packs and dig under your walls, four milestone bosses, and a valor economy of weapons, armor, and timber. The watch holds as long as you do.',
  'Original',
  'Co-op horde defense',
  'Keyboard only. WASD moves, mouse aims, LMB attacks (hold to charge or wind up), RMB guards, daggers, or mends by class, Q class skill, E interacts and rebuilds, G bandage, F command wheel, B ledger, P pause, M mute.',
  'A',
  'coming_soon',
  5000000
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

-- 12 achievements (the spec ceiling), slugs must match what the engine
-- fires. Idempotent via the (game_id, slug) unique key.
INSERT INTO achievements (game_id, slug, name, description, hint, xp, sort_order)
SELECT g.id, a.slug, a.name, a.description, a.hint, a.xp, a.sort_order
FROM games g
CROSS JOIN (
  VALUES
    ('first-night', 'First Night', 'Hold the watch through wave 3.', 'The first waves teach; the horn keeps score.', 10, 1),
    ('the-full-hold', 'The Full Hold', 'Open all four districts in one run.', 'Every door is more to fight with and more to defend.', 50, 2),
    ('hold-the-arch', 'Hold the Arch', 'Reach wave 8 with the arch barricade never destroyed.', 'The timber remembers. So do the Breachers.', 50, 3),
    ('shoulder-to-shoulder', 'Shoulder to Shoulder', 'Revive your partner three times in one run.', 'Nobody bleeds out on your watch.', 25, 4),
    ('pack-breaker', 'Pack-Breaker', 'Kill an Alpha, then wipe its scattered pack within 8 seconds.', 'Cut the head off and the body panics.', 50, 5),
    ('no-thieves-tonight', 'No Thieves Tonight', 'Kill a Filcher before it escapes with stolen goods.', 'It leaves with nothing.', 25, 6),
    ('well-armed', 'Well Armed', 'Wield a masterwork weapon.', 'The armory remembers its craft. So do the boss caches.', 25, 7),
    ('crowd-breaker', 'Crowd-Breaker', 'Knight: hit six or more Gloam with one heavy swing.', 'Wind up when the tide is thickest.', 50, 8),
    ('keen-eye', 'Keen Eye', 'Archer: land 25 headshot kills in one run.', 'Aim for the ember eyes.', 50, 9),
    ('lifeline', 'Lifeline', 'Mage: heal 1,000 HP in one run.', 'Warm light, well spent.', 50, 10),
    ('the-long-count', 'The Long Count', 'Clear wave 20 on Long Watch or Forlorn Watch.', 'The Packlord knows your name.', 150, 11),
    ('watch-legend', 'Watch Legend', 'Score 20,000 on Long Watch or Forlorn Watch.', 'The night will remember this one.', 150, 12)
) AS a(slug, name, description, hint, xp, sort_order)
WHERE g.slug = 'lastwatch'
ON CONFLICT (game_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    hint = EXCLUDED.hint,
    xp = EXCLUDED.xp,
    sort_order = EXCLUDED.sort_order;
