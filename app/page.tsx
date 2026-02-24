import { createClient } from '@supabase/supabase-js';
import Dashboard from './components/Dashboard';
import type { RateRecord } from './lib/parseRates';

// 빌드 시 정적 생성 방지 — 항상 서버에서 실시간 렌더링
export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);
  const fromDateStr = fromDate.toISOString().slice(0, 10); // "YYYY-MM-DD"

  const { data, error } = await supabase
    .from('rate_records')
    .select('*')
    .gte('run_hour', fromDateStr)
    .order('run_hour', { ascending: false });

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        데이터를 불러올 수 없습니다: {error?.message}
      </div>
    );
  }

  // Build GME baseline map per (run_hour, receiving_country) from raw data
  const gmeBaselineMap = new Map<string, number>();
  data.forEach(r => {
    if (r.operator === 'GME' && r.total_sending_amount) {
      gmeBaselineMap.set(`${r.run_hour}|${r.receiving_country}`, r.total_sending_amount);
    }
  });

  const records: RateRecord[] = data.map(r => {
    const gmeBaseline = gmeBaselineMap.get(`${r.run_hour}|${r.receiving_country}`) ?? null;
    const priceGap = r.operator !== 'GME' && gmeBaseline
      ? r.total_sending_amount - gmeBaseline
      : null;
    const status = r.operator === 'GME'
      ? 'GME'
      : priceGap === null
        ? 'Expensive than GME'
        : priceGap > 0
          ? 'Expensive than GME'
          : 'Cheaper than GME';

    return {
      timestamp: r.scraped_at ?? r.run_hour,
      runHour: r.run_hour,
      operator: r.operator,
      receivingCountry: r.receiving_country,
      receiveAmount: r.receive_amount,
      sendAmountKRW: r.send_amount_krw,
      receiveMultiplier: 1,
      adjustedSendingAmount: r.send_amount_krw,
      serviceFee: r.service_fee ?? 0,
      totalSendingAmount: r.total_sending_amount,
      gmeBaseline,
      priceGap,
      status,
    };
  });

  return <Dashboard records={records} />;
}
