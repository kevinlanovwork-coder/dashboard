// Pure compute helpers for the GME Competitive Position analysis.
// Used by:
// - Main dashboard (the Position card chart trend)
// - /report page (per-corridor weekly tables)
//
// All inputs are RateRecord[] from /api/rates; outputs are display-agnostic
// (no translation strings, no colors). UI layer maps to labels/colors itself.

import type { RateRecord } from './parseRates';

// ─── Types ──────────────────────────────────────────────────────────────────

export type Position = 'Low' | 'Medium' | 'High';

export interface RankPoint {
  runHour: string;
  rank: number;       // GME's 1-indexed rank, ASC by total (1 = cheapest)
  total: number;      // operators in the snapshot (>= 1)
}

export interface DailyPosition {
  day: string;
  avgRank: number;    // mean rank across the day's snapshots (ASC convention)
  total: number;      // operator count for the day (last seen)
  points: number;     // how many runHours contributed
  position: Position;
  extreme?: 'best' | 'worst';
}

export interface RepresentativeSnapshot {
  runHour: string;
  gmeRank: number;
  total: number;
  records: RateRecord[];
}

export interface CompetitorEntry {
  avgRank: number;
  total: number;
  position: Position;
}

// ─── Bucket math ────────────────────────────────────────────────────────────

export function bucketPosition(avgRank: number, total: number): Position {
  const ratio = total > 0 ? avgRank / total : 1;
  return ratio <= 1 / 3 ? 'Low' : ratio <= 2 / 3 ? 'Medium' : 'High';
}

export function positionColor(p: Position): string {
  return p === 'Low' ? '#16a34a' : p === 'Medium' ? '#d97706' : '#dc2626';
}

// Flip the displayed rank: rank 1 = most expensive, rank N = cheapest.
// Compute is done with ASC ranks internally (1 = cheapest); flipRank converts
// for display only.
export function flipRank(origAvg: number, total: number): number {
  return total > 0 ? total - origAvg + 1 : origAvg;
}

// ─── Per‑hour ranks (GME) ───────────────────────────────────────────────────

export function computeGmeRankData(records: RateRecord[]): RankPoint[] {
  const runHourMap = new Map<string, { operator: string; total: number }[]>();
  for (const r of records) {
    if (r.totalSendingAmount <= 0) continue;
    if (!runHourMap.has(r.runHour)) runHourMap.set(r.runHour, []);
    runHourMap.get(r.runHour)!.push({ operator: r.operator, total: r.totalSendingAmount });
  }
  const result: RankPoint[] = [];
  for (const [runHour, ops] of runHourMap) {
    ops.sort((a, b) => a.total - b.total);
    const gmeIdx = ops.findIndex(o => o.operator === 'GME');
    if (gmeIdx === -1) continue;
    result.push({ runHour, rank: gmeIdx + 1, total: ops.length });
  }
  return result.sort((a, b) => a.runHour.localeCompare(b.runHour));
}

// Filter rank points by an inclusive date range [from, to] (YYYY‑MM‑DD).
// Either bound may be empty to skip that side.
export function filterRankByDateRange(rankData: RankPoint[], from: string, to: string): RankPoint[] {
  return rankData.filter(d => {
    if (from && d.runHour < from) return false;
    if (to && d.runHour > to + 'T23:59') return false;
    return true;
  });
}

// ─── Daily aggregation ──────────────────────────────────────────────────────

export function computeDailyPositions(rankPoints: RankPoint[]): DailyPosition[] {
  const byDay = new Map<string, { ranks: number[]; total: number }>();
  for (const d of rankPoints) {
    const day = d.runHour.slice(0, 10);
    const entry = byDay.get(day) ?? { ranks: [], total: d.total };
    entry.ranks.push(d.rank);
    entry.total = d.total;
    byDay.set(day, entry);
  }
  const days: DailyPosition[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, { ranks, total }]) => {
      const avg = ranks.reduce((s, r) => s + r, 0) / ranks.length;
      return {
        day,
        avgRank: avg,
        total,
        points: ranks.length,
        position: bucketPosition(avg, total),
      };
    });
  if (days.length > 1) {
    const min = Math.min(...days.map(d => d.avgRank));
    const max = Math.max(...days.map(d => d.avgRank));
    if (min !== max) {
      const bestIdx = days.findIndex(d => d.avgRank === min);
      const worstIdx = days.findIndex(d => d.avgRank === max);
      days[bestIdx].extreme = 'best';
      if (worstIdx !== bestIdx) days[worstIdx].extreme = 'worst';
    }
  }
  return days;
}

// Mode (most common value) operator count from the daily positions; used in the
// Report header "(N Operators)".
export function operatorCountMode(daily: DailyPosition[], fallback: number): number {
  if (!daily.length) return fallback;
  const counts = new Map<number, number>();
  for (const d of daily) counts.set(d.total, (counts.get(d.total) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ─── Representative snapshot ────────────────────────────────────────────────

export function computeRepresentativeSnapshot(
  rankPoints: RankPoint[],
  records: RateRecord[],
): RepresentativeSnapshot | null {
  if (rankPoints.length === 0) return null;
  const avgAll = rankPoints.reduce((s, d) => s + d.rank, 0) / rankPoints.length;
  let best: { point: RankPoint; dist: number } | null = null;
  for (const d of rankPoints) {
    const dist = Math.abs(d.rank - avgAll);
    if (!best || dist < best.dist || (dist === best.dist && d.runHour > best.point.runHour)) {
      best = { point: d, dist };
    }
  }
  if (!best) return null;
  const snapshotRecords = records
    .filter(r => r.runHour === best!.point.runHour && r.totalSendingAmount > 0)
    .slice()
    .sort((a, b) => a.totalSendingAmount - b.totalSendingAmount);
  return {
    runHour: best.point.runHour,
    gmeRank: best.point.rank,
    total: best.point.total,
    records: snapshotRecords,
  };
}

// ─── Competitor positions (per‑day + overall) ──────────────────────────────

// Returns: ranksByOp[op] = Map<day, { ranks, total }>
function indexCompetitorRanks(
  records: RateRecord[],
  operators: string[],
  from: string,
  to: string,
): Record<string, Map<string, { ranks: number[]; total: number }>> {
  const ranksByOp: Record<string, Map<string, { ranks: number[]; total: number }>> = {};
  for (const op of operators) ranksByOp[op] = new Map();
  if (operators.length === 0) return ranksByOp;

  const byHour = new Map<string, { operator: string; total: number }[]>();
  for (const r of records) {
    if (r.totalSendingAmount <= 0) continue;
    if (from && r.runHour < from) continue;
    if (to && r.runHour > to + 'T23:59') continue;
    if (!byHour.has(r.runHour)) byHour.set(r.runHour, []);
    byHour.get(r.runHour)!.push({ operator: r.operator, total: r.totalSendingAmount });
  }
  for (const [runHour, ops] of byHour) {
    ops.sort((a, b) => a.total - b.total);
    const day = runHour.slice(0, 10);
    for (const op of operators) {
      const idx = ops.findIndex(o => o.operator === op);
      if (idx === -1) continue;
      const m = ranksByOp[op];
      const e = m.get(day) ?? { ranks: [], total: ops.length };
      e.ranks.push(idx + 1);
      e.total = ops.length;
      m.set(day, e);
    }
  }
  return ranksByOp;
}

export function computeCompetitorPositions(
  records: RateRecord[],
  operators: string[],
  from = '',
  to = '',
) {
  const ranksByOp = indexCompetitorRanks(records, operators, from, to);

  const dayPos = (op: string, day: string): CompetitorEntry | null => {
    const e = ranksByOp[op]?.get(day);
    if (!e || e.ranks.length === 0) return null;
    const avgRank = e.ranks.reduce((s, r) => s + r, 0) / e.ranks.length;
    return { avgRank, total: e.total, position: bucketPosition(avgRank, e.total) };
  };

  const overallPos = (op: string): CompetitorEntry | null => {
    const m = ranksByOp[op];
    if (!m) return null;
    let total = 0;
    const all: number[] = [];
    for (const { ranks, total: t } of m.values()) { all.push(...ranks); total = t; }
    if (all.length === 0) return null;
    const avgRank = all.reduce((s, r) => s + r, 0) / all.length;
    return { avgRank, total, position: bucketPosition(avgRank, total) };
  };

  return { dayPos, overallPos };
}
