'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import type { RateRecord } from '@/app/lib/parseRates';

// ─── 헬퍼 함수 ────────────────────────────────────────────────────────────────

function formatKRW(value: number) {
  return value.toLocaleString('ko-KR') + '원';
}

function formatRunHour(runHour: string) {
  const m = runHour.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return runHour;
  return `${parseInt(m[2])}/${parseInt(m[3])} ${m[4]}:00`;
}

function statusLabel(status: string) {
  if (status === 'GME') return 'GME';
  if (status === 'Cheaper than GME') return '더 저렴';
  if (status === 'Expensive than GME') return '더 비쌈';
  return status;
}

function statusColor(status: string) {
  if (status === 'GME') return { bg: 'bg-blue-500/20', text: 'text-blue-500 dark:text-blue-400', hex: '#3b82f6' };
  if (status === 'Cheaper than GME') return { bg: 'bg-orange-500/20', text: 'text-orange-500 dark:text-orange-400', hex: '#f97316' };
  return { bg: 'bg-green-500/20', text: 'text-green-600 dark:text-green-400', hex: '#22c55e' };
}

const CURRENCY_MAP: Record<string, string> = {
  'Indonesia': 'IDR',
  'Thailand': 'THB',
  'Vietnam': 'VND',
  'Philippines': 'PHP',
  'Nepal': 'NPR',
  'Malaysia': 'MYR',
  'Singapore': 'SGD',
  'Cambodia': 'USD',
  'Japan': 'JPY',
  'China': 'CNY',
};

// ─── 아이콘 ───────────────────────────────────────────────────────────────────

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

// ─── KPI 카드 ────────────────────────────────────────────────────────────────

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

// ─── 커스텀 툴팁 ──────────────────────────────────────────────────────────────

function SnapshotTooltip({ active, payload }: { active?: boolean; payload?: { payload: RateRecord }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const sc = statusColor(d.status);
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{d.operator}</p>
      <p className="text-slate-600 dark:text-slate-300">총 송금액: <span className="font-mono">{formatKRW(d.totalSendingAmount)}</span></p>
      {d.priceGap !== null && d.status !== 'GME' && (
        <p className={d.priceGap < 0 ? 'text-orange-500 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}>
          GME 대비: <span className="font-mono">{d.priceGap > 0 ? '+' : ''}{d.priceGap.toLocaleString('ko-KR')}원</span>
        </p>
      )}
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs mt-1.5 ${sc.bg} ${sc.text}`}>
        {statusLabel(d.status)}
      </span>
    </div>
  );
}

function GapTooltip({ active, payload }: { active?: boolean; payload?: { payload: { operator: string; avgGap: number; count: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{d.operator}</p>
      <p className={d.avgGap < 0 ? 'text-orange-500 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}>
        평균 차이: <span className="font-mono">{d.avgGap > 0 ? '+' : ''}{d.avgGap.toLocaleString('ko-KR')}원</span>
      </p>
      <p className="text-slate-400 dark:text-slate-400 text-xs mt-1">데이터 수: {d.count}건</p>
    </div>
  );
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">{label}</p>
      <p className="font-semibold text-blue-600 dark:text-blue-400 font-mono">{formatKRW(payload[0].value)}</p>
    </div>
  );
}

// ─── 메인 대시보드 ────────────────────────────────────────────────────────────

export default function Dashboard({ records }: { records: RateRecord[] }) {
  const [isDark, setIsDark] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('Indonesia');
  const [selectedRunHour, setSelectedRunHour] = useState('all');
  const [tableSearch, setTableSearch] = useState('');
  const [tableStatus, setTableStatus] = useState('all');
  const [tablePage, setTablePage] = useState(0);
  const PAGE_SIZE = 20;

  // 다크모드 localStorage 유지
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-theme');
    if (saved === 'dark') setIsDark(true);
  }, []);
  useEffect(() => {
    localStorage.setItem('dashboard-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // 차트 테마 (hex 색상값)
  const ct = {
    grid:      isDark ? '#1e293b' : '#e2e8f0',
    tick:      isDark ? '#64748b' : '#94a3b8',
    axisLine:  isDark ? '#1e293b' : '#e2e8f0',
    yLabel:    isDark ? '#cbd5e1' : '#475569',
    refLine:   isDark ? '#334155' : '#cbd5e1',
  };

  // 국가 목록
  const countries = useMemo(
    () => [...new Set(records.map(r => r.receivingCountry))].sort(),
    [records]
  );

  // 국가 필터 적용
  const byCountry = useMemo(
    () => selectedCountry === 'all' ? records : records.filter(r => r.receivingCountry === selectedCountry),
    [records, selectedCountry]
  );

  // 시간대 목록
  const runHours = useMemo(
    () => [...new Set(byCountry.map(r => r.runHour))].sort(),
    [byCountry]
  );

  // GME 데이터가 있는 최신 시간대
  const latestRunHour = useMemo(() => {
    const withGME = runHours.filter(rh =>
      byCountry.some(r => r.runHour === rh && r.status === 'GME')
    );
    return withGME[withGME.length - 1] ?? runHours[runHours.length - 1] ?? '';
  }, [byCountry, runHours]);

  const targetRunHour = selectedRunHour === 'all' ? latestRunHour : selectedRunHour;

  // 선택된 스냅샷
  const snapshot = useMemo(
    () => byCountry
      .filter(r => r.runHour === targetRunHour)
      .sort((a, b) => a.totalSendingAmount - b.totalSendingAmount),
    [byCountry, targetRunHour]
  );

  const snapshotGMEBaseline = useMemo(
    () => snapshot.find(r => r.status === 'GME')?.totalSendingAmount ?? null,
    [snapshot]
  );

  // 운영사별 평균 가격 차이
  const operatorStats = useMemo(() => {
    const map: Record<string, { gaps: number[]; count: number }> = {};
    byCountry
      .filter(r => r.status !== 'GME' && r.priceGap !== null && r.totalSendingAmount >= 700_000)
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
  }, [byCountry]);

  // GME 기준가 추이
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

        {/* 헤더 */}
        <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight">환율 비교 대시보드</h1>
              <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5">해외 송금 서비스 요율 경쟁력 분석</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedCountry}
                onChange={e => { setSelectedCountry(e.target.value); setSelectedRunHour('all'); setTablePage(0); }}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">전체 국가</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={selectedRunHour}
                onChange={e => setSelectedRunHour(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">최신 스냅샷</option>
                {[...runHours].reverse().map(rh => (
                  <option key={rh} value={rh}>{formatRunHour(rh)}</option>
                ))}
              </select>
              {/* 다크/라이트 모드 토글 */}
              <button
                onClick={() => setIsDark(d => !d)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
                {isDark ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* KPI 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KPICard
              title="총 데이터 포인트"
              value={byCountry.length.toLocaleString()}
              sub={`${runHours.length}개 시간대`}
            />
            <KPICard
              title="추적 운영사"
              value={`${operators.length}개`}
              sub="서비스"
            />
            <KPICard
              title="최신 GME 기준가"
              value={latestGMEBaseline ? `${latestGMEBaseline.toLocaleString('ko-KR')}원` : '-'}
              sub={latestRunHour ? formatRunHour(latestRunHour) : ''}
              color="text-blue-600 dark:text-blue-400"
            />
            <KPICard
              title="더 저렴한 경쟁사"
              value={`${cheaperCount} / ${totalCompetitors}`}
              sub="스냅샷 기준"
              color={cheaperCount > totalCompetitors / 2 ? 'text-orange-500 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}
            />
            <KPICard
              title="GME 우위 경쟁사"
              value={`${expensiveCount} / ${totalCompetitors}`}
              sub="GME보다 비싼 서비스"
              color={expensiveCount > totalCompetitors / 2 ? 'text-green-600 dark:text-green-400' : 'text-orange-500 dark:text-orange-400'}
            />
          </div>

          {/* 스냅샷 + 평균 가격 차이 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 스냅샷 비교 */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold">스냅샷 비교 — 총 송금액</h2>
              <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5 mb-4">{formatRunHour(targetRunHour)} 기준 (KRW, 낮을수록 유리)</p>
              {snapshot.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={snapshot} layout="vertical" margin={{ top: 0, right: 55, left: 88, bottom: 0 }}>
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
                    <Tooltip content={<SnapshotTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    {snapshotGMEBaseline && (
                      <ReferenceLine
                        x={snapshotGMEBaseline}
                        stroke="#3b82f6"
                        strokeDasharray="5 3"
                        label={{ value: 'GME', fill: '#60a5fa', fontSize: 11, position: 'right' }}
                      />
                    )}
                    <Bar dataKey="totalSendingAmount" radius={[0, 4, 4, 0]}>
                      {snapshot.map((entry, i) => (
                        <Cell key={i} fill={statusColor(entry.status).hex} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-72 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">데이터 없음</div>
              )}
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />GME (기준)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />GME보다 비쌈</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />GME보다 저렴</span>
              </div>
            </div>

            {/* 운영사별 평균 가격 차이 */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold">운영사별 평균 가격 차이</h2>
              <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5 mb-4">전체 기간 평균 (GME 기준, KRW)</p>
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
                    <Tooltip content={<GapTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <ReferenceLine x={0} stroke={ct.refLine} strokeWidth={1.5} />
                    <Bar dataKey="avgGap" radius={[0, 4, 4, 0]}>
                      {operatorStats.map((entry, i) => (
                        <Cell key={i} fill={entry.avgGap < 0 ? '#f97316' : '#22c55e'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-72 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">데이터 없음</div>
              )}
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />GME보다 비쌈 (GME 유리)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />GME보다 저렴 (GME 불리)</span>
              </div>
            </div>
          </div>

          {/* GME 기준가 추이 */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold">GME 기준가 추이</h2>
            <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5 mb-4">시간에 따른 GME 총 송금액 변화 (KRW)</p>
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
                  <Tooltip content={<TrendTooltip />} />
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
              <div className="h-48 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">데이터 부족</div>
            )}
          </div>

          {/* 데이터 테이블 */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold">상세 데이터</h2>
                <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5">{tableData.length.toLocaleString()}건</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="운영사 검색..."
                  value={tableSearch}
                  onChange={e => { setTableSearch(e.target.value); setTablePage(0); }}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
                />
                <select
                  value={tableStatus}
                  onChange={e => { setTableStatus(e.target.value); setTablePage(0); }}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">전체 상태</option>
                  <option value="GME">GME</option>
                  <option value="Cheaper than GME">더 저렴</option>
                  <option value="Expensive than GME">더 비쌈</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    {['시간대', '운영사', '국가', '수령액', '송금액 (KRW)', '수수료', '총 송금액', 'GME 기준가', '차이', '상태'].map(h => (
                      <th key={h} className={`py-2.5 px-3 text-slate-500 dark:text-slate-500 font-medium text-xs ${['수령액', '송금액 (KRW)', '수수료', '총 송금액', 'GME 기준가', '차이'].includes(h) ? 'text-right' : h === '상태' ? 'text-center' : 'text-left'}`}>
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
                        <td className={`py-2.5 px-3 text-right font-mono whitespace-nowrap ${r.priceGap === null || r.priceGap === 0 ? 'text-slate-400 dark:text-slate-500' : r.priceGap < 0 ? 'text-orange-500 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                          {r.priceGap !== null && r.priceGap !== 0
                            ? `${r.priceGap > 0 ? '+' : ''}${r.priceGap.toLocaleString('ko-KR')}`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                            {statusLabel(r.status)}
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
                  {(tablePage * PAGE_SIZE + 1).toLocaleString()}–{Math.min((tablePage + 1) * PAGE_SIZE, tableData.length).toLocaleString()} / {tableData.length.toLocaleString()}건
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setTablePage(p => Math.max(0, p - 1))}
                    disabled={tablePage === 0}
                    className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                  >이전</button>
                  <span className="px-2">{tablePage + 1} / {totalPages}</span>
                  <button
                    onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={tablePage >= totalPages - 1}
                    className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                  >다음</button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
