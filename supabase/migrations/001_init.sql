-- 환율 비교 데이터 테이블
CREATE TABLE IF NOT EXISTS rate_records (
  id            BIGSERIAL PRIMARY KEY,
  run_hour      TEXT NOT NULL,                        -- "2026-02-13 15:00"
  operator      TEXT NOT NULL,                        -- "Hanpass", "Sentbe" …
  receiving_country TEXT NOT NULL DEFAULT 'Indonesia',
  receive_amount    NUMERIC NOT NULL DEFAULT 13000000, -- IDR
  send_amount_krw   NUMERIC,
  service_fee       NUMERIC DEFAULT 0,
  total_sending_amount NUMERIC NOT NULL,
  gme_baseline  NUMERIC,
  price_gap     NUMERIC,
  status        TEXT,                                 -- 'GME' | 'Cheaper than GME' | 'Expensive than GME'
  scraped_at    TIMESTAMPTZ DEFAULT NOW(),

  -- 같은 시간대에 같은 운영사/국가 중복 방지
  UNIQUE (run_hour, operator, receiving_country)
);

CREATE INDEX IF NOT EXISTS idx_rate_records_run_hour ON rate_records (run_hour DESC);
CREATE INDEX IF NOT EXISTS idx_rate_records_operator ON rate_records (operator);

-- Row Level Security: anon 키로 읽기만 허용
ALTER TABLE rate_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access"
  ON rate_records FOR SELECT
  USING (true);
