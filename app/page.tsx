import { createClient } from '@supabase/supabase-js';
import Dashboard from './components/Dashboard';
import type { RateRecord } from './lib/parseRates';

// 빌드 시 정적 생성 방지 — 항상 서버에서 실시간 렌더링
export const dynamic = 'force-dynamic';

const DEFAULT_COUNTRY = 'Indonesia';

export default async function Home() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );

  // Fetch distinct countries from recent data
  const { data: countryRows } = await supabase
    .from('rate_records')
    .select('receiving_country')
    .order('run_hour', { ascending: false })
    .limit(1000);

  const countries = [...new Set((countryRows ?? []).map((r: { receiving_country: string }) => r.receiving_country))].sort() as string[];

  // Fetch 30 days of data for the default country
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);
  const fromDateStr = fromDate.toISOString().slice(0, 10);

  // Fetch all records in batches (Supabase caps at 1000 per request)
  const BATCH = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allData: any[] = [];
  let from = 0;
  while (true) {
    const { data: batch, error: batchError } = await supabase
      .from('rate_records')
      .select('*')
      .eq('receiving_country', DEFAULT_COUNTRY)
      .is('deleted_at', null)
      .gte('run_hour', fromDateStr)
      .order('run_hour', { ascending: false })
      .range(from, from + BATCH - 1);

    if (batchError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          데이터를 불러올 수 없습니다: {batchError.message}
        </div>
      );
    }
    if (!batch || batch.length === 0) break;
    allData = allData.concat(batch);
    if (batch.length < BATCH) break;
    from += BATCH;
  }

  const data = allData;

  // Build GME baseline map per run_hour (delivery-method-aware for multi-method corridors like China)
  const gmeBaselineMap = new Map<string, number>();
  data.forEach(r => {
    if (r.operator === 'GME' && r.total_sending_amount) {
      const dmKey = `${r.run_hour}||${r.delivery_method}`;
      gmeBaselineMap.set(dmKey, r.total_sending_amount);
      if (!gmeBaselineMap.has(r.run_hour)) {
        gmeBaselineMap.set(r.run_hour, r.total_sending_amount);
      }
    }
  });

  const records: RateRecord[] = data.map(r => {
    const dmKey = `${r.run_hour}||${r.delivery_method}`;
    const gmeBaseline = gmeBaselineMap.get(dmKey) ?? gmeBaselineMap.get(r.run_hour) ?? null;
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
      id: r.id,
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
      deliveryMethod: r.delivery_method ?? 'Bank Deposit',
    };
  });

  return <Dashboard initialRecords={records} countries={countries} defaultCountry={DEFAULT_COUNTRY} />;
}
