-- Add soft-delete support: deleted rows are hidden instead of removed,
-- so the scraper's upsert won't re-create them.

ALTER TABLE rate_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Allow anon key to update (needed for soft-delete via the dashboard API)
CREATE POLICY "Allow soft delete update"
  ON rate_records FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Preserve deleted_at when the scraper upserts a row that was soft-deleted.
-- If the incoming row doesn't explicitly set deleted_at, keep the old value.
CREATE OR REPLACE FUNCTION preserve_deleted_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    NEW.deleted_at := OLD.deleted_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_preserve_deleted_at
  BEFORE UPDATE ON rate_records
  FOR EACH ROW
  EXECUTE FUNCTION preserve_deleted_at();
