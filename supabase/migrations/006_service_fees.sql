-- Service fee reference table, auto-populated from scrapers with manual override
CREATE TABLE service_fees (
  id                BIGSERIAL PRIMARY KEY,
  receiving_country TEXT NOT NULL,
  operator          TEXT NOT NULL,
  delivery_method   TEXT NOT NULL DEFAULT 'Bank Account',
  fee_krw           NUMERIC NOT NULL DEFAULT 0,
  notes             TEXT,
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (receiving_country, operator, delivery_method)
);

ALTER TABLE service_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to service_fees" ON service_fees FOR ALL USING (true) WITH CHECK (true);
