import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Expected operators per corridor||delivery_method
const EXPECTED_OPERATORS: Record<string, string[]> = {
  'Indonesia||Bank Deposit':   ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'Utransfer', 'SBI', 'Cross', 'Coinshot', 'JRF', 'E9Pay'],
  'Thailand||Bank Deposit':    ['GME', 'GMoneyTrans', 'WireBarley', 'Sentbe', 'Hanpass', 'SBI', 'Cross', 'Coinshot', 'JRF', 'E9Pay'],
  'Vietnam||Bank Deposit':     ['GME', 'Sentbe', 'SBI', 'GMoneyTrans', 'E9Pay', 'Hanpass', 'Cross', 'JRF'],
  'Nepal||Bank Deposit':       ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'JRF', 'E9Pay', 'Coinshot'],
  'Philippines||Bank Deposit': ['GME', 'GMoneyTrans', 'SBI', 'Coinshot', 'Cross', 'E9Pay', 'JRF', 'Utransfer', 'Hanpass'],
  'Cambodia||Bank Deposit':    ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'SBI', 'E9Pay'],
  'China||Alipay':             ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'SBI', 'Cross', 'WireBarley', 'Coinshot', 'E9Pay', 'Utransfer', 'Moin', 'Debunk'],
  'Mongolia||Bank Deposit':    ['GME', 'GMoneyTrans', 'Utransfer', 'Cross', 'E9Pay', 'Coinshot', 'Hanpass'],
  'Myanmar||Bank Deposit':     ['GME', 'GMoneyTrans', 'Hanpass', 'SBI', 'E9Pay'],
  'Pakistan||Bank Deposit':    ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'JRF'],
  'Laos||Bank Deposit':        ['GME', 'GMoneyTrans', 'E9Pay', 'Hanpass'],
  'Sri Lanka||Bank Deposit':   ['GME', 'Sentbe', 'E9Pay', 'GMoneyTrans', 'Coinshot', 'JRF', 'Hanpass'],
  'India||Bank Deposit':       ['WireBarley', 'Sentbe', 'GMoneyTrans', 'GME', 'Hanpass'],
};

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get('days') ?? '7');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromDateStr = fromDate.toISOString().slice(0, 10);

  // Fetch all records in batches
  const BATCH = 1000;
  let allData: { run_hour: string; operator: string; receiving_country: string; delivery_method: string }[] = [];
  let from = 0;
  while (true) {
    const { data: batch, error } = await supabase
      .from('rate_records')
      .select('run_hour, operator, receiving_country, delivery_method')
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

  // Build a set of "run_hour||country||delivery_method||operator" that exist
  const existingSet = new Set<string>();
  const runHoursByCorridorMap: Record<string, Set<string>> = {};

  for (const r of allData) {
    const dm = r.delivery_method ?? 'Bank Deposit';
    existingSet.add(`${r.run_hour}||${r.receiving_country}||${dm}||${r.operator}`);
    const corridorKey = `${r.receiving_country}||${dm}`;
    if (!runHoursByCorridorMap[corridorKey]) runHoursByCorridorMap[corridorKey] = new Set();
    runHoursByCorridorMap[corridorKey].add(r.run_hour);
  }

  // Calculate per-corridor, per-operator stats
  const corridors: {
    country: string;
    deliveryMethod: string;
    totalRuns: number;
    operators: {
      operator: string;
      successes: number;
      failures: number;
      successRate: number;
      lastSuccess: string | null;
      lastFailure: string | null;
    }[];
  }[] = [];

  let totalRuns = 0;
  let totalSuccesses = 0;
  let totalExpected = 0;
  const recentFailures: { runHour: string; country: string; operator: string; deliveryMethod: string }[] = [];

  for (const [corridorKey, expectedOps] of Object.entries(EXPECTED_OPERATORS)) {
    const [country, dm] = corridorKey.split('||');
    const runHours = runHoursByCorridorMap[corridorKey];
    if (!runHours || runHours.size === 0) continue;

    const sortedRunHours = [...runHours].sort();
    const runCount = sortedRunHours.length;
    totalRuns = Math.max(totalRuns, runCount);

    const operatorStats = expectedOps.map(op => {
      let successes = 0;
      let lastSuccess: string | null = null;
      let lastFailure: string | null = null;

      for (const rh of sortedRunHours) {
        const key = `${rh}||${country}||${dm}||${op}`;
        if (existingSet.has(key)) {
          successes++;
          lastSuccess = rh;
        } else {
          lastFailure = rh;
          recentFailures.push({ runHour: rh, country, operator: op, deliveryMethod: dm });
        }
      }

      const failures = runCount - successes;
      totalSuccesses += successes;
      totalExpected += runCount;

      return {
        operator: op,
        successes,
        failures,
        successRate: runCount > 0 ? Math.round((successes / runCount) * 100) : 0,
        lastSuccess,
        lastFailure,
      };
    });

    corridors.push({
      country,
      deliveryMethod: dm,
      totalRuns: runCount,
      operators: operatorStats,
    });
  }

  // Sort recent failures by run_hour descending, take last 30
  recentFailures.sort((a, b) => b.runHour.localeCompare(a.runHour));

  return NextResponse.json({
    days,
    totalRuns,
    overallSuccessRate: totalExpected > 0 ? Math.round((totalSuccesses / totalExpected) * 100) : 0,
    corridors,
    recentFailures: recentFailures.slice(0, 30),
  });
}
