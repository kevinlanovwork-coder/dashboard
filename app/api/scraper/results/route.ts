import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const checkId = req.nextUrl.searchParams.get('checkId');
  if (!checkId) {
    return NextResponse.json({ error: 'checkId required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );

  // Fetch results for this check
  const { data, error } = await supabase
    .from('realtime_checks')
    .select('*')
    .eq('check_id', checkId)
    .order('total_sending_amount', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ status: 'pending', records: [] });
  }

  // Cleanup: delete checks older than 1 hour (non-blocking)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  supabase
    .from('realtime_checks')
    .delete()
    .lt('created_at', oneHourAgo)
    .then(() => {});

  return NextResponse.json({
    status: 'ready',
    records: data.map(r => ({
      operator: r.operator,
      receivingCountry: r.receiving_country,
      deliveryMethod: r.delivery_method,
      receiveAmount: r.receive_amount,
      sendAmountKRW: r.send_amount_krw,
      serviceFee: r.service_fee,
      totalSendingAmount: r.total_sending_amount,
      gmeBaseline: r.gme_baseline,
      priceGap: r.price_gap,
      status: r.status,
    })),
  });
}
