import { createClient } from '@supabase/supabase-js';
import Dashboard from './components/Dashboard';
import type { RateRecord } from './lib/parseRates';

// 빌드 시 정적 생성 방지 — 항상 서버에서 실시간 렌더링
export const dynamic = 'force-dynamic';

function mapStatus(dbStatus: string | null, operator: string): string {
  if (operator === 'GME') return 'GME';
  if (dbStatus === 'GME 유리') return 'Expensive than GME';
  if (dbStatus === '경쟁사 유리') return 'Cheaper than GME';
  return 'Expensive than GME';
}

export default async function Home() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase
    .from('rate_records')
    .select('*')
    .order('run_hour', { ascending: false });

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        데이터를 불러올 수 없습니다: {error?.message}
      </div>
    );
  }

  const records: RateRecord[] = data.map(r => ({
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
    gmeBaseline: r.gme_baseline,
    priceGap: r.price_gap,
    status: mapStatus(r.status, r.operator),
  }));

  return <Dashboard records={records} />;
}
