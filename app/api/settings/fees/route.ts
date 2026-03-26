import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );
}

// GET /api/settings/fees — list all service fees
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const country = req.nextUrl.searchParams.get('country');

  let query = supabase
    .from('service_fees')
    .select('*')
    .order('receiving_country')
    .order('operator');

  if (country) {
    query = query.eq('receiving_country', country);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// PUT /api/settings/fees — update a fee entry (admin edit)
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    manually_edited: true,
    edited_at: new Date().toISOString(),
  };
  if (body.fee_krw !== undefined) updates.fee_krw = body.fee_krw;
  if (body.notes !== undefined) updates.notes = body.notes;

  // If resetting, clear the manual edit flag
  if (body.reset === true) {
    updates.manually_edited = false;
    updates.edited_at = null;
    updates.notes = null;
  }

  const { data, error } = await supabase
    .from('service_fees')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/settings/fees/reset — get the latest scraped fee for an operator
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.receiving_country || !body?.operator) {
    return NextResponse.json({ error: 'receiving_country and operator required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get the latest non-zero scraped fee from rate_records
  // (scrapers sometimes return 0 when they fail to read the fee element)
  let query = supabase
    .from('rate_records')
    .select('service_fee')
    .eq('receiving_country', body.receiving_country)
    .eq('operator', body.operator)
    .is('deleted_at', null)
    .gt('service_fee', 0)
    .order('run_hour', { ascending: false })
    .limit(1);

  if (body.delivery_method) {
    query = query.eq('delivery_method', body.delivery_method);
  }

  let { data, error } = await query;

  // If no non-zero fee found, fall back to the latest record (including 0)
  if (!error && (!data || data.length === 0)) {
    let fallback = supabase
      .from('rate_records')
      .select('service_fee')
      .eq('receiving_country', body.receiving_country)
      .eq('operator', body.operator)
      .is('deleted_at', null)
      .order('run_hour', { ascending: false })
      .limit(1);
    if (body.delivery_method) {
      fallback = fallback.eq('delivery_method', body.delivery_method);
    }
    const res = await fallback;
    data = res.data;
    error = res.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scraped_fee: data?.[0]?.service_fee ?? null });
}
