'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { RateRecord } from '@/app/lib/parseRates';
import {
  computeGmeRankData,
  computeDailyPositions,
  computeRepresentativeSnapshot,
  computeCompetitorPositions,
  operatorCountMode,
  positionColor,
  flipRank,
  type Position,
  type RankPoint,
  type DailyPosition,
  type CompetitorEntry,
  type RepresentativeSnapshot,
} from '@/app/lib/rankAnalysis';

interface ReportConfig { corridors: string[]; ops: Record<string, string[]>; }

const SUMMARY_KEY = '__summary__';
// Always-visible competitors in the Summary tab, in this fixed order, regardless of
// whether they were ticked in Settings → Report Setup. They appear after GME and
// before any other selected competitors.
const SUMMARY_DEFAULT_OPS = ['E9Pay', 'GMoneyTrans', 'Hanpass'];

export default function ReportDashboard() {
  const [isDark, setIsDark] = useState(false);
  const [isEn, setIsEn] = useState(true);
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [perCorridorRecords, setPerCorridorRecords] = useState<Record<string, RateRecord[]>>({});
  const [activeCorridor, setActiveCorridor] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Inherit theme/lang
  useEffect(() => {
    if (localStorage.getItem('dashboard-theme') === 'dark') setIsDark(true);
    if (localStorage.getItem('dashboard-lang') === 'ko') setIsEn(false);
    document.title = 'GME Weekly Competitive Position Report';
  }, []);

  // Window: last 7 complete days ending yesterday. If today is 04/29, this gives 04/22 → 04/28.
  const reportWindow = useMemo(() => {
    const today = new Date();
    const fromDate = new Date(today); fromDate.setDate(today.getDate() - 7);
    const toDate = new Date(today); toDate.setDate(today.getDate() - 1);
    return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const cfgRes = await fetch('/api/summary/config');
      if (!cfgRes.ok) throw new Error(`HTTP ${cfgRes.status}`);
      const cfg = await cfgRes.json();
      const corridors: string[] = Array.isArray(cfg?.report_corridors) ? cfg.report_corridors : [];
      const ops: Record<string, string[]> = (cfg?.report_corridor_operators ?? {}) as Record<string, string[]>;
      setConfig({ corridors, ops });

      if (corridors.length === 0) {
        setPerCorridorRecords({});
        setFetchError(null);
        return;
      }

      const countries = [...new Set(corridors.map(k => k.split('||')[0]))];
      const fetches = countries.map(country =>
        fetch(`/api/rates?country=${encodeURIComponent(country)}&from=${reportWindow.from}&to=${reportWindow.to}`)
          .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} for ${country}`)))
          .then((records: RateRecord[]) => ({ country, records }))
      );
      const settled = await Promise.allSettled(fetches);
      const next: Record<string, RateRecord[]> = {};
      for (const k of corridors) next[k] = [];
      let firstErr: string | null = null;
      // Defensive: also clip records to the window in JS so today's partial day never bleeds in
      // even if /api/rates ignored the `to` bound for some reason.
      const cutoff = reportWindow.to + 'T23:59';
      for (const s of settled) {
        if (s.status === 'fulfilled') {
          const { records } = s.value;
          for (const rec of records) {
            if (rec.runHour > cutoff) continue;
            const key = `${rec.receivingCountry}||${rec.deliveryMethod ?? 'Bank Deposit'}`;
            if (!corridors.includes(key)) continue;
            next[key].push(rec);
          }
        } else if (!firstErr) {
          firstErr = s.reason instanceof Error ? s.reason.message : String(s.reason);
        }
      }
      setPerCorridorRecords(next);
      setFetchError(firstErr);
    } catch (err) {
      console.error('Failed to load report:', err);
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [reportWindow]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Default active tab = first corridor (leftmost). If user had picked a corridor that
  // no longer exists, fall back to the first corridor too.
  useEffect(() => {
    if (!config?.corridors.length) return;
    if (!activeCorridor) {
      setActiveCorridor(config.corridors[0]);
    } else if (activeCorridor !== SUMMARY_KEY && !config.corridors.includes(activeCorridor)) {
      setActiveCorridor(config.corridors[0]);
    }
  }, [config, activeCorridor]);

  const activeData = useMemo(() => {
    if (!activeCorridor || !config) return null;
    const records = perCorridorRecords[activeCorridor] ?? [];
    if (records.length === 0) return { hasData: false } as const;
    const filteredRank = computeGmeRankData(records);
    if (filteredRank.length === 0) return { hasData: false } as const;
    const daily = computeDailyPositions(filteredRank);
    const snapshot = computeRepresentativeSnapshot(filteredRank, records);
    const operatorCount = operatorCountMode(daily, snapshot?.total ?? 0);
    const competitorList = config.ops[activeCorridor] ?? [];
    const compPositions = computeCompetitorPositions(records, competitorList);
    const overallAvgRank = filteredRank.reduce((s, d) => s + d.rank, 0) / filteredRank.length;
    const overallPoints = filteredRank.length;
    const overallRatio = operatorCount > 0 ? overallAvgRank / operatorCount : 1;
    const overallPosition: Position = overallRatio <= 1 / 3 ? 'Low' : overallRatio <= 2 / 3 ? 'Medium' : 'High';
    return { hasData: true, filteredRank, daily, snapshot, operatorCount, competitorList, compPositions, overallAvgRank, overallPoints, overallPosition } as const;
  }, [activeCorridor, config, perCorridorRecords]);

  const captureRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const handleDownload = async () => {
    if (!captureRef.current) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const canvas = await html2canvas(captureRef.current, {
        scale: 2,
        backgroundColor: isDark ? '#020617' : '#ffffff',
        useCORS: true,
        logging: false,
      });
      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Failed to encode PNG blob')); return; }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          let suffix: string;
          if (activeCorridor === SUMMARY_KEY) {
            suffix = 'Summary';
          } else {
            const [country, method] = (activeCorridor || '').split('||');
            suffix = `${(country || 'all').replace(/\s+/g, '_')}_${(method || '').replace(/\s+/g, '_')}`;
          }
          a.href = url;
          a.download = `GME_Report_${suffix}.png`;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          resolve();
        }, 'image/png');
      });
    } catch (err) {
      console.error('Download PNG failed:', err);
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur print:hidden">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <img src="/GME_swirl_icon.png" alt="GME" className="h-7 shrink-0" />
              <h1 className="text-base font-bold tracking-tight">{isEn ? 'GME Weekly Competitive Position Report' : 'GME 경쟁사 주간 리포트'}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {isEn ? 'Print' : '인쇄'}
              </button>
              <button
                onClick={handleDownload}
                disabled={downloading || (activeCorridor !== SUMMARY_KEY && !activeData?.hasData)}
                className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {downloading ? (isEn ? 'Downloading…' : '다운로드 중…') : (isEn ? 'Download PNG' : 'PNG 다운로드')}
              </button>
            </div>
          </div>
          {(downloadError || fetchError) && (
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 pb-2 -mt-1 space-y-1">
              {fetchError && (
                <div className="text-xs text-red-600 dark:text-red-400">
                  {isEn ? 'Failed to load some data: ' : '데이터 로드 실패: '}{fetchError}
                </div>
              )}
              {downloadError && (
                <div className="text-xs text-red-600 dark:text-red-400">
                  {isEn ? 'Download failed: ' : '다운로드 실패: '}{downloadError}
                </div>
              )}
            </div>
          )}
        </header>

        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4">
          {loading ? (
            <div className="text-center py-20 text-slate-400">{isEn ? 'Loading…' : '로딩 중…'}</div>
          ) : !config?.corridors?.length ? (
            <div className="text-center py-20 text-slate-400 text-sm">
              <p className="mb-2">{isEn ? 'No corridors configured for the Report.' : '리포트에 설정된 경로가 없습니다.'}</p>
              <a href="/settings?tab=report" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400 text-xs hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
                {isEn ? 'Configure in Settings → Report Setup →' : '설정 → 리포트 설정에서 구성하기 →'}
              </a>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 dark:border-slate-800 flex print:hidden mb-4">
                <div className="flex gap-1 overflow-x-auto flex-1 min-w-0">
                  {config.corridors.map(key => {
                    const [country, method] = key.split('||');
                    const active = key === activeCorridor;
                    return (
                      <button
                        key={key}
                        onClick={() => setActiveCorridor(key)}
                        title={`${country} — ${method}`}
                        className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${active ? 'border-violet-500 text-violet-600 dark:text-violet-400 font-semibold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                      >
                        {country}
                      </button>
                    );
                  })}
                </div>
                <div className="flex border-l border-slate-200 dark:border-slate-800 ml-2">
                  <button
                    onClick={() => setActiveCorridor(SUMMARY_KEY)}
                    title={isEn ? 'Summary across all corridors' : '전체 경로 요약'}
                    className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${activeCorridor === SUMMARY_KEY ? 'border-violet-500 text-violet-600 dark:text-violet-400 font-semibold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    {isEn ? 'Summary' : '요약'}
                  </button>
                </div>
              </div>

              <div ref={captureRef}>
                {activeCorridor === SUMMARY_KEY ? (
                  <SummaryTab perCorridorRecords={perCorridorRecords} config={config} isEn={isEn} reportWindow={reportWindow} />
                ) : activeCorridor && activeData ? (
                  activeData.hasData ? (
                    <CorridorReport
                      corridorKey={activeCorridor}
                      operatorCount={activeData.operatorCount}
                      daily={activeData.daily}
                      snapshot={activeData.snapshot}
                      filteredRank={activeData.filteredRank}
                      competitorList={activeData.competitorList}
                      compPositions={activeData.compPositions}
                      overallAvgRank={activeData.overallAvgRank}
                      overallPosition={activeData.overallPosition}
                      isDark={isDark}
                      isEn={isEn}
                    />
                  ) : (
                    <div className="text-center py-12 text-slate-400 text-sm">
                      {isEn ? 'No data for this corridor in the past 7 days.' : '지난 7일간 이 경로에 대한 데이터가 없습니다.'}
                    </div>
                  )
                ) : null}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Active corridor body ───────────────────────────────────────────────────

function positionLabelFor(p: Position, isEn: boolean): string {
  if (isEn) return p;
  return p === 'Low' ? '낮음' : p === 'Medium' ? '보통' : '높음';
}

function CompetitorCell({ entry, isEn }: { entry: CompetitorEntry | null; isEn: boolean }) {
  if (!entry) return <span className="text-slate-400">—</span>;
  const c = positionColor(entry.position);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">#{flipRank(entry.avgRank, entry.total).toFixed(2)}</div>
      <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: `${c}1a`, color: c }}>{positionLabelFor(entry.position, isEn)}</span>
    </div>
  );
}

function formatRunHourCompact(rh: string) {
  const m = rh.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return rh;
  return `${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
}

function CorridorReport(props: {
  corridorKey: string;
  operatorCount: number;
  daily: DailyPosition[];
  snapshot: RepresentativeSnapshot | null;
  filteredRank: RankPoint[];
  competitorList: string[];
  compPositions: ReturnType<typeof computeCompetitorPositions>;
  overallAvgRank: number;
  overallPosition: Position;
  isDark: boolean;
  isEn: boolean;
}) {
  const { corridorKey, operatorCount, daily, snapshot, filteredRank, competitorList, compPositions, overallAvgRank, overallPosition, isDark, isEn } = props;
  const [country, deliveryMethod] = corridorKey.split('||');
  const ct = {
    grid: isDark ? '#1e293b' : '#e2e8f0',
    tick: isDark ? '#64748b' : '#94a3b8',
    axisLine: isDark ? '#1e293b' : '#e2e8f0',
  };
  const chartTotal = filteredRank.reduce((m, d) => Math.max(m, d.total), 0);
  const dateRange = daily.length ? `${daily[0].day} → ${daily[daily.length - 1].day}` : '';
  const headingTitle = `${country} — ${deliveryMethod} (${operatorCount} ${isEn ? 'Operators' : '운영사'})`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">{headingTitle}</h2>
        <div className="text-xs text-slate-500 dark:text-slate-400">{dateRange} · {daily.length} {isEn ? 'day(s)' : '일'}</div>
      </div>

      {/* Daily Ranking Section */}
      <section>
        <h3 className="text-sm font-semibold mb-1">{isEn ? 'Avg Ranking on Daily Basis' : '일별 평균 순위'}</h3>
        <div className="text-xs italic text-slate-500 dark:text-slate-400 mb-2">
          {isEn ? `Rank 1 = Most Expensive · Rank ${operatorCount} = Cheapest` : `1위 = 가장 비쌈 · ${operatorCount}위 = 가장 저렴`}
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">{isEn ? 'Day' : '날짜'}</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">{isEn ? 'Avg rank' : '평균 순위'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">{isEn ? "GME's position" : 'GME 포지션'}</th>
                {competitorList.map(op => (
                  <th key={op} className="px-3 py-2 text-center text-xs font-medium text-slate-500">{op}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map(d => {
                const c = positionColor(d.position);
                const rowBg = d.extreme === 'best' ? 'bg-green-50 dark:bg-green-900/10' : d.extreme === 'worst' ? 'bg-red-50 dark:bg-red-900/10' : '';
                return (
                  <tr key={d.day} className={`border-t border-slate-200 dark:border-slate-800 ${rowBg}`}>
                    <td className="px-3 py-2">{d.day}</td>
                    <td className="px-3 py-2 text-right font-mono">#{flipRank(d.avgRank, d.total).toFixed(2)}</td>
                    <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: `${c}1a`, color: c }}>{positionLabelFor(d.position, isEn)}</span></td>
                    {competitorList.map(op => (
                      <td key={op} className="px-3 py-2 text-center"><CompetitorCell entry={compPositions.dayPos(op, d.day)} isEn={isEn} /></td>
                    ))}
                  </tr>
                );
              })}
              {daily.length > 0 && (
                <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/60 font-semibold">
                  <td className="px-3 py-2">{isEn ? 'Overall' : '전체'}</td>
                  <td className="px-3 py-2 text-right font-mono">#{flipRank(overallAvgRank, operatorCount).toFixed(2)}</td>
                  <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: `${positionColor(overallPosition)}1a`, color: positionColor(overallPosition) }}>{positionLabelFor(overallPosition, isEn)}</span></td>
                  {competitorList.map(op => (
                    <td key={op} className="px-3 py-2 text-center"><CompetitorCell entry={compPositions.overallPos(op)} isEn={isEn} /></td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div><b>{isEn ? 'Avg rank' : '평균 순위'}</b> = {isEn ? "mean of the operator's rank across that day's hourly snapshots (rank 1 = most expensive among all operators)." : '해당 날짜 시간별 스냅샷에서 운영사 순위의 평균 (1위 = 가장 비쌈).'}</div>
          <div className="mt-1"><b>{isEn ? 'Position' : '포지션'}</b> {isEn ? 'uses thirds of the leaderboard:' : '은 평균 순위를 운영사 수의 1/3 단위로 분할:'} <b style={{ color: '#16a34a' }}>{isEn ? 'Low' : '낮음'}</b> ({isEn ? 'cheapest' : '저렴'}), <b style={{ color: '#d97706' }}>{isEn ? 'Medium' : '보통'}</b>, <b style={{ color: '#dc2626' }}>{isEn ? 'High' : '높음'}</b> ({isEn ? 'most expensive' : '비쌈'}).</div>
        </div>
      </section>

      {/* Representative Snapshot Section */}
      {snapshot && snapshot.records.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-1">{isEn ? 'Avg Price Gap on Weekly Basis' : '주간 평균 가격차'}</h3>
          <div className="flex justify-between items-baseline text-xs text-slate-500 dark:text-slate-400 mb-2 gap-3 flex-wrap">
            <span>{isEn ? "Closest run-hour to GME's average position over the period" : '기간 중 GME 평균 순위에 가장 가까운 시점'} · GME #{flipRank(snapshot.gmeRank, snapshot.total)} / {snapshot.total}</span>
            <span className="font-mono text-slate-600 dark:text-slate-300">{formatRunHourCompact(snapshot.runHour)}</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">{isEn ? 'Operator' : '운영사'}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">{isEn ? 'Service Fee' : '수수료'}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">{isEn ? 'Total Send (KRW)' : '송금 합계 (KRW)'}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">{isEn ? 'Price Gap vs GME' : 'GME 대비 가격차'}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">{isEn ? 'Status' : '상태'}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.records.map(r => {
                  const isGME = r.status === 'GME' || r.operator === 'GME';
                  const fee = r.serviceFee.toLocaleString('ko-KR');
                  const total = r.totalSendingAmount.toLocaleString('ko-KR');
                  let gapEl: React.ReactNode = '';
                  if (!isGME && r.priceGap !== null && r.priceGap !== 0) {
                    const gapColor = r.priceGap < 0 ? '#16a34a' : '#dc2626';
                    const sign = r.priceGap > 0 ? '+' : '';
                    gapEl = <span className="font-mono" style={{ color: gapColor }}>{sign}{r.priceGap.toLocaleString('ko-KR')}</span>;
                  } else if (!isGME && r.priceGap === 0) {
                    gapEl = <span className="text-slate-400">0</span>;
                  }
                  let chipBg = '#ef4444', chipText = isEn ? 'GME' : 'GME';
                  if (!isGME) {
                    if (r.priceGap !== null && r.priceGap < 0) {
                      chipBg = '#22c55e'; chipText = isEn ? 'Cheaper than GME' : 'GME보다 저렴';
                    } else if (r.priceGap !== null && r.priceGap > 0) {
                      chipBg = '#f97316'; chipText = isEn ? 'More expensive than GME' : 'GME보다 비쌈';
                    } else {
                      chipBg = '#94a3b8'; chipText = '—';
                    }
                  }
                  const rowBg = isGME ? 'bg-blue-50/40 dark:bg-blue-900/10' : '';
                  return (
                    <tr key={r.operator} className={`border-t border-slate-200 dark:border-slate-800 ${rowBg}`}>
                      <td className={`px-3 py-2 ${isGME ? 'font-semibold' : ''}`}>{r.operator}</td>
                      <td className="px-3 py-2 text-right font-mono">{fee}</td>
                      <td className="px-3 py-2 text-right font-mono">{total}</td>
                      <td className="px-3 py-2 text-right">{gapEl}</td>
                      <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: `${chipBg}1a`, color: chipBg }}>{chipText}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Rank Trend Chart Section */}
      {filteredRank.length > 1 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">{isEn ? 'Rank Trend on Hourly Basis' : '시간별 순위 추이'}</h3>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            <ResponsiveContainer width="100%" height={Math.max(280, operatorCount * 36)}>
              <LineChart data={filteredRank.map(d => ({ ...d, label: formatRunHourCompact(d.runHour) }))} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                <XAxis dataKey="label" tick={{ fill: ct.tick, fontSize: 11 }} axisLine={{ stroke: ct.axisLine }} tickLine={false} interval="preserveStartEnd" />
                <YAxis reversed domain={[1, 'dataMax']} allowDecimals={false} tick={{ fill: ct.tick, fontSize: 11 }} axisLine={{ stroke: ct.axisLine }} tickLine={false} width={30} tickFormatter={(v: number) => `#${chartTotal > 0 ? chartTotal - v + 1 : v}`} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as { rank: number; total: number };
                  const display = d.total - d.rank + 1;
                  return (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm shadow-xl">
                      <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">{label}</p>
                      <p className="font-mono text-red-500 font-bold">#{display} <span className="text-slate-400 font-normal text-xs">{isEn ? `of ${d.total} operators` : `${d.total}개 중`}</span></p>
                    </div>
                  );
                }} />
                <Line type="monotone" dataKey="rank" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 2, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#f87171', strokeWidth: 0 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Summary tab body ───────────────────────────────────────────────────────

function SummaryTab({ perCorridorRecords, config, isEn, reportWindow }: {
  perCorridorRecords: Record<string, RateRecord[]>;
  config: ReportConfig;
  isEn: boolean;
  reportWindow: { from: string; to: string };
}) {
  const matrix = useMemo(() => {
    const rows = config.corridors.map(corridorKey => {
      const records = perCorridorRecords[corridorKey] ?? [];
      const [country, method] = corridorKey.split('||');
      const selectedOps = config.ops[corridorKey] ?? [];
      // Compute for selected ops PLUS the always-visible defaults so the Summary
      // shows E9Pay/GMoneyTrans/Hanpass even when they're unticked.
      const effectiveOps = [...new Set([...SUMMARY_DEFAULT_OPS, ...selectedOps])];
      if (records.length === 0) {
        return { corridorKey, country, method, gme: null as CompetitorEntry | null, competitors: {} as Record<string, CompetitorEntry | null>, effectiveOps };
      }
      const filteredRank = computeGmeRankData(records);
      if (filteredRank.length === 0) {
        return { corridorKey, country, method, gme: null as CompetitorEntry | null, competitors: {} as Record<string, CompetitorEntry | null>, effectiveOps };
      }
      const daily = computeDailyPositions(filteredRank);
      const operatorCount = operatorCountMode(daily, filteredRank[0].total);
      const overallAvgRank = filteredRank.reduce((s, d) => s + d.rank, 0) / filteredRank.length;
      const ratio = operatorCount > 0 ? overallAvgRank / operatorCount : 1;
      const gmePos: Position = ratio <= 1 / 3 ? 'Low' : ratio <= 2 / 3 ? 'Medium' : 'High';
      const gme: CompetitorEntry = { avgRank: overallAvgRank, total: operatorCount, position: gmePos };
      const compPositions = computeCompetitorPositions(records, effectiveOps);
      const competitors: Record<string, CompetitorEntry | null> = {};
      for (const op of effectiveOps) {
        competitors[op] = compPositions.overallPos(op);
      }
      return { corridorKey, country, method, gme, competitors, effectiveOps };
    });
    // Union of all operators that have a column in the matrix.
    const allOps = new Set<string>(SUMMARY_DEFAULT_OPS);
    for (const r of rows) for (const op of r.effectiveOps) allOps.add(op);
    // Column order: GME → defaults (in fixed order) → remaining ops alphabetically.
    const remaining = [...allOps].filter(op => !SUMMARY_DEFAULT_OPS.includes(op)).sort();
    const operatorColumns = ['GME', ...SUMMARY_DEFAULT_OPS, ...remaining];
    return { rows, operatorColumns };
  }, [perCorridorRecords, config]);

  const renderCell = (cell: CompetitorEntry | null, isAvailable: boolean) => {
    if (!isAvailable) return <span className="text-slate-300 dark:text-slate-600">·</span>;
    if (!cell) return <span className="text-slate-400">—</span>;
    const c = positionColor(cell.position);
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">#{flipRank(cell.avgRank, cell.total).toFixed(2)}</div>
        <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: `${c}1a`, color: c }}>{positionLabelFor(cell.position, isEn)}</span>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">{isEn ? 'Weekly Position Summary' : '주간 포지션 요약'}</h2>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {reportWindow.from} → {reportWindow.to} · {isEn ? 'overall position per operator across the past 7 days' : '지난 7일간 운영사별 종합 포지션'}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {isEn ? 'Rank 1 = Most expensive' : '1위 = 가장 비쌈'}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 whitespace-nowrap w-px">{isEn ? 'Country' : '국가'}</th>
              <th className="pl-3 pr-12 py-2 text-center text-xs font-medium text-slate-500 whitespace-nowrap w-px" aria-label={isEn ? 'Operators' : '운영사'}></th>
              {matrix.operatorColumns.map(op => (
                <th key={op} className={`px-3 py-2 text-center text-xs font-medium ${op === 'GME' ? 'text-red-500' : 'text-slate-500'}`}>
                  {op === 'GME' ? '★ GME' : op}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map(row => {
              return (
                <tr key={row.corridorKey} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-medium">{row.country} — {row.method}</span>
                  </td>
                  <td className="pl-3 pr-12 py-2 text-center text-xs whitespace-nowrap text-slate-400 font-normal">
                    {row.gme ? `(${row.gme.total} ${isEn ? 'Operators' : '운영사'})` : '—'}
                  </td>
                  {matrix.operatorColumns.map(op => {
                    if (op === 'GME') {
                      return <td key={op} className="px-3 py-2 text-center">{renderCell(row.gme, true)}</td>;
                    }
                    const isAvailable = row.effectiveOps.includes(op);
                    const cell = isAvailable ? (row.competitors[op] ?? null) : null;
                    return <td key={op} className="px-3 py-2 text-center">{renderCell(cell, isAvailable)}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
