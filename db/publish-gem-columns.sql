-- Run ONLY after Gem Columns passes local browser play on /dev/gem-columns,
-- is pushed, and the Vercel deploy is serving it (check llmarcade.fun first).
UPDATE games SET status = 'published' WHERE slug = 'gem-columns';
