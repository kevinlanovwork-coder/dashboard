-- Per-user enabled-corridor list + per-corridor competitor selection for the Report page
ALTER TABLE summary_config
  ADD COLUMN IF NOT EXISTS report_corridors TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS report_corridor_operators JSONB NOT NULL DEFAULT '{}';
