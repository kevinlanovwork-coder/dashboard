-- Add per-corridor operator selection for Summary page
ALTER TABLE summary_config ADD COLUMN corridor_operators JSONB NOT NULL DEFAULT '{}';
