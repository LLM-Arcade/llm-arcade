-- Run ONLY after Kickflip City is pushed, the Vercel deploy is serving it, and
-- the guest flow has been played through in production (check llmarcade.fun
-- first).
UPDATE games SET status = 'published' WHERE slug = 'kickflip-city';
