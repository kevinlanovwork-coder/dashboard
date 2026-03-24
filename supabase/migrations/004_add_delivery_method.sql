-- Add delivery_method column to distinguish Alipay / Bank Account / etc.
ALTER TABLE rate_records
  ADD COLUMN IF NOT EXISTS delivery_method TEXT NOT NULL DEFAULT 'Bank Account';

-- Drop old unique constraint and recreate with delivery_method included
ALTER TABLE rate_records
  DROP CONSTRAINT IF EXISTS rate_records_run_hour_operator_receiving_country_key;

ALTER TABLE rate_records
  ADD CONSTRAINT rate_records_run_hour_operator_receiving_country_delivery_key
  UNIQUE (run_hour, operator, receiving_country, delivery_method);
