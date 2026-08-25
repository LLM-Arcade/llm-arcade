-- Run ONLY after Sky Defense is pushed and the Vercel deploy is serving it
-- (check llmarcade.fun first), with local browser play on /dev/sky-defense
-- already passed.
UPDATE games SET status = 'published' WHERE slug = 'sky-defense';
