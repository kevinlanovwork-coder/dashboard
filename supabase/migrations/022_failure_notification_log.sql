-- Tracks the hourly scraper-failure digest email so at most ONE is sent per
-- KST clock-hour, even though the scraper runs every 15 minutes.
-- The UNIQUE hour_key is the dedup key (option A: first failing run of the hour sends).
CREATE TABLE IF NOT EXISTS failure_notification_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hour_key    TEXT NOT NULL UNIQUE,        -- e.g. '2026-06-08 14' (KST clock hour)
  fail_count  INTEGER NOT NULL DEFAULT 0,
  sent_to     TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE failure_notification_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (scraper notify job)
CREATE POLICY "Service role full access" ON failure_notification_log
  FOR ALL USING (true) WITH CHECK (true);

-- Allow anon read access (for health dashboard)
CREATE POLICY "Anon read access" ON failure_notification_log
  FOR SELECT USING (true);
