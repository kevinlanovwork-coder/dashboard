'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from 'recharts';

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

const CURRENCY_MAP: Record<string, string> = {
  Indonesia: 'IDR', Thailand: 'THB', Vietnam: 'VND', Nepal: 'NPR',
  Philippines: 'PHP', Malaysia: 'MYR', Singapore: 'SGD', Cambodia: 'USD',
  Japan: 'JPY', China: 'CNY', Mongolia: 'MNT', Myanmar: 'MMK',
  Pakistan: 'PKR', Laos: 'LAK', 'Sri Lanka': 'LKR', India: 'INR',
  'Timor Leste': 'USD', Uzbekistan: 'USD', Bangladesh: 'BDT', Russia: 'RUB', Kazakhstan: 'USD', Kyrgyzstan: 'USD',
};

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

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  );
}

// ─── Corridor Card ───────────────────────────────────────────────────────────

function CorridorCard({ corridor, isDark, isEn }: { corridor: CorridorSummary; isDark: boolean; isEn: boolean }) {
  const ct = {
    grid:     isDark ? '#1e293b' : '#e2e8f0',
    tick:     isDark ? '#64748b' : '#94a3b8',
    axisLine: isDark ? '#1e293b' : '#e2e8f0',
    yLabel:   isDark ? '#cbd5e1' : '#475569',
  };

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
    <a
      href={`/?country=${encodeURIComponent(corridor.country)}`}
      className="block bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg transition-all cursor-pointer"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {corridor.country} <span className="text-slate-400 font-normal">— {corridor.deliveryMethod}</span>
        </h3>
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
          {operators[0]?.receiveAmount?.toLocaleString()} {CURRENCY_MAP[corridor.country] ?? ''}
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
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
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
                const isGME = payload.value === 'GME';
                const name = isGME ? '★ GME' : payload.value;
                const rate = rateByOp.get(payload.value);
                return (
                  <text x={x - 4} y={y} textAnchor="end" fill={isGME ? '#ef4444' : ct.yLabel}>
                    <tspan dy={rate ? -2 : 4} fontSize={11} fontWeight={isGME ? 700 : 500}>{name}</tspan>
                    {rate && <tspan x={x - 4} dy={13} fontSize={9} fill={ct.tick}>({rate})</tspan>}
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
                    <p>{isEn ? 'Collection' : '합계'}: {d.totalSendingAmount.toLocaleString()} KRW</p>
                    {d.priceGap !== null && (
                      <p className={d.priceGap > 0 ? 'text-orange-500' : 'text-green-500'}>
                        {isEn ? 'Gap' : '차이'}: {d.priceGap > 0 ? '+' : ''}{d.priceGap.toLocaleString()} KRW
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

      {/* Gap legend */}
      <div className="px-4 pb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {operators.filter(o => o.priceGap !== null).map(o => (
          <span key={o.operator} className={o.priceGap! > 0 ? 'text-orange-500' : 'text-green-600 dark:text-green-400'}>
            {o.operator}: {o.priceGap! > 0 ? '+' : ''}{Math.round(o.priceGap!).toLocaleString()}
          </span>
        ))}
      </div>
    </a>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SummaryDashboard() {
  const [isDark, setIsDark] = useState(false);
  const [isEn, setIsEn] = useState(true);
  const [corridors, setCorridors] = useState<CorridorSummary[]>([]);
  const [allRunHours, setAllRunHours] = useState<string[]>([]);
  const [snapshotDate, setSnapshotDate] = useState('');
  const [snapshotTime, setSnapshotTime] = useState('');
  const [loading, setLoading] = useState(true);

  // Persist theme/lang
  useEffect(() => {
    const theme = localStorage.getItem('dashboard-theme');
    if (theme === 'dark') setIsDark(true);
    const lang = localStorage.getItem('dashboard-lang');
    if (lang === 'ko') setIsEn(false);
  }, []);
  useEffect(() => { localStorage.setItem('dashboard-theme', isDark ? 'dark' : 'light'); }, [isDark]);
  useEffect(() => { localStorage.setItem('dashboard-lang', isEn ? 'en' : 'ko'); }, [isEn]);

  // Derive date/time options from runHours
  const snapshotDates = useMemo(() => {
    const dates = [...new Set(allRunHours.map(rh => rh.slice(0, 10)))];
    return dates.sort((a, b) => b.localeCompare(a));
  }, [allRunHours]);

  const snapshotTimes = useMemo(() => {
    if (snapshotDate === 'all') return allRunHours;
    return allRunHours.filter(rh => rh.startsWith(snapshotDate));
  }, [allRunHours, snapshotDate]);

  // Auto-select latest date/time when data first loads
  useEffect(() => {
    if (allRunHours.length > 0 && snapshotDate === '' && snapshotTime === '') {
      const latestRh = allRunHours[0];
      setSnapshotDate(latestRh.slice(0, 10));
      setSnapshotTime(latestRh);
    }
  }, [allRunHours, snapshotDate, snapshotTime]);

  // Compute target run_hour from selections
  const targetRunHour = useMemo(() => {
    if (snapshotTime) return snapshotTime;
    if (snapshotDate) {
      const timesForDate = allRunHours.filter(rh => rh.startsWith(snapshotDate));
      return timesForDate.length > 0 ? timesForDate[0] : '';
    }
    return '';
  }, [snapshotDate, snapshotTime, allRunHours]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: '3' });
      if (targetRunHour) params.set('runHour', targetRunHour);
      const res = await fetch(`/api/summary/rates?${params}`);
      const data = await res.json();
      if (data?.corridors) setCorridors(data.corridors);
      if (data?.runHours) setAllRunHours(data.runHours);
    } catch (err) { console.error('Failed to fetch summary:', err); }
    finally { setLoading(false); }
  }, [targetRunHour]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">

        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img src="/GME_swirl_icon.png" alt="GME" className="h-8 shrink-0" />
              <div>
                <h1 className="text-lg font-bold tracking-tight">{isEn ? "GME's Competitors - All Corridors Summary" : 'GME 경쟁사 - 전체 경로 요약'}</h1>
                <p className="text-slate-500 text-xs mt-0.5">{isEn ? 'Snapshot comparison across all corridors' : '전체 경로 스냅샷 비교'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Language toggle */}
              <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden text-sm">
                <button onClick={() => setIsEn(true)} className={`px-3 py-1.5 transition-colors ${isEn ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>EN</button>
                <button onClick={() => setIsEn(false)} className={`px-3 py-1.5 transition-colors ${!isEn ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>한국어</button>
              </div>

              {/* Dark / Light toggle */}
              <button
                onClick={() => setIsDark(d => !d)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
                {isDark ? 'Light' : 'Dark'}
              </button>

              {/* Nav links */}
              <a href="/" className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {isEn ? 'Home' : '홈'}
              </a>
              <a href="/settings" className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                {isEn ? 'Settings' : '설정'}
              </a>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
          {loading ? (
            <div className="text-center py-20 text-slate-400">{isEn ? 'Loading...' : '로딩 중...'}</div>
          ) : corridors.length === 0 ? (
            <div className="text-center py-20 text-slate-400">{isEn ? 'No data available.' : '데이터가 없습니다.'}</div>
          ) : (
            <>
              {/* Snapshot Date/Time filter */}
              <div className="flex items-end gap-4 flex-wrap mb-4">
                <div>
                  <span className="block text-xs text-slate-500 mb-1">{isEn ? 'Snapshot Date' : '스냅샷 날짜'}</span>
                  <select
                    value={snapshotDate}
                    onChange={e => {
                      const newDate = e.target.value;
                      setSnapshotDate(newDate);
                      const timesForDate = allRunHours.filter(rh => rh.startsWith(newDate));
                      setSnapshotTime(timesForDate.length > 0 ? timesForDate[0] : '');
                    }}
                    className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm"
                  >
                    {snapshotDates.map(d => (
                      <option key={d} value={d}>{d.replace(/-/g, '/')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="block text-xs text-slate-500 mb-1">{isEn ? 'Snapshot Time' : '스냅샷 시간'}</span>
                  <select
                    value={snapshotTime}
                    onChange={e => setSnapshotTime(e.target.value)}
                    className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm"
                  >
                    {snapshotTimes.map(rh => (
                      <option key={rh} value={rh}>{rh.split(' ')[1] ?? rh}</option>
                    ))}
                  </select>
                </div>
              </div>
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
