-- Run ONLY after The Undervault has passed local browser play on
-- /dev/the-undervault and the deploy is serving its art (check llmarcade.fun
-- first).
UPDATE games SET status = 'published' WHERE slug = 'the-undervault';
