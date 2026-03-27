-- Archive table for records older than 90 days (same schema, relaxed constraints)
CREATE TABLE IF NOT EXISTS rate_records_archive (
  id                   BIGSERIAL PRIMARY KEY,
  run_hour             TEXT,
  operator             TEXT,
  receiving_country    TEXT,
  receive_amount       NUMERIC,
  send_amount_krw      NUMERIC,
  service_fee          NUMERIC DEFAULT 0,
  total_sending_amount NUMERIC,
  gme_baseline         NUMERIC,
  price_gap            NUMERIC,
  status               TEXT,
  delivery_method      TEXT DEFAULT 'Bank Deposit',
  deleted_at           TIMESTAMPTZ,
  scraped_at           TIMESTAMPTZ
);

ALTER TABLE rate_records_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to rate_records_archive" ON rate_records_archive FOR ALL USING (true) WITH CHECK (true);

-- Compound index for fast dashboard queries
CREATE INDEX IF NOT EXISTS idx_rate_records_country_date
  ON rate_records (receiving_country, run_hour DESC)
  WHERE deleted_at IS NULL;
