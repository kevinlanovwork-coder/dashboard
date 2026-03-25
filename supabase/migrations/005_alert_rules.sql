-- Global email recipients for all alerts
CREATE TABLE alert_config (
  id              BIGSERIAL PRIMARY KEY,
  notify_emails   TEXT[] NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed a single config row
INSERT INTO alert_config (notify_emails) VALUES ('{}');

-- Alert rules: configurable notifications when price_gap crosses a threshold
CREATE TABLE alert_rules (
  id                BIGSERIAL PRIMARY KEY,
  receiving_country TEXT NOT NULL,
  operator          TEXT,                          -- NULL = any operator
  delivery_method   TEXT NOT NULL DEFAULT 'Bank Account',
  direction         TEXT NOT NULL DEFAULT 'cheaper', -- 'cheaper' | 'any'
  threshold_krw     NUMERIC NOT NULL,              -- e.g., -2000 (negative = competitor cheaper)
  cooldown_minutes  INTEGER NOT NULL DEFAULT 120,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Alert log: deduplication + audit trail
CREATE TABLE alert_log (
  id                   BIGSERIAL PRIMARY KEY,
  alert_rule_id        BIGINT REFERENCES alert_rules(id) ON DELETE CASCADE,
  run_hour             TEXT NOT NULL,
  operator             TEXT NOT NULL,
  receiving_country    TEXT NOT NULL,
  price_gap            NUMERIC NOT NULL,
  total_sending_amount NUMERIC,
  gme_baseline         NUMERIC,
  notified_at          TIMESTAMPTZ DEFAULT NOW(),
  email_sent_to        TEXT[]
);

CREATE INDEX idx_alert_log_rule_time ON alert_log (alert_rule_id, notified_at DESC);

-- RLS: allow anon key full access (dashboard is internal)
ALTER TABLE alert_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to alert_config" ON alert_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to alert_rules" ON alert_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to alert_log" ON alert_log FOR ALL USING (true) WITH CHECK (true);
