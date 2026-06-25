-- Per-corridor KRW price-gap tolerance for the Report Summary combined position
ALTER TABLE summary_config
  ADD COLUMN IF NOT EXISTS report_corridor_price_gap_range JSONB NOT NULL DEFAULT '{}';
