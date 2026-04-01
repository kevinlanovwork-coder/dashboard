import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * rate_records 테이블에 upsert (run_hour + operator + receiving_country + delivery_method 기준 중복 방지)
 * 저장 전 이상치 검증: 최근 6건의 중앙값 대비 50% 이상 벗어나면 스킵
 */
export async function saveRates(records) {
  if (records.length === 0) return;

  const validated = [];
  for (const r of records) {
    try {
      const { data: recent } = await supabase
        .from('rate_records')
        .select('total_sending_amount')
        .eq('operator', r.operator)
        .eq('receiving_country', r.receiving_country)
        .eq('delivery_method', r.delivery_method)
        .is('deleted_at', null)
        .order('run_hour', { ascending: false })
        .limit(6);

      if (recent && recent.length >= 3) {
        const sorted = recent.map(x => x.total_sending_amount).sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        if (median > 0) {
          const deviation = Math.abs(r.total_sending_amount - median) / median;
          if (deviation > 0.5) {
            console.warn(`  ⚠️ Outlier skipped: ${r.operator} ${r.receiving_country} — ${r.total_sending_amount?.toLocaleString()} (median: ${median.toLocaleString()}, deviation: ${(deviation * 100).toFixed(0)}%)`);
            continue;
          }
        }
      }
    } catch {
      // Validation failed — save anyway rather than lose data
    }
    validated.push(r);
  }

  if (validated.length === 0) return;

  const { error } = await supabase
    .from('rate_records')
    .upsert(validated, { onConflict: 'run_hour,operator,receiving_country,delivery_method' });

  if (error) throw new Error(`Supabase upsert error: ${error.message}`);
}

export default supabase;
