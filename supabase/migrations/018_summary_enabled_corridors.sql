-- Per-user enabled-corridor list for Summary page (max 9 enforced in UI)
ALTER TABLE summary_config ADD COLUMN IF NOT EXISTS enabled_corridors TEXT[] NOT NULL DEFAULT '{}';
