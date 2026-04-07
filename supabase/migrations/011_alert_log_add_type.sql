-- Add alert_type and threshold columns to alert_log for display in dashboard
ALTER TABLE alert_log ADD COLUMN IF NOT EXISTS alert_type TEXT NOT NULL DEFAULT 'price';
ALTER TABLE alert_log ADD COLUMN IF NOT EXISTS threshold NUMERIC;
