/**
 * Check hourly schedule health — last 48 hours of Supabase data
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data, error } = await sb
  .from('rate_records')
  .select('run_hour, operator, receiving_country')
  .gte('run_hour', '2026-02-18 00:00')
  .order('run_hour', { ascending: false });

if (error) { console.error('Supabase error:', error); process.exit(1); }

// Group by run_hour
const byHour = {};
for (const r of data) {
  if (!byHour[r.run_hour]) byHour[r.run_hour] = { countries: new Set(), operators: new Set() };
  byHour[r.run_hour].countries.add(r.receiving_country);
  byHour[r.run_hour].operators.add(r.operator);
}

const hours = Object.entries(byHour).sort((a, b) => b[0].localeCompare(a[0]));

console.log('\n── 최근 스크래핑 내역 (최신순) ─────────────────────────────────────────');
console.log('run_hour              | 국가수 | 운영사수 | 운영사 목록');
console.log('─'.repeat(90));
for (const [hr, v] of hours.slice(0, 40)) {
  const ops = [...v.operators].sort().join(', ');
  console.log(
    `${hr} |   ${String(v.countries.size).padStart(2)}  |    ${String(v.operators.size).padStart(2)}    | ${ops}`
  );
}

// Check for gaps (missing 30-min slots)
console.log('\n── 누락 시간대 분석 (최근 24시간, 30분 간격) ─────────────────────────────');
const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST
const runHourSet = new Set(hours.map(([hr]) => hr));
let missing = 0;
for (let i = 1; i <= 48; i++) {
  const d = new Date(now.getTime() - i * 30 * 60 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(d.getUTCDate()).padStart(2, '0');
  const hh   = String(d.getUTCHours()).padStart(2, '0');
  const min  = d.getUTCMinutes() < 30 ? '00' : '30';
  const key  = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  if (!runHourSet.has(key)) {
    console.log(`  ❌ 누락: ${key} (KST ${hh}:${min})`);
    missing++;
  }
}
if (missing === 0) console.log('  ✅ 최근 24시간 모두 데이터 있음 (30분 간격)');
else console.log(`\n  총 ${missing}개 시간대 누락`);

console.log(`\n전체 레코드 수: ${data.length}건 (2026-02-18 이후)`);
