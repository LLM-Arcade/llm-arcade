-- Run ONLY after the real Run 'n Gunner art is integrated, pushed, and
-- the Vercel deploy is serving it (check llmarcade.fun first).
UPDATE games SET status = 'published' WHERE slug = 'run-n-gunner';
