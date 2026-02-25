import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get('country');
  if (!country) {
    return NextResponse.json({ error: 'country parameter required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);
  const fromDateStr = fromDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('rate_records')
    .select('*')
    .eq('receiving_country', country)
    .gte('run_hour', fromDateStr)
    .order('run_hour', { ascending: false })
    .limit(50000);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'No data' }, { status: 500 });
  }

  // Build GME baseline map
  const gmeBaselineMap = new Map<string, number>();
  data.forEach((r: Record<string, unknown>) => {
    if (r.operator === 'GME' && r.total_sending_amount) {
      gmeBaselineMap.set(`${r.run_hour}`, r.total_sending_amount as number);
    }
  });

  const records = data.map((r: Record<string, unknown>) => {
    const gmeBaseline = gmeBaselineMap.get(r.run_hour as string) ?? null;
    const totalSend = r.total_sending_amount as number;
    const priceGap = r.operator !== 'GME' && gmeBaseline
      ? totalSend - gmeBaseline
      : null;
    const status = r.operator === 'GME'
      ? 'GME'
      : priceGap === null
        ? 'Expensive than GME'
        : priceGap > 0
          ? 'Expensive than GME'
          : 'Cheaper than GME';

    return {
      timestamp: (r.scraped_at ?? r.run_hour) as string,
      runHour: r.run_hour as string,
      operator: r.operator as string,
      receivingCountry: r.receiving_country as string,
      receiveAmount: r.receive_amount as number,
      sendAmountKRW: r.send_amount_krw as number,
      receiveMultiplier: 1,
      adjustedSendingAmount: r.send_amount_krw as number,
      serviceFee: (r.service_fee ?? 0) as number,
      totalSendingAmount: totalSend,
      gmeBaseline,
      priceGap,
      status,
    };
  });

  return NextResponse.json(records);
}
