import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );
}

// GET /api/alerts — list all alert rules with last triggered time
export async function GET() {
  const supabase = getSupabase();

  const { data: rules, error } = await supabase
    .from('alert_rules')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch last triggered time per rule
  const ruleIds = (rules ?? []).map(r => r.id);
  let logMap: Record<number, string> = {};

  if (ruleIds.length > 0) {
    const { data: logs } = await supabase
      .from('alert_log')
      .select('alert_rule_id, notified_at')
      .in('alert_rule_id', ruleIds)
      .order('notified_at', { ascending: false });

    if (logs) {
      for (const log of logs) {
        if (!logMap[log.alert_rule_id]) {
          logMap[log.alert_rule_id] = log.notified_at;
        }
      }
    }
  }

  const enriched = (rules ?? []).map(r => ({
    ...r,
    lastTriggered: logMap[r.id] ?? null,
  }));

  return NextResponse.json(enriched);
}

// POST /api/alerts — create a new alert rule
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('alert_rules')
    .insert({
      receiving_country: body.receiving_country,
      operator: body.operator || null,
      delivery_method: body.delivery_method || 'Bank Account',
      direction: body.direction || 'cheaper',
      threshold_krw: body.threshold_krw,
      cooldown_minutes: body.cooldown_minutes ?? 120,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT /api/alerts — update an existing alert rule
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.receiving_country !== undefined) updates.receiving_country = body.receiving_country;
  if (body.operator !== undefined) updates.operator = body.operator || null;
  if (body.delivery_method !== undefined) updates.delivery_method = body.delivery_method;
  if (body.direction !== undefined) updates.direction = body.direction;
  if (body.threshold_krw !== undefined) updates.threshold_krw = body.threshold_krw;
  if (body.cooldown_minutes !== undefined) updates.cooldown_minutes = body.cooldown_minutes;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { data, error } = await supabase
    .from('alert_rules')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/alerts — delete an alert rule
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from('alert_rules')
    .delete()
    .eq('id', body.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
