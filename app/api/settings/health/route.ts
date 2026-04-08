import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { OPERATOR_MAP } from '../../../lib/corridors';

export const dynamic = 'force-dynamic';

const EXPECTED_OPERATORS = OPERATOR_MAP;
const BATCH = 5000;

async function fetchBatched<T>(supabase: any, query: () => any): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data: batch, error } = await query().range(from, from + BATCH - 1);
    if (error) throw new Error(error.message);
    if (!batch || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get('days') ?? '7');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromDateStr = fromDate.toISOString().slice(0, 10);

  // Run all 4 queries in parallel
  const [allData, allFailureLogs, deletedRows, outlierRows] = await Promise.all([
    // 1. Rate records
    fetchBatched<{ run_hour: string; operator: string; receiving_country: string; delivery_method: string }>(
      supabase,
      () => supabase
        .from('rate_records')
        .select('run_hour, operator, receiving_country, delivery_method')
        .is('deleted_at', null)
        .gte('run_hour', fromDateStr)
        .order('run_hour', { ascending: false })
    ),
    // 2. Failure logs
    fetchBatched<{ run_hour: string; receiving_country: string; delivery_method: string; operator: string; reason: string; error_message: string | null }>(
      supabase,
      () => supabase
        .from('scraper_failure_log')
        .select('run_hour, receiving_country, delivery_method, operator, reason, error_message')
        .gte('created_at', fromDateStr)
        .order('created_at', { ascending: false })
    ),
    // 3. Deleted records
    supabase
      .from('rate_records')
      .select('run_hour, operator, receiving_country, delivery_method')
      .not('deleted_at', 'is', null)
      .gte('run_hour', fromDateStr)
      .order('run_hour', { ascending: false })
      .limit(200)
      .then(({ data }) => data ?? []),
    // 4. Outliers
    supabase
      .from('outlier_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => data ?? []),
  ]);

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

  // Sort inferred failures by run_hour descending
  recentFailures.sort((a, b) => b.runHour.localeCompare(a.runHour));

  // Build lookups of logged reasons — exact key and relaxed key (without delivery_method)
  const failureReasonMap = new Map<string, { reason: string; error_message: string | null }>();
  const failureReasonByOpMap = new Map<string, { reason: string; error_message: string | null }>();
  allFailureLogs.forEach(f => {
    failureReasonMap.set(`${f.run_hour}||${f.receiving_country}||${f.delivery_method}||${f.operator}`, { reason: f.reason, error_message: f.error_message });
    const relaxedKey = `${f.run_hour}||${f.receiving_country}||${f.operator}`;
    if (!failureReasonByOpMap.has(relaxedKey)) {
      failureReasonByOpMap.set(relaxedKey, { reason: f.reason, error_message: f.error_message });
    }
  });

  const deletedSet = new Set(
    deletedRows.map((r: any) => `${r.run_hour}||${r.receiving_country}||${r.delivery_method ?? 'Bank Deposit'}||${r.operator}`)
  );

  // Enrich recent failures with reasons
  const enrichedFailures = recentFailures.map(f => {
    const key = `${f.runHour}||${f.country}||${f.deliveryMethod}||${f.operator}`;
    const logged = failureReasonMap.get(key);
    if (logged) return { ...f, reason: logged.reason, errorMessage: logged.error_message };
    const relaxedKey = `${f.runHour}||${f.country}||${f.operator}`;
    const relaxed = failureReasonByOpMap.get(relaxedKey);
    if (relaxed) return { ...f, reason: relaxed.reason, errorMessage: relaxed.error_message };
    if (deletedSet.has(key)) return { ...f, reason: 'manually_deleted', errorMessage: null };
    return { ...f, reason: 'not_scraped', errorMessage: null };
  });

  const recentOutliers = outlierRows.map((o: any) => ({
    runHour: o.run_hour,
    country: o.receiving_country,
    operator: o.operator,
    deliveryMethod: o.delivery_method,
    scrapedValue: o.scraped_value,
    medianValue: o.median_value,
    deviationPct: o.deviation_pct,
  }));

  const lastRunHour = allData.length > 0 ? allData[0].run_hour : null;

  return NextResponse.json({
    days,
    totalRuns,
    lastRunHour,
    overallSuccessRate: totalExpected > 0 ? Math.round((totalSuccesses / totalExpected) * 100) : 0,
    corridors,
    recentFailures: enrichedFailures,
    recentOutliers,
  });
}
