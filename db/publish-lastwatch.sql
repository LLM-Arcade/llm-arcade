-- Run ONLY after Jeff's playtest approval, the key-art tile at
-- public/assets/games/lastwatch.png, the dev -> prod release, and the
-- Vercel deploy serving the cabinet (check llmarcade.fun first).
UPDATE games SET status = 'published' WHERE slug = 'lastwatch';
