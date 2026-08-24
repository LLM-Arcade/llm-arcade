-- Run ONLY after the real Hyper Circuit art is integrated, pushed, and
-- the Vercel deploy is serving it (check llmarcade.fun first).
UPDATE games SET status = 'published' WHERE slug = 'hyper-circuit';
