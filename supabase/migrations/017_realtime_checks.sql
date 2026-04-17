-- Temporary table for on-demand "Check Real Time" scraper results.
-- Data here is NOT part of the main rate_records timeline.
-- Rows auto-expire and are cleaned up by the application.

CREATE TABLE IF NOT EXISTS realtime_checks (
  id BIGSERIAL PRIMARY KEY,
  check_id TEXT NOT NULL,
  corridor TEXT NOT NULL,
  operator TEXT NOT NULL,
  receiving_country TEXT NOT NULL,
  delivery_method TEXT,
  receive_amount NUMERIC,
  send_amount_krw NUMERIC,
  service_fee NUMERIC DEFAULT 0,
  total_sending_amount NUMERIC,
  gme_baseline NUMERIC,
  price_gap NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_realtime_checks_id ON realtime_checks (check_id);
CREATE INDEX idx_realtime_checks_created ON realtime_checks (created_at);

ALTER TABLE realtime_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON realtime_checks FOR ALL USING (true);
