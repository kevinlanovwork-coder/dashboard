import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );
}

// GET /api/alerts/config — get global email config
export async function GET() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('alert_config')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// PUT /api/alerts/config — update global email config
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('alert_config')
    .update({
      notify_emails: body.notify_emails ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id ?? 1)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
