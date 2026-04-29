import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
}

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('summary_config').select('*').limit(1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const supabase = getSupabase();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.main_operators !== undefined) update.main_operators = body.main_operators;
  if (body.corridor_operators !== undefined) update.corridor_operators = body.corridor_operators;
  if (body.enabled_corridors !== undefined) update.enabled_corridors = body.enabled_corridors;
  if (body.report_corridors !== undefined) update.report_corridors = body.report_corridors;
  if (body.report_corridor_operators !== undefined) update.report_corridor_operators = body.report_corridor_operators;

  const { data, error } = await supabase
    .from('summary_config')
    .update(update)
    .eq('id', body.id ?? 1)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
