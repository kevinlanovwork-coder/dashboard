'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from 'recharts';
import { CURRENCY_MAP } from '@/app/lib/corridors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OperatorSnapshot {
  operator: string;
  totalSendingAmount: number;
  sendAmountKRW: number;
  receiveAmount: number;
  serviceFee: number;
  priceGap: number | null;
  status: string;
}

interface CorridorSummary {
  country: string;
  deliveryMethod: string;
  latestRunHour: string;
  gmeBaseline: number | null;
  operators: OperatorSnapshot[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Schedule the next refresh at the next 15-minute wall-clock boundary + 60s grace
// so we land just after the new scrape has written its rows.
function msUntilNextRefresh() {
  const now = new Date();
  const next = new Date(now);
  const slot = (Math.floor(now.getMinutes() / 15) + 1) * 15;
  next.setMinutes(slot, 60, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

function useLiveRefresh(onTick: () => void, errored: boolean) {
  useEffect(() => {
    let cycleTimeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = errored ? 60_000 : msUntilNextRefresh();
      cycleTimeout = setTimeout(() => {
        onTick();
        schedule();
      }, ms);
    };
    schedule();
    return () => clearTimeout(cycleTimeout);
  }, [onTick, errored]);
}

function statusColor(status: string) {
  if (status === 'GME') return '#ef4444';
  if (status === 'Cheaper than GME') return '#22c55e';
  return '#f97316';
}

function formatRunHour(rh: string) {
  const m = rh.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return rh;
  return `${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
}

// ─── Corridor Card ───────────────────────────────────────────────────────────

const CorridorCard = memo(function CorridorCard({ corridor, isDark, isEn }: { corridor: CorridorSummary; isDark: boolean; isEn: boolean }) {
  const ct = {
    grid:     isDark ? '#1e293b' : '#e2e8f0',
    tick:     isDark ? '#64748b' : '#94a3b8',
    axisLine: isDark ? '#1e293b' : '#e2e8f0',
    yLabel:   isDark ? '#cbd5e1' : '#475569',
  };

  const isReceiveComparison = corridor.country === 'Russia' && corridor.deliveryMethod === 'Card Payment';
  const { operators, gmeBaseline } = corridor;
  const chartHeight = Math.max(120, operators.length * 40);

  // Build rate lookup for Y-axis labels
  const rateByOp = new Map<string, string>();
  for (const op of operators) {
    if (op.sendAmountKRW > 0) {
      const rate = op.receiveAmount / op.sendAmountKRW;
      const display = rate >= 1 ? rate.toFixed(2) : (op.sendAmountKRW / op.receiveAmount).toFixed(2);
      rateByOp.set(op.operator, display);
    }
  }

  // Domain: from 0 slightly left of min to slightly right of max
  const amounts = operators.map(o => o.totalSendingAmount).filter(Boolean);
  const minVal = Math.min(...amounts);
  const maxVal = Math.max(...amounts);
  const padding = (maxVal - minVal) * 0.15 || maxVal * 0.01;
  const domainMin = Math.max(0, minVal - padding);
  const domainMax = maxVal + padding;

  return (
    <div
      className={`block rounded-xl overflow-hidden ${isReceiveComparison ? 'bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60' : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800'}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {corridor.country} <span className="text-slate-400 font-normal">— {corridor.deliveryMethod}</span>
        </h3>
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
          {operators[0]?.receiveAmount?.toLocaleString()} {corridor.deliveryMethod.match(/\(([A-Z]{3})\)/)?.[1] ?? CURRENCY_MAP[corridor.country] ?? ''}
        </span>
      </div>

      {/* Chart */}
      <div className="px-1 py-2">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={operators}
            layout="vertical"
            margin={{ top: 0, right: 90, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={ct.grid} horizontal={false} />
            <XAxis
              type="number"
              domain={[domainMin, domainMax]}
              tickFormatter={isReceiveComparison
                ? (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 })
                : (v: number) => `${(v / 1000).toFixed(0)}K`}
              tick={{ fontSize: 10, fill: ct.tick }}
              axisLine={{ stroke: ct.axisLine }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="operator"
              width={130}
              interval={0}
              tick={({ x, y, payload }: any) => {
                const op = operators.find(o => o.operator === payload.value);
                const isGME = payload.value === 'GME';
                const name = isGME ? '★ GME' : payload.value;
                const gap = op?.priceGap ?? null;
                const gapColor = gap === null
                  ? null
                  : isReceiveComparison
                    ? gap > 0 ? '#16a34a' : '#f97316'
                    : gap > 0 ? '#f97316' : '#16a34a';
                const gapLabel = gap === null ? null : `${gap > 0 ? '+' : ''}${Math.round(gap).toLocaleString()}`;
                const showGap = !isGME && gapLabel !== null;
                return (
                  <text x={x - 4} y={y} textAnchor="end" fill={isGME ? '#ef4444' : ct.yLabel}>
                    <tspan dy={showGap ? -2 : 4} fontSize={11} fontWeight={isGME ? 700 : 500}>{name}</tspan>
                    {showGap && <tspan x={x - 4} dy={13} fontSize={9} fill={gapColor!}>({gapLabel})</tspan>}
                  </text>
                );
              }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }: any) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload as OperatorSnapshot;
                return (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-lg text-xs">
                    <p className="font-semibold mb-1">{d.operator}</p>
                    <p>{isReceiveComparison ? (isEn ? 'Receive' : '수령액') : (isEn ? 'Collection' : '합계')}: {d.totalSendingAmount.toLocaleString()} {isReceiveComparison ? 'RUB' : 'KRW'}</p>
                    {d.priceGap !== null && (
                      <p className={isReceiveComparison ? (d.priceGap > 0 ? 'text-green-500' : 'text-orange-500') : (d.priceGap > 0 ? 'text-orange-500' : 'text-green-500')}>
                        {isEn ? 'Gap' : '차이'}: {d.priceGap > 0 ? '+' : ''}{d.priceGap.toLocaleString()} {isReceiveComparison ? 'RUB' : 'KRW'}
                      </p>
                    )}
                  </div>
                );
              }}
              cursor={{ fill: 'rgba(148,163,184,0.08)' }}
            />
            {gmeBaseline && (
              <ReferenceLine
                x={gmeBaseline}
                stroke="#ef4444"
                strokeDasharray="4 3"
                strokeWidth={1.5}
              />
            )}
            <Bar dataKey="totalSendingAmount" radius={[0, 4, 4, 0]} barSize={20}>
              {operators.map((entry, idx) => (
                <Cell key={idx} fill={statusColor(entry.status)} />
              ))}
              <LabelList
                dataKey="totalSendingAmount"
                position="right"
                formatter={(v: any) => v ? Math.round(v).toLocaleString() : ''}
                style={{ fontSize: 10, fill: ct.yLabel, fontWeight: 500 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Rate legend */}
      <div className="px-4 pb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {operators.map(o => {
          const rate = rateByOp.get(o.operator);
          if (!rate) return null;
          const isGME = o.operator === 'GME';
          return (
            <span key={o.operator} className={isGME ? 'text-red-500 font-semibold' : 'text-slate-600 dark:text-slate-400'}>
              {isGME ? '★ GME' : o.operator}: <span className="font-mono">{rate}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
});

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SummaryDashboard() {
  const [isDark, setIsDark] = useState(false);
  const [isEn, setIsEn] = useState(true);
  const [corridors, setCorridors] = useState<CorridorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Inherit theme/lang from localStorage (set elsewhere in the app); not toggleable here.
  useEffect(() => {
    if (localStorage.getItem('dashboard-theme') === 'dark') setIsDark(true);
    if (localStorage.getItem('dashboard-lang') === 'ko') setIsEn(false);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/summary/rates?days=1');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.corridors) setCorridors(data.corridors);
      setFetchError(null);
      setLastFetchAt(Date.now());
    } catch (err) {
      console.error('Failed to fetch summary:', err);
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useLiveRefresh(fetchData, fetchError !== null);

  const lastFetchLabel = useMemo(() => {
    if (!lastFetchAt) return '';
    return new Date(lastFetchAt).toLocaleTimeString(isEn ? 'en-US' : 'ko-KR', { hour: '2-digit', minute: '2-digit' });
  }, [lastFetchAt, isEn]);

  // Latest scrape run-hour across all enabled corridors. If older than 30 min, the
  // scraper is likely stuck even though the API itself is reachable.
  const latestRunHour = useMemo(() => {
    if (corridors.length === 0) return null;
    return corridors.reduce((max, c) => c.latestRunHour > max ? c.latestRunHour : max, '');
  }, [corridors]);

  const STALE_THRESHOLD_MS = 30 * 60 * 1000;
  const isStale = useMemo(() => {
    if (!latestRunHour) return false;
    const ts = new Date(latestRunHour.replace(' ', 'T')).getTime();
    if (isNaN(ts)) return false;
    return Date.now() - ts > STALE_THRESHOLD_MS;
  }, [latestRunHour, lastFetchAt, STALE_THRESHOLD_MS]);

  const latestScrapeLabel = useMemo(() => latestRunHour ? formatRunHour(latestRunHour) : '', [latestRunHour]);

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">

        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img src="/GME_swirl_icon.png" alt="GME" className="h-7 shrink-0" />
              <h1 className="text-base font-bold tracking-tight">{isEn ? "GME's Competitors Live Rate" : 'GME 경쟁사 실시간 환율'}</h1>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs ${
              fetchError
                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60'
                : isStale
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                  : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}>
              <span className={`inline-block w-2 h-2 rounded-full ${
                fetchError ? 'bg-red-500' : isStale ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
              }`} />
              {fetchError ? (
                <span>
                  {isEn ? 'Connection issue' : '연결 오류'}
                  {lastFetchLabel && ` · ${isEn ? 'last' : '마지막'} ${lastFetchLabel}`}
                </span>
              ) : isStale ? (
                <span>
                  {isEn ? 'Stale data' : '데이터 지연'}
                  {latestScrapeLabel && ` · ${isEn ? 'last scrape' : '마지막 스크랩'} ${latestScrapeLabel}`}
                </span>
              ) : (
                <span>
                  {isEn ? 'Live' : '실시간'}
                  {lastFetchLabel && ` · ${lastFetchLabel}`}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
          {loading ? (
            <div className="text-center py-20 text-slate-400">{isEn ? 'Loading...' : '로딩 중...'}</div>
          ) : corridors.length === 0 ? (
            <div className="text-center py-20 text-slate-400 text-sm">
              <p className="mb-2">{isEn ? 'No corridors enabled.' : '활성화된 경로가 없습니다.'}</p>
              <a href="/settings?tab=summary" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 text-xs hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                {isEn ? 'Pick up to 9 in Settings → Summary Setup →' : '설정 → 요약 설정에서 최대 9개 선택 →'}
              </a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {corridors.map(c => (
                  <CorridorCard
                    key={`${c.country}||${c.deliveryMethod}`}
                    corridor={c}
                    isDark={isDark}
                    isEn={isEn}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
