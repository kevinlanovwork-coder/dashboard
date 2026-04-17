'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from 'recharts';

interface CheckRecord {
  operator: string;
  receivingCountry: string;
  deliveryMethod: string;
  receiveAmount: number;
  sendAmountKRW: number;
  serviceFee: number;
  totalSendingAmount: number;
  gmeBaseline: number | null;
  priceGap: number | null;
  status: string | null;
}

function statusColor(status: string | null) {
  if (status === 'GME' || status === null) return '#ef4444';
  if (status?.includes('경쟁사 유리') || status?.includes('Cheaper')) return '#22c55e';
  return '#f97316';
}

export default function CheckPage() {
  const [checkId, setCheckId] = useState('');
  const [country, setCountry] = useState('');
  const [method, setMethod] = useState('');
  const [records, setRecords] = useState<CheckRecord[]>([]);
  const [status, setStatus] = useState<'waiting' | 'pending' | 'ready' | 'error'>('waiting');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  // Read params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCheckId(params.get('checkId') ?? '');
    setCountry(params.get('country') ?? '');
    setMethod(params.get('method') ?? '');
  }, []);

  // Poll for results
  const poll = useCallback(async () => {
    if (!checkId) return;
    try {
      const res = await fetch(`/api/scraper/results?checkId=${encodeURIComponent(checkId)}`);
      const data = await res.json();
      if (data.status === 'ready' && data.records?.length > 0) {
        setRecords(data.records);
        setStatus('ready');
        return true; // stop polling
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
    return false;
  }, [checkId]);

  useEffect(() => {
    if (!checkId) return;
    setStatus('pending');

    // Start polling after 30s (GitHub Actions needs time to spin up)
    const startDelay = setTimeout(() => {
      const interval = setInterval(async () => {
        const done = await poll();
        if (done) clearInterval(interval);
      }, 10000); // poll every 10s

      // Timeout after 8 minutes
      const timeout = setTimeout(() => {
        clearInterval(interval);
        setStatus(prev => prev === 'ready' ? prev : 'error');
        setError('Scraper did not return results within 8 minutes. Please try again.');
      }, 8 * 60 * 1000);

      return () => { clearInterval(interval); clearTimeout(timeout); };
    }, 30000);

    // Elapsed timer
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);

    return () => { clearTimeout(startDelay); clearInterval(timer); };
  }, [checkId, poll]);

  // Chart data — sorted descending (most expensive at top)
  const chartData = records.sort((a, b) => b.totalSendingAmount - a.totalSendingAmount);
  const gmeRecord = records.find(r => r.operator === 'GME');
  const gmeBaseline = gmeRecord?.totalSendingAmount ?? null;

  const amounts = chartData.map(r => r.totalSendingAmount).filter(Boolean);
  const minVal = Math.min(...amounts);
  const maxVal = Math.max(...amounts);
  const padding = (maxVal - minVal) * 0.15 || maxVal * 0.01;

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2.5">
            <img src="/GME_swirl_icon.png" alt="GME" className="h-7 shrink-0" />
            <div>
              <h1 className="text-base font-bold tracking-tight">Real-Time Check</h1>
              <p className="text-slate-500 text-xs mt-0.5">{country} — {method}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {status === 'waiting' && (
          <div className="text-center py-20 text-slate-400">Initializing...</div>
        )}

        {status === 'pending' && (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-2 border-slate-300 border-t-violet-500 rounded-full animate-spin mb-4" />
            <p className="text-slate-600 font-medium">Scraping in progress...</p>
            <p className="text-slate-400 text-sm mt-1">
              Elapsed: {formatTime(elapsed)} — typically takes 2-5 minutes
            </p>
            <p className="text-slate-400 text-xs mt-3">
              The scraper is running on GitHub Actions. This page will update automatically when results arrive.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-20">
            <p className="text-red-500 font-medium">{error}</p>
            <button
              onClick={() => window.close()}
              className="mt-4 px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-100 transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {status === 'ready' && (
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-semibold">Collection Amount — {country} ({method})</h2>
              <p className="text-slate-500 text-xs mt-0.5">
                Real-time check at {new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST — not stored in database
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 40)}>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 80, left: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[Math.max(0, minVal - padding), maxVal + padding]}
                      tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="operator"
                      tick={(props: any) => {
                        const isGME = props.payload.value === 'GME';
                        return (
                          <text x={props.x} y={props.y} dy={4} textAnchor="end" fontSize={11}
                            fill={isGME ? '#ef4444' : '#475569'}
                            fontWeight={isGME ? 700 : 400}
                          >
                            {isGME ? '★ GME' : props.payload.value}
                          </text>
                        );
                      }}
                      axisLine={false}
                      tickLine={false}
                      width={130}
                    />
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs shadow-lg">
                            <p className="font-semibold mb-1">{d.operator}</p>
                            <p>Collection: {d.totalSendingAmount?.toLocaleString('ko-KR')} KRW</p>
                            <p>Send: {d.sendAmountKRW?.toLocaleString('ko-KR')} KRW</p>
                            <p>Fee: {d.serviceFee?.toLocaleString('ko-KR')} KRW</p>
                            <p>Receive: {d.receiveAmount?.toLocaleString('ko-KR')}</p>
                          </div>
                        );
                      }}
                      cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    />
                    {gmeBaseline && (
                      <ReferenceLine x={gmeBaseline} stroke="#ef4444" strokeDasharray="5 3" />
                    )}
                    <Bar dataKey="totalSendingAmount" radius={[0, 4, 4, 0]} barSize={22}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={statusColor(entry.status)} />
                      ))}
                      <LabelList
                        dataKey="totalSendingAmount"
                        position="right"
                        formatter={(v: any) => v ? Math.round(v).toLocaleString('ko-KR') : ''}
                        style={{ fontSize: 10, fill: '#475569', fontWeight: 500 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data</div>
              )}

              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />GME (baseline)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />More expensive</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />Cheaper</span>
              </div>
            </div>

            {/* Data table */}
            <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Operator</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-500">Receive</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-500">Send (KRW)</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-500">Fee</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-500">Collection (KRW)</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map(r => (
                    <tr key={r.operator} className={r.operator === 'GME' ? 'bg-red-50/50' : ''}>
                      <td className={`px-4 py-2 font-medium ${r.operator === 'GME' ? 'text-red-500' : 'text-slate-700'}`}>
                        {r.operator === 'GME' ? '★ GME' : r.operator}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-slate-600">{r.receiveAmount?.toLocaleString('ko-KR')}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-600">{r.sendAmountKRW?.toLocaleString('ko-KR')}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-600">{r.serviceFee?.toLocaleString('ko-KR')}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-slate-800">{r.totalSendingAmount?.toLocaleString('ko-KR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
