-- Enable RLS on fee_edit_log (was missing)
ALTER TABLE fee_edit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to fee_edit_log"
  ON fee_edit_log FOR ALL USING (true) WITH CHECK (true);
