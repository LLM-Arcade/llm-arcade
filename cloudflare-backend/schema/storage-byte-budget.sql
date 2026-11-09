-- Additive upgrade: count bytes that exist, not unfulfilled size declarations.
-- Preserve every file, chunk, path and the legacy counter during staged rollout.
ALTER TABLE storage_budget ADD COLUMN stored_bytes INTEGER NOT NULL DEFAULT 0 CHECK(stored_bytes >= 0);
-- statement-breakpoint
UPDATE storage_budget SET stored_bytes = (SELECT coalesce(sum(length(data)),0) FROM storage_chunks) WHERE id = 1;
-- statement-breakpoint
-- BEFORE INSERT also runs for ON CONFLICT retries. Existing positions must not
-- reserve capacity again; the immutable writer separately verifies their bytes.
CREATE TRIGGER storage_chunk_capacity BEFORE INSERT ON storage_chunks
WHEN NOT EXISTS (SELECT 1 FROM storage_chunks WHERE file_id = NEW.file_id AND position = NEW.position)
  AND coalesce((SELECT stored_bytes FROM storage_budget WHERE id = 1),419430400) + length(NEW.data) > 419430400
BEGIN
  SELECT RAISE(ABORT,'arcade_storage_payload_budget_exceeded');
END;
-- statement-breakpoint
CREATE TRIGGER storage_chunk_charge AFTER INSERT ON storage_chunks BEGIN
  UPDATE storage_budget SET stored_bytes = stored_bytes + length(NEW.data) WHERE id = 1;
END;
-- statement-breakpoint
-- No deletion endpoint is added. Keep accounting correct if explicitly
-- authorized database maintenance removes a chunk in the future.
CREATE TRIGGER storage_chunk_release AFTER DELETE ON storage_chunks BEGIN
  UPDATE storage_budget SET stored_bytes = stored_bytes - length(OLD.data) WHERE id = 1;
END;
