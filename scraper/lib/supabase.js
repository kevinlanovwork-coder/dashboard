import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * rate_records 테이블에 upsert (run_hour + operator + receiving_country 기준 중복 방지)
 */
export async function saveRates(records) {
  if (records.length === 0) return;

  const { error } = await supabase
    .from('rate_records')
    .upsert(records, { onConflict: 'run_hour,operator,receiving_country' });

  if (error) throw new Error(`Supabase upsert error: ${error.message}`);
}

export default supabase;
