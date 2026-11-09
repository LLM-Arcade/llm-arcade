-- Run ONLY after all three hold:
--   1. Flagstone passes local browser play on /dev/flagstone,
--   2. public/assets/games/flagstone.png exists (key art is still missing),
--   3. the merged deploy on llmarcade.fun is serving the cabinet.
UPDATE games SET status = 'published' WHERE slug = 'flagstone';
