-- Run ONLY after the Brickstorm cabinet is pushed and the Vercel deploy is
-- serving it (check llmarcade.fun first).
UPDATE games SET status = 'published' WHERE slug = 'brickstorm';
