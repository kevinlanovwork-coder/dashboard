'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from 'recharts';
import type { RateRecord } from '@/app/lib/parseRates';

// ─── Translations ─────────────────────────────────────────────────────────────

const EN = {
  title: 'Exchange Rate Comparison Dashboard',
  subtitle: 'Remittance Service Rate Competitiveness Analysis',
  allCountries: 'All Countries',
  latestSnapshot: 'Latest Snapshot',
  totalDataPoints: 'Total Data Points',
  timeSlots: (n: number) => `${n} time slots`,
  trackedOperators: 'Tracked Operators',
  services: 'services',
  latestGMEBaseline: 'Latest GME Baseline',
  cheaperCompetitors: 'Cheaper Competitors',
  basedOnSnapshot: 'Based on snapshot',
  expensiveCompetitors: 'More Expensive Competitors',
  pricierThanGME: 'Services pricier than GME',
  snapshotTitle: 'Snapshot Comparison — Total Send Amount',
  snapshotSub: (time: string) => `as of ${time} (KRW, lower is better)`,
  noData: 'No data',
  gmeBaselineLegend: 'GME (baseline)',
  moreExpensiveLegend: 'More expensive than GME',
  cheaperLegend: 'Cheaper than GME',
  avgDiffTitle: 'Avg. Price Difference by Operator',
  avgDiffSub: (date: string) => `Daily avg. for ${date} (vs GME, KRW)`,
  gmeWins: 'More expensive than GME (GME wins)',
  gmeLoses: 'Cheaper than GME (GME loses)',
  trendTitle: 'GME Baseline Trend',
  trendSub: 'GME total send amount over time (KRW)',
  insufficientData: 'Insufficient data',
  detailedData: 'Detailed Data',
  records: (n: number) => `${n.toLocaleString()} records`,
  searchOperator: 'Search operator...',
  allStatus: 'All Status',
  tableHeaders: ['Time', 'Operator', 'Country', 'Recv. Amount', 'Send Amt (KRW)', 'Fee', 'Total Send', 'GME Baseline', 'Diff', 'Rate', 'Status'],
  rightAlignHeaders: ['Recv. Amount', 'Send Amt (KRW)', 'Fee', 'Total Send', 'GME Baseline', 'Diff', 'Rate'],
  pagination: (start: number, end: number, total: number) =>
    `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`,
  prev: 'Prev',
  next: 'Next',
  totalSendLabel: 'Total send:',
  vsGME: 'vs GME:',
  avgDiffLabel: 'Avg. diff:',
  dataPoints: (n: number) => `Data points: ${n}`,
  lightModeTitle: 'Switch to Light Mode',
  darkModeTitle: 'Switch to Dark Mode',
  light: 'Light',
  dark: 'Dark',
  statusGME: 'GME',
  statusCheaper: 'Cheaper',
  statusExpensive: 'More Expensive',
  won: ' KRW',
};

const KO = {
  title: '환율 비교 대시보드',
  subtitle: '해외 송금 서비스 요율 경쟁력 분석',
  allCountries: '전체 국가',
  latestSnapshot: '최신 스냅샷',
  totalDataPoints: '총 데이터 포인트',
  timeSlots: (n: number) => `${n}개 시간대`,
  trackedOperators: '추적 운영사',
  services: '서비스',
  latestGMEBaseline: '최신 GME 기준가',
  cheaperCompetitors: '더 저렴한 경쟁사',
  basedOnSnapshot: '스냅샷 기준',
  expensiveCompetitors: 'GME 우위 경쟁사',
  pricierThanGME: 'GME보다 비싼 서비스',
  snapshotTitle: '스냅샷 비교 — 총 송금액',
  snapshotSub: (time: string) => `${time} 기준 (KRW, 낮을수록 유리)`,
  noData: '데이터 없음',
  gmeBaselineLegend: 'GME (기준)',
  moreExpensiveLegend: 'GME보다 비쌈',
  cheaperLegend: 'GME보다 저렴',
  avgDiffTitle: '운영사별 평균 가격 차이',
  avgDiffSub: (date: string) => `${date} 일별 평균 (GME 기준, KRW)`,
  gmeWins: 'GME보다 비쌈 (GME 유리)',
  gmeLoses: 'GME보다 저렴 (GME 불리)',
  trendTitle: 'GME 기준가 추이',
  trendSub: '시간에 따른 GME 총 송금액 변화 (KRW)',
  insufficientData: '데이터 부족',
  detailedData: '상세 데이터',
  records: (n: number) => `${n.toLocaleString()}건`,
  searchOperator: '운영사 검색...',
  allStatus: '전체 상태',
  tableHeaders: ['시간대', '운영사', '국가', '수령액', '송금액 (KRW)', '수수료', '총 송금액', 'GME 기준가', '차이', '환율', '상태'],
  rightAlignHeaders: ['수령액', '송금액 (KRW)', '수수료', '총 송금액', 'GME 기준가', '차이', '환율'],
  pagination: (start: number, end: number, total: number) =>
    `${start.toLocaleString()}–${end.toLocaleString()} / ${total.toLocaleString()}건`,
  prev: '이전',
  next: '다음',
  totalSendLabel: '총 송금액:',
  vsGME: 'GME 대비:',
  avgDiffLabel: '평균 차이:',
  dataPoints: (n: number) => `데이터 수: ${n}건`,
  lightModeTitle: '라이트 모드로 전환',
  darkModeTitle: '다크 모드로 전환',
  light: 'Light',
  dark: 'Dark',
  statusGME: 'GME',
  statusCheaper: '더 저렴',
  statusExpensive: '더 비쌈',
  won: '원',
};

type T = typeof EN;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(value: number, t: T) {
  return value.toLocaleString('ko-KR') + t.won;
}

function formatRunHour(runHour: string) {
  const m = runHour.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return runHour;
  return `${parseInt(m[2])}/${parseInt(m[3])} ${m[4]}:00`;
}

function statusLabel(status: string, t: T) {
  if (status === 'GME') return t.statusGME;
  if (status === 'Cheaper than GME') return t.statusCheaper;
  if (status === 'Expensive than GME') return t.statusExpensive;
  return status;
}

function statusColor(status: string) {
  if (status === 'GME') return { bg: 'bg-blue-500/20', text: 'text-blue-500 dark:text-blue-400', hex: '#3b82f6' };
  if (status === 'Cheaper than GME') return { bg: 'bg-green-500/20', text: 'text-green-600 dark:text-green-400', hex: '#22c55e' };
  return { bg: 'bg-red-500/20', text: 'text-red-500 dark:text-red-400', hex: '#ef4444' };
}

const CURRENCY_MAP: Record<string, string> = {
  Indonesia: 'IDR', Thailand: 'THB', Vietnam: 'VND', Philippines: 'PHP',
  Nepal: 'NPR', Malaysia: 'MYR', Singapore: 'SGD', Cambodia: 'USD',
  Japan: 'JPY', China: 'CNY', Mongolia: 'MNT',
};

// ─── Icons ────────────────────────────────────────────────────────────────────

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

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({
  title, value, sub, color = 'text-slate-900 dark:text-slate-100',
}: { title: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">{title}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

function SnapshotTooltip({ active, payload, t }: { active?: boolean; payload?: readonly { payload: RateRecord }[]; t: T }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const sc = statusColor(d.status);
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{d.operator}</p>
      <p className="text-slate-600 dark:text-slate-300">{t.totalSendLabel} <span className="font-mono">{formatKRW(d.totalSendingAmount, t)}</span></p>
      {d.priceGap !== null && d.status !== 'GME' && (
        <p className={d.priceGap < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
          {t.vsGME} <span className="font-mono">{d.priceGap > 0 ? '+' : ''}{d.priceGap.toLocaleString('ko-KR')}{t.won}</span>
        </p>
      )}
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs mt-1.5 ${sc.bg} ${sc.text}`}>
        {statusLabel(d.status, t)}
      </span>
    </div>
  );
}

function GapTooltip({ active, payload, t }: { active?: boolean; payload?: readonly { payload: { operator: string; avgGap: number; count: number } }[]; t: T }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{d.operator}</p>
      <p className={d.avgGap < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
        {t.avgDiffLabel} <span className="font-mono">{d.avgGap > 0 ? '+' : ''}{d.avgGap.toLocaleString('ko-KR')}{t.won}</span>
      </p>
      <p className="text-slate-400 dark:text-slate-400 text-xs mt-1">{t.dataPoints(d.count)}</p>
    </div>
  );
}

function TrendTooltip({ active, payload, label, t }: { active?: boolean; payload?: readonly { value: number }[]; label?: string | number; t: T }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">{label}</p>
      <p className="font-semibold text-blue-600 dark:text-blue-400 font-mono">{formatKRW(payload[0].value, t)}</p>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard({ records }: { records: RateRecord[] }) {
  const [isDark, setIsDark] = useState(false);
  const [isEn, setIsEn] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState('Indonesia');
  const [selectedRunHour, setSelectedRunHour] = useState('all');
  const [tableSearch, setTableSearch] = useState('');
  const [tableStatus, setTableStatus] = useState('all');
  const [tablePage, setTablePage] = useState(0);
  const [snapshotSortDesc, setSnapshotSortDesc] = useState(true);
  const [avgDate, setAvgDate] = useState('');
  const PAGE_SIZE = 20;

  const t = isEn ? EN : KO;

  // Persist theme preference
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-theme');
    if (saved === 'dark') setIsDark(true);
  }, []);
  useEffect(() => {
    localStorage.setItem('dashboard-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Persist language preference
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-lang');
    if (saved === 'ko') setIsEn(false);
  }, []);
  useEffect(() => {
    localStorage.setItem('dashboard-lang', isEn ? 'en' : 'ko');
  }, [isEn]);

  const ct = {
    grid:     isDark ? '#1e293b' : '#e2e8f0',
    tick:     isDark ? '#64748b' : '#94a3b8',
    axisLine: isDark ? '#1e293b' : '#e2e8f0',
    yLabel:   isDark ? '#cbd5e1' : '#475569',
    refLine:  isDark ? '#334155' : '#cbd5e1',
  };

  const countries = useMemo(
    () => [...new Set(records.map(r => r.receivingCountry))].sort(),
    [records]
  );

  const byCountry = useMemo(
    () => records.filter(r => r.receivingCountry === selectedCountry),
    [records, selectedCountry]
  );

  const runHours = useMemo(
    () => [...new Set(byCountry.map(r => r.runHour))].sort(),
    [byCountry]
  );

  const latestRunHour = useMemo(() => {
    const withGME = runHours.filter(rh =>
      byCountry.some(r => r.runHour === rh && r.status === 'GME')
    );
    return withGME[withGME.length - 1] ?? runHours[runHours.length - 1] ?? '';
  }, [byCountry, runHours]);

  const targetRunHour = selectedRunHour === 'all' ? latestRunHour : selectedRunHour;

  const snapshot = useMemo(
    () => byCountry
      .filter(r => r.runHour === targetRunHour)
      .sort((a, b) => snapshotSortDesc
        ? b.totalSendingAmount - a.totalSendingAmount
        : a.totalSendingAmount - b.totalSendingAmount),
    [byCountry, targetRunHour, snapshotSortDesc]
  );

  const snapshotGMEBaseline = useMemo(
    () => snapshot.find(r => r.status === 'GME')?.totalSendingAmount ?? null,
    [snapshot]
  );

  const snapshotChartData = useMemo(
    () => snapshot.map(r => ({
      ...r,
      displayRate: r.sendAmountKRW > 0
        ? parseFloat((r.receiveAmount / r.sendAmountKRW).toFixed(2))
        : null,
    })),
    [snapshot]
  );

  const avgDates = useMemo(
    () => [...new Set(byCountry.map(r => r.runHour.slice(0, 10)))].sort(),
    [byCountry]
  );

  const effectiveAvgDate = avgDate && avgDates.includes(avgDate)
    ? avgDate
    : avgDates[avgDates.length - 1] ?? '';

  const operatorStats = useMemo(() => {
    const map: Record<string, { gaps: number[]; count: number }> = {};
    byCountry
      .filter(r =>
        r.status !== 'GME' &&
        r.priceGap !== null &&
        r.totalSendingAmount >= 700_000 &&
        r.runHour.slice(0, 10) === effectiveAvgDate
      )
      .forEach(r => {
        if (!map[r.operator]) map[r.operator] = { gaps: [], count: 0 };
        map[r.operator].gaps.push(r.priceGap!);
        map[r.operator].count++;
      });
    return Object.entries(map)
      .map(([operator, { gaps, count }]) => ({
        operator,
        avgGap: Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length),
        count,
      }))
      .sort((a, b) => a.avgGap - b.avgGap);
  }, [byCountry, effectiveAvgDate]);

  const trendData = useMemo(() => {
    const map: Record<string, number> = {};
    byCountry
      .filter(r => r.gmeBaseline !== null && r.gmeBaseline >= 700_000)
      .forEach(r => {
        if (!map[r.runHour]) map[r.runHour] = r.gmeBaseline!;
      });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([runHour, gmeBaseline]) => ({ runHour, label: formatRunHour(runHour), gmeBaseline }));
  }, [byCountry]);

  const latestGMEBaseline = trendData[trendData.length - 1]?.gmeBaseline ?? null;
  const cheaperCount = snapshot.filter(r => r.status === 'Cheaper than GME').length;
  const expensiveCount = snapshot.filter(r => r.status === 'Expensive than GME').length;
  const totalCompetitors = snapshot.filter(r => r.status !== 'GME').length;
  const operators = useMemo(() => [...new Set(byCountry.map(r => r.operator))], [byCountry]);

  const tableData = useMemo(() => {
    let data = byCountry;
    if (tableSearch) {
      const q = tableSearch.toLowerCase();
      data = data.filter(r => r.operator.toLowerCase().includes(q));
    }
    if (tableStatus !== 'all') {
      data = data.filter(r => r.status === tableStatus);
    }
    return [...data].sort((a, b) => b.runHour.localeCompare(a.runHour));
  }, [byCountry, tableSearch, tableStatus]);

  const totalPages = Math.ceil(tableData.length / PAGE_SIZE);

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">

        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight">{t.title}</h1>
              <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5">{t.subtitle}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedCountry}
                onChange={e => { setSelectedCountry(e.target.value); setSelectedRunHour('all'); setTablePage(0); }}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={selectedRunHour}
                onChange={e => setSelectedRunHour(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{t.latestSnapshot}</option>
                {[...runHours].reverse().map(rh => (
                  <option key={rh} value={rh}>{formatRunHour(rh)}</option>
                ))}
              </select>

              {/* Language toggle */}
              <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden text-sm">
                <button
                  onClick={() => setIsEn(true)}
                  className={`px-3 py-1.5 transition-colors ${isEn ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                >
                  EN
                </button>
                <button
                  onClick={() => setIsEn(false)}
                  className={`px-3 py-1.5 transition-colors ${!isEn ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                >
                  한국어
                </button>
              </div>

              {/* Dark / Light toggle */}
              <button
                onClick={() => setIsDark(d => !d)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                title={isDark ? t.lightModeTitle : t.darkModeTitle}
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
                {isDark ? t.light : t.dark}
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KPICard
              title={t.totalDataPoints}
              value={byCountry.length.toLocaleString()}
              sub={t.timeSlots(runHours.length)}
            />
            <KPICard
              title={t.trackedOperators}
              value={`${operators.length}`}
              sub={t.services}
            />
            <KPICard
              title={t.latestGMEBaseline}
              value={latestGMEBaseline ? `${latestGMEBaseline.toLocaleString('ko-KR')}${t.won}` : '-'}
              sub={latestRunHour ? formatRunHour(latestRunHour) : ''}
              color="text-blue-600 dark:text-blue-400"
            />
            <KPICard
              title={t.cheaperCompetitors}
              value={`${cheaperCount} / ${totalCompetitors}`}
              sub={t.basedOnSnapshot}
              color={cheaperCount > totalCompetitors / 2 ? 'text-orange-500 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}
            />
            <KPICard
              title={t.expensiveCompetitors}
              value={`${expensiveCount} / ${totalCompetitors}`}
              sub={t.pricierThanGME}
              color={expensiveCount > totalCompetitors / 2 ? 'text-green-600 dark:text-green-400' : 'text-orange-500 dark:text-orange-400'}
            />
          </div>

          {/* Snapshot + Avg Gap */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Snapshot */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold">{t.snapshotTitle}</h2>
                  <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5">{t.snapshotSub(formatRunHour(targetRunHour))}</p>
                </div>
                <button
                  onClick={() => setSnapshotSortDesc(d => !d)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  {snapshotSortDesc ? '↓ Most Expensive' : '↑ Least Expensive'}
                </button>
              </div>
              {snapshotChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={snapshotChartData} layout="vertical" margin={{ top: 0, right: 75, left: 88, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={['auto', 'auto']}
                      tickFormatter={v => `${(v / 1000).toFixed(0)}K`}
                      tick={{ fill: ct.tick, fontSize: 11 }}
                      axisLine={{ stroke: ct.axisLine }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="operator"
                      tick={{ fill: ct.yLabel, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={85}
                    />
                    <Tooltip content={(props) => <SnapshotTooltip {...props} t={t} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    {snapshotGMEBaseline && (
                      <ReferenceLine
                        x={snapshotGMEBaseline}
                        stroke="#3b82f6"
                        strokeDasharray="5 3"
                        label={{ value: 'GME', fill: '#60a5fa', fontSize: 11, position: 'right' }}
                      />
                    )}
                    <Bar dataKey="totalSendingAmount" radius={[0, 4, 4, 0]}>
                      {snapshotChartData.map((entry, i) => (
                        <Cell key={i} fill={statusColor(entry.status).hex} />
                      ))}
                      <LabelList
                        dataKey="displayRate"
                        position="right"
                        formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(2) : '')}
                        style={{ fill: ct.tick, fontSize: 10 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-72 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">{t.noData}</div>
              )}
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />{t.gmeBaselineLegend}</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />{t.moreExpensiveLegend}</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />{t.cheaperLegend}</span>
              </div>
            </div>

            {/* Avg Gap */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold">{t.avgDiffTitle}</h2>
                  <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5">{t.avgDiffSub(effectiveAvgDate)}</p>
                </div>
                <select
                  value={effectiveAvgDate}
                  onChange={e => setAvgDate(e.target.value)}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                >
                  {[...avgDates].reverse().map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              {operatorStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={operatorStats} layout="vertical" margin={{ top: 0, right: 55, left: 88, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={v => `${v > 0 ? '+' : ''}${(v / 1000).toFixed(1)}K`}
                      tick={{ fill: ct.tick, fontSize: 11 }}
                      axisLine={{ stroke: ct.axisLine }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="operator"
                      tick={{ fill: ct.yLabel, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={85}
                    />
                    <Tooltip content={(props) => <GapTooltip {...props} t={t} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <ReferenceLine x={0} stroke={ct.refLine} strokeWidth={1.5} />
                    <Bar dataKey="avgGap" radius={[0, 4, 4, 0]}>
                      {operatorStats.map((entry, i) => (
                        <Cell key={i} fill={entry.avgGap < 0 ? '#22c55e' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-72 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">{t.noData}</div>
              )}
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />{t.gmeWins}</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />{t.gmeLoses}</span>
              </div>
            </div>
          </div>

          {/* GME Trend */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold">{t.trendTitle}</h2>
            <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5 mb-4">{t.trendSub}</p>
            {trendData.length > 1 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: ct.tick, fontSize: 11 }}
                    axisLine={{ stroke: ct.axisLine }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={v => `${(v / 1000).toFixed(0)}K`}
                    tick={{ fill: ct.tick, fontSize: 11 }}
                    axisLine={{ stroke: ct.axisLine }}
                    tickLine={false}
                    domain={['auto', 'auto']}
                    width={42}
                  />
                  <Tooltip content={(props) => <TrendTooltip {...props} t={t} />} />
                  <Line
                    type="monotone"
                    dataKey="gmeBaseline"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#60a5fa', strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">{t.insufficientData}</div>
            )}
          </div>

          {/* Data Table */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold">{t.detailedData}</h2>
                <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5">{t.records(tableData.length)}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder={t.searchOperator}
                  value={tableSearch}
                  onChange={e => { setTableSearch(e.target.value); setTablePage(0); }}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
                />
                <select
                  value={tableStatus}
                  onChange={e => { setTableStatus(e.target.value); setTablePage(0); }}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">{t.allStatus}</option>
                  <option value="GME">GME</option>
                  <option value="Cheaper than GME">{t.statusCheaper}</option>
                  <option value="Expensive than GME">{t.statusExpensive}</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    {t.tableHeaders.map(h => (
                      <th key={h} className={`py-2.5 px-3 text-slate-500 dark:text-slate-500 font-medium text-xs ${t.rightAlignHeaders.includes(h) ? 'text-right' : h === t.tableHeaders[t.tableHeaders.length - 1] ? 'text-center' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE).map((r, i) => {
                    const sc = statusColor(r.status);
                    return (
                      <tr key={i} className="border-b border-slate-200 dark:border-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">{formatRunHour(r.runHour)}</td>
                        <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.operator}</td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.receivingCountry}</td>
                        <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-200 font-mono whitespace-nowrap">
                          {r.receiveAmount.toLocaleString()}&nbsp;<span className="text-slate-400 dark:text-slate-500 text-xs">{CURRENCY_MAP[r.receivingCountry] ?? ''}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-200 font-mono whitespace-nowrap">{r.sendAmountKRW.toLocaleString('ko-KR')}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">{r.serviceFee > 0 ? r.serviceFee.toLocaleString('ko-KR') : '—'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200 font-mono whitespace-nowrap font-semibold">{r.totalSendingAmount.toLocaleString('ko-KR')}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                          {r.gmeBaseline ? r.gmeBaseline.toLocaleString('ko-KR') : '—'}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono whitespace-nowrap ${r.priceGap === null || r.priceGap === 0 ? 'text-slate-400 dark:text-slate-500' : r.priceGap < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          {r.priceGap !== null && r.priceGap !== 0
                            ? `${r.priceGap > 0 ? '+' : ''}${r.priceGap.toLocaleString('ko-KR')}`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-200 font-mono whitespace-nowrap">
                          {r.sendAmountKRW > 0
                            ? (() => { const rate = r.receiveAmount / r.sendAmountKRW; return rate >= 10 ? rate.toFixed(2) : rate >= 1 ? rate.toFixed(3) : rate.toFixed(4); })()
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                            {statusLabel(r.status, t)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-xs text-slate-500 dark:text-slate-500">
                <span>
                  {t.pagination(
                    tablePage * PAGE_SIZE + 1,
                    Math.min((tablePage + 1) * PAGE_SIZE, tableData.length),
                    tableData.length
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setTablePage(p => Math.max(0, p - 1))}
                    disabled={tablePage === 0}
                    className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                  >{t.prev}</button>
                  <span className="px-2">{tablePage + 1} / {totalPages}</span>
                  <button
                    onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={tablePage >= totalPages - 1}
                    className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                  >{t.next}</button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
