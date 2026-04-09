-- Enable RLS on outlier_log (was missing)
ALTER TABLE outlier_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to outlier_log"
  ON outlier_log FOR ALL USING (true) WITH CHECK (true);
