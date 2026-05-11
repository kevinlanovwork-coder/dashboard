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
    // Coinshot legitimately returns round numbers — exempt from round-number guard
    const isRound = r.total_sending_amount % 1000 === 0 && r.operator !== 'Coinshot';

    try {
      const { data: recent } = await supabase
        .from('rate_records')
        .select('total_sending_amount')
        .eq('operator', r.operator)
        .eq('receiving_country', r.receiving_country)
        .eq('delivery_method', r.delivery_method)
        .is('deleted_at', null)
        .order('run_hour', { ascending: false })
        .limit(12);

      if (recent && recent.length >= 3) {
        const sorted = recent.map(x => x.total_sending_amount).sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        if (median > 0) {
          const deviation = Math.abs(r.total_sending_amount - median) / median;
          // Round multiples of 1,000 KRW with >10% deviation are almost certainly scraping defaults
          if (isRound && deviation > 0.1) {
            console.warn(`  ⚠️ Suspicious round value skipped: ${r.operator} ${r.receiving_country} — ${r.total_sending_amount?.toLocaleString()} (median: ${median.toLocaleString()}, deviation: ${(deviation * 100).toFixed(0)}%)`);
            try {
              await supabase.from('outlier_log').insert({
                run_hour: r.run_hour, operator: r.operator, receiving_country: r.receiving_country,
                delivery_method: r.delivery_method, scraped_value: r.total_sending_amount,
                median_value: median, deviation_pct: Math.round(deviation * 100),
              });
            } catch { /* non-fatal */ }
            continue;
          }
          // Any value with >50% deviation is an outlier
          if (deviation > 0.5) {
            console.warn(`  ⚠️ Outlier skipped: ${r.operator} ${r.receiving_country} — ${r.total_sending_amount?.toLocaleString()} (median: ${median.toLocaleString()}, deviation: ${(deviation * 100).toFixed(0)}%)`);
            try {
              await supabase.from('outlier_log').insert({
                run_hour: r.run_hour, operator: r.operator, receiving_country: r.receiving_country,
                delivery_method: r.delivery_method, scraped_value: r.total_sending_amount,
                median_value: median, deviation_pct: Math.round(deviation * 100),
              });
            } catch { /* non-fatal */ }
            continue;
          }
        }
      } else if (isRound) {
        // No median baseline yet — round number is suspicious on its own
        console.warn(`  ⚠️ Suspicious round value skipped (no baseline): ${r.operator} ${r.receiving_country} — ${r.total_sending_amount?.toLocaleString()}`);
        try {
          await supabase.from('outlier_log').insert({
            run_hour: r.run_hour, operator: r.operator, receiving_country: r.receiving_country,
            delivery_method: r.delivery_method, scraped_value: r.total_sending_amount,
            median_value: null, deviation_pct: null,
          });
        } catch { /* non-fatal */ }
        continue;
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

/**
 * Classify and log a scraper failure to scraper_failure_log.
 */
export async function logFailure(runHour, country, operator, deliveryMethod, errorMessage) {
  let reason = 'scrape_error';
  const msg = (errorMessage ?? '').toLowerCase();
  if (msg.includes('http') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('err_connection')) {
    reason = 'website_down';
  } else if (msg.includes('파싱 실패') || msg.includes('soap') || msg.includes('api 오류')) {
    reason = 'api_error';
  }
  try {
    await supabase.from('scraper_failure_log').insert({
      run_hour: runHour, operator, receiving_country: country,
      delivery_method: deliveryMethod ?? 'Bank Deposit',
      reason, error_message: errorMessage?.slice(0, 500) ?? null,
    });
  } catch { /* non-fatal */ }
}

export default supabase;
