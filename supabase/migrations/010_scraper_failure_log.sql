-- Scraper failure log — stores error details when a scraper fails
CREATE TABLE IF NOT EXISTS scraper_failure_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_hour TEXT NOT NULL,
  operator TEXT NOT NULL,
  receiving_country TEXT NOT NULL,
  delivery_method TEXT NOT NULL DEFAULT 'Bank Deposit',
  reason TEXT NOT NULL DEFAULT 'scrape_error',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying recent failures by date
CREATE INDEX idx_scraper_failure_log_created ON scraper_failure_log (created_at DESC);

-- Index for matching failures to corridors
CREATE INDEX idx_scraper_failure_log_lookup ON scraper_failure_log (run_hour, receiving_country, operator);

-- Enable RLS
ALTER TABLE scraper_failure_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access" ON scraper_failure_log
  FOR ALL USING (true) WITH CHECK (true);

-- Allow anon read access (for health dashboard)
CREATE POLICY "Anon read access" ON scraper_failure_log
  FOR SELECT USING (true);
