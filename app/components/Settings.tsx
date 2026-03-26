'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface ServiceFee {
  id: number;
  receiving_country: string;
  operator: string;
  delivery_method: string;
  fee_krw: number;
  notes: string | null;
  updated_at: string;
  manually_edited: boolean;
  edited_at: string | null;
}

const COUNTRIES = [
  'Indonesia', 'Thailand', 'Vietnam', 'Nepal', 'Philippines',
  'Cambodia', 'China', 'Mongolia', 'Myanmar', 'Cameroon', 'Liberia',
];

export default function Settings() {
  const [fees, setFees] = useState<ServiceFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [isEn, setIsEn] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFee, setEditFee] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Auth check
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('alerts-auth') !== 'true') {
      window.location.href = '/';
    }
  }, []);

  // Load preferences
  useEffect(() => {
    if (localStorage.getItem('dashboard-theme') === 'dark') setIsDark(true);
    if (localStorage.getItem('dashboard-lang') === 'ko') setIsEn(false);
  }, []);

  const fetchFees = useCallback(async () => {
    try {
      const params = selectedCountry ? `?country=${encodeURIComponent(selectedCountry)}` : '';
      const res = await fetch(`/api/settings/fees${params}`);
      const data = await res.json();
      if (Array.isArray(data)) setFees(data);
    } catch (err) {
      console.error('Failed to fetch fees:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCountry]);

  useEffect(() => {
    setLoading(true);
    fetchFees();
  }, [fetchFees]);

  // Group by country
  const grouped = useMemo(() => {
    const map: Record<string, ServiceFee[]> = {};
    fees.forEach(f => {
      if (!map[f.receiving_country]) map[f.receiving_country] = [];
      map[f.receiving_country].push(f);
    });
    return map;
  }, [fees]);

  function startEdit(fee: ServiceFee) {
    setEditingId(fee.id);
    setEditFee(String(fee.fee_krw));
    setEditNotes(fee.notes ?? '');
  }

  async function handleSave() {
    if (editingId === null) return;
    await fetch('/api/settings/fees', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId,
        fee_krw: Number(editFee),
        notes: editNotes || null,
      }),
    });
    setEditingId(null);
    fetchFees();
  }

  async function handleReset(fee: ServiceFee) {
    // Fetch the latest scraped fee from rate_records
    const res = await fetch('/api/settings/fees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiving_country: fee.receiving_country,
        operator: fee.operator,
        delivery_method: fee.delivery_method,
      }),
    });
    const { scraped_fee } = await res.json();

    const label = scraped_fee != null ? scraped_fee.toLocaleString() : 'unknown';
    if (!confirm(isEn
      ? `Reset ${fee.operator} fee to scraped value (${label} KRW)?`
      : `${fee.operator} 수수료를 스크래핑 값 (${label} KRW)으로 되돌리시겠습니까?`)) return;

    if (scraped_fee == null) return;

    await fetch('/api/settings/fees', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fee.id, fee_krw: scraped_fee, reset: true }),
    });
    fetchFees();
  }

  function formatDate(iso: string | null) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }

  if (typeof window !== 'undefined' && sessionStorage.getItem('alerts-auth') !== 'true') {
    return null;
  }

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 transition-colors">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{isEn ? 'Service Fee Settings' : '수수료 설정'}</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                {isEn ? 'Service fees per operator, auto-updated from scrapers' : '운영사별 수수료, 스크래퍼에서 자동 업데이트'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a href="/" className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {isEn ? 'Home' : '홈'}
              </a>
              <a href="/alerts" className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {isEn ? 'Alerts' : '알림'}
              </a>
            </div>
          </div>

          {/* Country filter */}
          <div>
            <select
              value={selectedCountry}
              onChange={e => setSelectedCountry(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{isEn ? 'All Countries' : '전체 국가'}</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Fee tables grouped by country */}
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              {isEn ? 'No fee data yet. Fees will be populated after the next scraper run.' : '수수료 데이터가 없습니다. 다음 스크래퍼 실행 후 자동으로 채워집니다.'}
            </div>
          ) : (
            Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([country, countryFees]) => (
              <div key={country} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-sm font-semibold">{country}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                        <th className="px-4 py-2.5">{isEn ? 'Operator' : '운영사'}</th>
                        <th className="px-4 py-2.5">{isEn ? 'Delivery Method' : '입금 방식'}</th>
                        <th className="px-4 py-2.5 text-right">{isEn ? 'Fee (KRW)' : '수수료 (KRW)'}</th>
                        <th className="px-4 py-2.5">{isEn ? 'Notes' : '메모'}</th>
                        <th className="px-4 py-2.5">{isEn ? 'Status' : '상태'}</th>
                        <th className="px-4 py-2.5">{isEn ? 'Edited At' : '수정 시간'}</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {countryFees.map(fee => (
                        <tr key={fee.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-2.5 font-medium">{fee.operator}</td>
                          <td className="px-4 py-2.5 text-slate-500">{fee.delivery_method}</td>
                          {editingId === fee.id ? (
                            <>
                              <td className="px-4 py-2.5 text-right">
                                <input
                                  type="number"
                                  value={editFee}
                                  onChange={e => setEditFee(e.target.value)}
                                  className="w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-right"
                                  autoFocus
                                />
                              </td>
                              <td className="px-4 py-2.5">
                                <input
                                  value={editNotes}
                                  onChange={e => setEditNotes(e.target.value)}
                                  placeholder={isEn ? 'Add note...' : '메모 추가...'}
                                  className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                />
                              </td>
                              <td className="px-4 py-2.5 text-xs text-slate-400">{fee.manually_edited ? (isEn ? 'Edited' : '수정됨') : (isEn ? 'Default' : '기본값')}</td>
                              <td className="px-4 py-2.5 text-xs text-slate-400">{fee.manually_edited && fee.edited_at ? formatDate(fee.edited_at) : '-'}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex gap-1">
                                  <button onClick={handleSave} className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                                    {isEn ? 'Save' : '저장'}
                                  </button>
                                  <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                    {isEn ? 'Cancel' : '취소'}
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-2.5 text-right font-mono">{fee.fee_krw.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-slate-400 text-xs">{fee.notes ?? '-'}</td>
                              <td className="px-4 py-2.5 text-xs">
                                {fee.manually_edited ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">{isEn ? 'Edited' : '수정됨'}</span>
                                ) : (
                                  <span className="text-slate-400">{isEn ? 'Default' : '기본값'}</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-slate-400">{fee.manually_edited && fee.edited_at ? formatDate(fee.edited_at) : '-'}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex gap-1">
                                  <button onClick={() => startEdit(fee)} className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                    Edit
                                  </button>
                                  {fee.manually_edited && (
                                    <button onClick={() => handleReset(fee)} className="px-2 py-1 text-xs rounded border border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
                                      Reset
                                    </button>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}

        </div>
      </div>
    </div>
  );
}
