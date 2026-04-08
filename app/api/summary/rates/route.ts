import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { OPERATOR_MAP } from '../../../lib/corridors';

export const dynamic = 'force-dynamic';

const BATCH = 5000;

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get('days') ?? '3');
  const requestedRunHour = req.nextUrl.searchParams.get('runHour') ?? '';
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

  // 1. Read config — per-corridor operators or fallback to global
  const { data: config } = await supabase.from('summary_config').select('main_operators, corridor_operators').limit(1).single();
  const corridorOpsConfig: Record<string, string[]> = config?.corridor_operators ?? {};
  const globalOps: string[] = config?.main_operators ?? ['GMoneyTrans', 'Hanpass', 'E9Pay'];

  // Build set of all operators we need to fetch (GME + union of all per-corridor selections)
  const allTargetOps = new Set<string>(['GME']);
  for (const [corridorKey, expectedOps] of Object.entries(OPERATOR_MAP)) {
    const selected = corridorOpsConfig[corridorKey];
    if (selected && selected.length > 0) {
      selected.forEach(op => allTargetOps.add(op));
    } else {
      // Fallback to global list filtered by corridor availability
      globalOps.filter(op => expectedOps.includes(op)).forEach(op => allTargetOps.add(op));
    }
  }
  const targetOps = [...allTargetOps];

  // 2. Fetch rate_records for target operators only
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromDateStr = fromDate.toISOString().slice(0, 10);

  let allData: { run_hour: string; operator: string; receiving_country: string; delivery_method: string; total_sending_amount: number; send_amount_krw: number; receive_amount: number; service_fee: number }[] = [];
  let from = 0;
  while (true) {
    const { data: batch, error } = await supabase
      .from('rate_records')
      .select('run_hour, operator, receiving_country, delivery_method, total_sending_amount, send_amount_krw, receive_amount, service_fee')
      .in('operator', targetOps)
      .is('deleted_at', null)
      .gte('run_hour', fromDateStr)
      .order('run_hour', { ascending: false })
      .range(from, from + BATCH - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!batch || batch.length === 0) break;
    allData = allData.concat(batch);
    if (batch.length < BATCH) break;
    from += BATCH;
  }

  // 3. Collect all unique run_hours (sorted desc)
  const runHoursSet = new Set<string>();
  for (const r of allData) runHoursSet.add(r.run_hour);
  const runHours = [...runHoursSet].sort((a, b) => b.localeCompare(a));

  // 4. Group by corridor
  const corridorMap = new Map<string, typeof allData>();
  for (const r of allData) {
    const key = `${r.receiving_country}||${r.delivery_method ?? 'Bank Deposit'}`;
    if (!corridorMap.has(key)) corridorMap.set(key, []);
    corridorMap.get(key)!.push(r);
  }

  // 5. Build summary per corridor
  const corridors = [];
  for (const [corridorKey, expectedOps] of Object.entries(OPERATOR_MAP)) {
    const records = corridorMap.get(corridorKey);
    if (!records || records.length === 0) continue;

    const [country, deliveryMethod] = corridorKey.split('||');

    // Per-corridor operator selection: configured or fallback to global
    const corridorSelected = corridorOpsConfig[corridorKey];
    const corridorTargetOps = (corridorSelected && corridorSelected.length > 0)
      ? ['GME', ...corridorSelected.filter(op => op !== 'GME')]
      : ['GME', ...globalOps.filter(op => expectedOps.includes(op) && op !== 'GME')];

    // Determine snapshot run_hour
    let snapshotRunHour: string;
    if (requestedRunHour) {
      const available = records.map(r => r.run_hour).filter(rh => rh <= requestedRunHour);
      snapshotRunHour = available.length > 0
        ? available.sort((a, b) => b.localeCompare(a))[0]
        : records.reduce((max, r) => r.run_hour > max ? r.run_hour : max, records[0].run_hour);
    } else {
      snapshotRunHour = records.reduce((max, r) => r.run_hour > max ? r.run_hour : max, records[0].run_hour);
    }

    // Get snapshot records at chosen run_hour
    const snapshotRecords = records.filter(r => r.run_hour === snapshotRunHour);

    // GME baseline
    const gmeRecord = snapshotRecords.find(r => r.operator === 'GME');
    const gmeBaseline = gmeRecord?.total_sending_amount ?? null;

    // Build operator snapshot data — only include operators selected for this corridor
    const operators = snapshotRecords
      .filter(r => corridorTargetOps.includes(r.operator) && expectedOps.includes(r.operator))
      .map(r => {
        const priceGap = r.operator !== 'GME' && gmeBaseline
          ? r.total_sending_amount - gmeBaseline : null;
        const status = r.operator === 'GME' ? 'GME'
          : priceGap === null ? 'Expensive than GME'
          : priceGap > 0 ? 'Expensive than GME' : 'Cheaper than GME';
        return {
          operator: r.operator,
          totalSendingAmount: r.total_sending_amount,
          sendAmountKRW: r.send_amount_krw,
          receiveAmount: r.receive_amount,
          serviceFee: r.service_fee ?? 0,
          priceGap,
          status,
        };
      })
      .sort((a, b) => b.totalSendingAmount - a.totalSendingAmount);

    if (operators.length === 0) continue;

    corridors.push({ country, deliveryMethod, latestRunHour: snapshotRunHour, gmeBaseline, operators });
  }

  corridors.sort((a, b) => a.country.localeCompare(b.country) || a.deliveryMethod.localeCompare(b.deliveryMethod));

  return NextResponse.json({ corridors, runHours });
}
