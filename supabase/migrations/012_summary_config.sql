-- Summary page configuration: main operators to highlight across corridors
CREATE TABLE summary_config (
  id              BIGSERIAL PRIMARY KEY,
  main_operators  TEXT[] NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO summary_config (main_operators)
VALUES ('{GMoneyTrans,Hanpass,E9Pay}');

ALTER TABLE summary_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to summary_config"
  ON summary_config FOR ALL USING (true) WITH CHECK (true);
