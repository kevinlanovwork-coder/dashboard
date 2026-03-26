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

// PUT /api/settings/fees — update a fee entry
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.fee_krw !== undefined) updates.fee_krw = body.fee_krw;
  if (body.notes !== undefined) updates.notes = body.notes;

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
