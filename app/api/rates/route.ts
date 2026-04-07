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

  const days = Number(req.nextUrl.searchParams.get('days') ?? '14');
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromDateStr = fromDate.toISOString().slice(0, 10);

  // Fetch all records in batches (Supabase caps at 1000 per request)
  const BATCH = 1000;
  let allData: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data: batch, error } = await supabase
      .from('rate_records')
      .select('*')
      .eq('receiving_country', country)
      .is('deleted_at', null)
      .gte('run_hour', fromDateStr)
      .order('run_hour', { ascending: false })
      .range(from, from + BATCH - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!batch || batch.length === 0) break;
    allData = allData.concat(batch);
    if (batch.length < BATCH) break;
    from += BATCH;
  }

  const data = allData;
  if (data.length === 0) {
    return NextResponse.json([]);
  }

  // Build GME baseline map (delivery-method-aware for multi-method corridors like China)
  const gmeBaselineMap = new Map<string, number>();
  data.forEach((r: Record<string, unknown>) => {
    if (r.operator === 'GME' && r.total_sending_amount) {
      const dmKey = `${r.run_hour}||${r.delivery_method}`;
      gmeBaselineMap.set(dmKey, r.total_sending_amount as number);
      if (!gmeBaselineMap.has(r.run_hour as string)) {
        gmeBaselineMap.set(r.run_hour as string, r.total_sending_amount as number);
      }
    }
  });

  const records = data.map((r: Record<string, unknown>) => {
    const dmKey = `${r.run_hour}||${r.delivery_method}`;
    const gmeBaseline = gmeBaselineMap.get(dmKey) ?? gmeBaselineMap.get(r.run_hour as string) ?? null;
    const priceGap = r.operator !== 'GME' && gmeBaseline
      ? (r.total_sending_amount as number) - gmeBaseline
      : null;
    const status = r.operator === 'GME'
      ? 'GME'
      : priceGap === null
        ? 'Expensive than GME'
        : priceGap > 0
          ? 'Expensive than GME'
          : 'Cheaper than GME';

    return {
      id: r.id as number,
      timestamp: (r.scraped_at ?? r.run_hour) as string,
      runHour: r.run_hour as string,
      operator: r.operator as string,
      receivingCountry: r.receiving_country as string,
      receiveAmount: r.receive_amount as number,
      sendAmountKRW: r.send_amount_krw as number,
      receiveMultiplier: 1,
      adjustedSendingAmount: r.send_amount_krw as number,
      serviceFee: (r.service_fee ?? 0) as number,
      totalSendingAmount: r.total_sending_amount as number,
      gmeBaseline,
      priceGap,
      status,
      deliveryMethod: (r.delivery_method ?? 'Bank Deposit') as string,
    };
  });

  return NextResponse.json(records);
}

export async function DELETE(req: NextRequest) {
  let body: { id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = body?.id;
  if (typeof id !== 'number') {
    return NextResponse.json({ error: 'id (number) is required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );

  const { error } = await supabase
    .from('rate_records')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
