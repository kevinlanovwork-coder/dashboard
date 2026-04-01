import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
}

// GET — fetch fee edit history
export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('fee_edit_log')
    .select('*')
    .order('edited_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// DELETE — delete a single log entry or clear all
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const supabase = getSupabase();

  if (body?.clearAll) {
    const { error } = await supabase.from('fee_edit_log').delete().neq('id', 0);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (!body?.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabase.from('fee_edit_log').delete().eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
