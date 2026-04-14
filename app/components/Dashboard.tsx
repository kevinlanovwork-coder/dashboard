'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from 'recharts';
import type { RateRecord } from '@/app/lib/parseRates';
import * as XLSX from 'xlsx';
import NotificationsPopup from './NotificationsPopup';

// ─── Translations ─────────────────────────────────────────────────────────────

const EN = {
  title: "GME's Competitor Price Comparison Dashboard",
  subtitle: 'Remittance Service Rate Competitiveness Analysis',
  allCountries: 'All Countries',
  latestSnapshot: 'Latest Snapshot',
  receiveBaseline: 'Receive Baseline',
  latestGMEBaseline: 'Latest GME Baseline',
  depositMethod: 'Deposit Method',
  cheaperCompetitors: 'Cheaper Competitors',
  basedOnSnapshot: 'Based on snapshot',
  expensiveCompetitors: 'More Expensive Competitors',
  pricierThanGME: 'Services pricier than GME',
  snapshotTitle: 'Collection Amount',
  snapshotSub: (time: string) => `as of ${time} (KRW, lower is better)`,
  noData: 'No data',
  gmeBaselineLegend: 'GME (baseline)',
  moreExpensiveLegend: 'More expensive than GME',
  cheaperLegend: 'Cheaper than GME',
  rateLegend: (curr: string, perKRW: boolean) => perKRW ? `( ) = Exchange rate (${curr} per 1 KRW)` : `( ) = Exchange rate (KRW per 1 ${curr})`,
  avgDiffTitle: 'Avg. Price Difference by Operator',
  avgDiffSub: (from: string, to: string) => from && to && from !== to ? `Daily avg. from ${from} to ${to} (vs GME, KRW)` : `Daily avg. for ${to || from} (vs GME, KRW)`,
  gmeWins: 'More expensive than GME (GME wins)',
  gmeLoses: 'Cheaper than GME (GME loses)',
  trendTitle: 'Collection Amount Trend',
  trendSub: 'GME vs competitor collection amount over time (KRW)',
  operatorTrendTitle: 'Operator Total Send Trend',
  operatorTrendSub: 'Total send amount over time (KRW)',
  allDates: 'All dates',
  insufficientData: 'Insufficient data',
  dateRangeError: '"From" date must be earlier than "To" date. Please adjust the date range.',
  detailedData: 'Detailed Data',
  records: (n: number) => `${n.toLocaleString()} records`,
  searchOperator: 'Search operator...',
  allStatus: 'All Status',
  allMethods: 'All Methods',
  allDate: 'All Dates',
  allTime: 'All Times',
  tableHeaders: ['Time', 'Operator', 'Method', 'Country', 'Recv. Amount', 'Send Amt (KRW)', 'Service Fee', 'Collection Amt (KRW)', 'GME Baseline', 'Price Gap', 'Rate', 'Status', ''],
  rightAlignHeaders: ['Recv. Amount', 'Send Amt (KRW)', 'Service Fee', 'Collection Amt (KRW)', 'GME Baseline', 'Price Gap', 'Rate'],
  deleteConfirm: (op: string, time: string) => `Delete record for ${op} at ${time}?`,
  deleting: 'Deleting...',
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
  lastAccessed: 'Last accessed',
  countryLabel: 'Country',
  snapshotDate: 'Date',
  snapshotTime: 'Time',
  periodLabel: 'Period',
  latestDate: 'Latest',
  latestTime: 'Latest',
};

const KO = {
  title: 'GME 경쟁사 가격 비교 대시보드',
  subtitle: '해외 송금 서비스 요율 경쟁력 분석',
  allCountries: '전체 국가',
  latestSnapshot: '최신 스냅샷',
  receiveBaseline: '수령 기준액',
  latestGMEBaseline: '최신 GME 기준가',
  depositMethod: '입금 방식',
  cheaperCompetitors: '더 저렴한 경쟁사',
  basedOnSnapshot: '스냅샷 기준',
  expensiveCompetitors: 'GME 우위 경쟁사',
  pricierThanGME: 'GME보다 비싼 서비스',
  snapshotTitle: '수금액',
  snapshotSub: (time: string) => `${time} 기준 (KRW, 낮을수록 유리)`,
  noData: '데이터 없음',
  gmeBaselineLegend: 'GME (기준)',
  moreExpensiveLegend: 'GME보다 비쌈',
  cheaperLegend: 'GME보다 저렴',
  rateLegend: (curr: string, perKRW: boolean) => perKRW ? `( ) = 환율 (1 KRW 기준 ${curr})` : `( ) = 환율 (1 ${curr} 기준 KRW)`,
  avgDiffTitle: '운영사별 평균 가격 차이',
  avgDiffSub: (from: string, to: string) => from && to && from !== to ? `${from} ~ ${to} 일별 평균 (GME 기준, KRW)` : `${to || from} 일별 평균 (GME 기준, KRW)`,
  gmeWins: 'GME보다 비쌈 (GME 유리)',
  gmeLoses: 'GME보다 저렴 (GME 불리)',
  trendTitle: '수금액 추이',
  trendSub: 'GME vs 경쟁사 수금액 변화 (KRW)',
  operatorTrendTitle: '운영사 총 송금액 추이',
  operatorTrendSub: '시간에 따른 총 송금액 변화 (KRW)',
  allDates: '전체 기간',
  insufficientData: '데이터 부족',
  dateRangeError: '"시작" 날짜가 "종료" 날짜보다 이후입니다. 날짜 범위를 조정해주세요.',
  detailedData: '상세 데이터',
  records: (n: number) => `${n.toLocaleString()}건`,
  searchOperator: '운영사 검색...',
  allStatus: '전체 상태',
  allMethods: '전체 방식',
  allDate: '전체 날짜',
  allTime: '전체 시간',
  tableHeaders: ['시간대', '운영사', '입금방식', '국가', '수령액', '송금액 (KRW)', '수수료', '수금액 (KRW)', 'GME 기준가', '가격차이', '환율', '상태', ''],
  rightAlignHeaders: ['수령액', '송금액 (KRW)', '수수료', '수금액 (KRW)', 'GME 기준가', '가격차이', '환율'],
  deleteConfirm: (op: string, time: string) => `${op} (${time}) 기록을 삭제하시겠습니까?`,
  deleting: '삭제 중...',
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
  lastAccessed: '마지막 접속',
  countryLabel: '국가',
  snapshotDate: '날짜',
  snapshotTime: '시간',
  periodLabel: '기간',
  latestDate: '최신',
  latestTime: '최신',
};

type T = typeof EN;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(value: number, t: T) {
  return value.toLocaleString('ko-KR') + t.won;
}

function formatRunHour(runHour: string) {
  const m = runHour.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return runHour;
  return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
}

function formatDate(dateStr: string) {
  // "2026-04-06" → "2026/04/06"
  return dateStr.replace(/-/g, '/');
}

function formatChartLabel(runHour: string) {
  // "2026-04-06 15:30" → "04/06 15:30"
  const m = runHour.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return runHour;
  return `${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
}

function statusLabel(status: string, t: T) {
  if (status === 'GME') return t.statusGME;
  if (status === 'Cheaper than GME') return t.statusCheaper;
  if (status === 'Expensive than GME') return t.statusExpensive;
  return status;
}

function statusColor(status: string) {
  if (status === 'GME') return { bg: 'bg-red-500/20', text: 'text-red-500 dark:text-red-400', hex: '#ef4444' };
  if (status === 'Cheaper than GME') return { bg: 'bg-green-500/20', text: 'text-green-600 dark:text-green-400', hex: '#22c55e' };
  return { bg: 'bg-orange-500/20', text: 'text-orange-500 dark:text-orange-400', hex: '#f97316' };
}

const TREND_COLORS = ['#8b5cf6', '#10b981', '#f59e0b'];  // violet, emerald, amber

/** Currency by country, or by `Country||Method` for corridors where the same country has different currencies per method. */
const CURRENCY_MAP: Record<string, string> = {
  Indonesia: 'IDR', Thailand: 'THB', Vietnam: 'VND', Nepal: 'NPR',
  Philippines: 'PHP',  Malaysia: 'MYR', Singapore: 'SGD', Cambodia: 'USD',
  Japan: 'JPY', China: 'CNY', Mongolia: 'MNT', Myanmar: 'MMK',
  Pakistan: 'PKR', Laos: 'LAK', 'Sri Lanka': 'LKR', India: 'INR',
  'Timor Leste': 'USD', Uzbekistan: 'USD', 'Uzbekistan||Card Payment': 'UZS',
  Bangladesh: 'BDT', Russia: 'RUB', Kazakhstan: 'USD', Kyrgyzstan: 'USD',
  Ghana: 'GHS', 'South Africa': 'ZAR', Canada: 'CAD', Nigeria: 'NGN',
};

const DEPOSIT_METHOD_MAP: Record<string, string | string[]> = {
  Indonesia: 'Bank Deposit', Thailand: 'Bank Deposit', Vietnam: 'Bank Deposit',
  Nepal: 'Bank Deposit', Philippines: ['Bank Deposit', 'Cash Pickup'], Malaysia: 'Bank Deposit',
  Singapore: 'Bank Deposit', Cambodia: ['Bank Deposit', 'Cash Pickup'], Japan: 'Bank Deposit',
  China: 'Alipay', Mongolia: 'Bank Deposit', Myanmar: 'Bank Deposit',
  Pakistan: 'Bank Deposit', Laos: ['Bank Deposit (LAK)', 'Bank Deposit (USD)'], 'Sri Lanka': 'Bank Deposit', India: 'Bank Deposit',
  'Timor Leste': ['Bank Deposit', 'Cash Pickup (MoneyGram)'],
  Uzbekistan: ['Cash Pickup', 'Card Payment'], Bangladesh: 'Bank Deposit', Russia: ['Cash Payment', 'Card Payment'], Kazakhstan: 'Cash Pickup', Kyrgyzstan: 'Cash Pickup',
  Ghana: 'Bank Deposit', 'South Africa': 'Bank Deposit', Canada: 'Bank Deposit', Nigeria: 'Bank Deposit',
};

// Rate is calculated from send_amount_krw (net amount excluding service fee).
// GME API returns collAmt (total) and scCharge (fee) separately;
// send_amount_krw = collAmt - scCharge, so no further adjustment needed.
function rateExchangeKRW(r: RateRecord): number {
  return r.sendAmountKRW;
}

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

interface DashboardProps {
  initialRecords: RateRecord[];
  countries: string[];
  defaultCountry: string;
}

export default function Dashboard({ initialRecords, countries, defaultCountry }: DashboardProps) {
  const [records, setRecords] = useState(initialRecords);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isEn, setIsEn] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);
  const [selectedRunHour, setSelectedRunHour] = useState('all');
  const [snapshotDate, setSnapshotDate] = useState('');
  const [snapshotTime, setSnapshotTime] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [tableStatus, setTableStatus] = useState('all');
  const [tableDate, setTableDate] = useState('all');
  const [tableTime, setTableTime] = useState('all');
  const [tablePage, setTablePage] = useState(0);
  const [tableDeliveryMethod, setTableDeliveryMethod] = useState('all');
  const [pageSize, setPageSize] = useState(20);
  const [snapshotSortDesc, setSnapshotSortDesc] = useState(true);
  const [snapshotHiddenOps, setSnapshotHiddenOps] = useState<Set<string>>(new Set());
  const [avgFromDate, setAvgFromDate] = useState('');
  const [avgToDate, setAvgToDate] = useState('');
  const [avgGapSortDesc, setAvgGapSortDesc] = useState(true);
  const [selectedTrendOperators, setSelectedTrendOperators] = useState<Set<string>>(new Set());
  const [gmeTrendFromDate, setGmeTrendFromDate] = useState('');
  const [gmeTrendToDate, setGmeTrendToDate] = useState('');
  const [operatorTrendFromDate, setOperatorTrendFromDate] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [daysRange, setDaysRange] = useState(3);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedDeliveryMethod, setSelectedDeliveryMethod] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [lastAccessed, setLastAccessed] = useState<Date | null>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const detailedDataRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = pageSize;

  const t = isEn ? EN : KO;

  // Persist theme preference
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-theme');
    if (saved === 'dark') setIsDark(true);

    // Restore session if not expired; auto-logout when 8-hour timer hits
    const expires = Number(localStorage.getItem('alerts-auth-expires') ?? 0);
    const valid = localStorage.getItem('alerts-auth') === 'true' && Date.now() < expires;
    if (valid) {
      setIsLoggedIn(true);
      const timer = setTimeout(() => {
        localStorage.removeItem('alerts-auth');
        localStorage.removeItem('alerts-auth-expires');
        setIsLoggedIn(false);
      }, expires - Date.now());
      return () => clearTimeout(timer);
    } else if (localStorage.getItem('alerts-auth')) {
      localStorage.removeItem('alerts-auth');
      localStorage.removeItem('alerts-auth-expires');
    }
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

  // Persist selected country & fetch data on change
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-country');
    if (saved && saved !== defaultCountry) {
      setSelectedCountry(saved);
    }
  }, [defaultCountry]);
  useEffect(() => {
    localStorage.setItem('dashboard-country', selectedCountry);
  }, [selectedCountry]);

  // Set initial last-accessed time on client mount (avoids hydration mismatch)
  useEffect(() => { setLastAccessed(new Date()); }, []);

  // Fetch data when country or date range changes
  useEffect(() => {
    if (selectedCountry === defaultCountry && daysRange === 3) {
      setRecords(initialRecords);
      return;
    }
    let cancelled = false;
    setIsLoadingRecords(true);
    setRecords([]);
    fetch(`/api/rates?country=${encodeURIComponent(selectedCountry)}&days=${daysRange}`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        if (!cancelled) { setRecords(data); setLastAccessed(new Date()); }
      })
      .catch(err => console.error('Failed to fetch rates:', err))
      .finally(() => { if (!cancelled) setIsLoadingRecords(false); });
    return () => { cancelled = true; };
  }, [selectedCountry, daysRange, defaultCountry, initialRecords]);

  function handleRefresh() {
    setIsLoadingRecords(true);
    fetch(`/api/rates?country=${encodeURIComponent(selectedCountry)}&days=${daysRange}`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => { setRecords(data); setLastAccessed(new Date()); setSnapshotDate(''); setSnapshotTime(''); })
      .catch(err => console.error('Failed to fetch rates:', err))
      .finally(() => setIsLoadingRecords(false));
  }

  async function handleDelete(r: RateRecord) {
    if (!confirm(t.deleteConfirm(r.operator, formatRunHour(r.runHour)))) return;
    setDeletingId(r.id);
    try {
      const res = await fetch('/api/rates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setRecords(prev => prev.filter(rec => rec.id !== r.id));
    } catch (err) {
      console.error('Delete failed:', err);
      alert(String(err));
    } finally {
      setDeletingId(null);
    }
  }

  // Close country dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target as Node)) {
        setCountryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const ct = {
    grid:     isDark ? '#1e293b' : '#e2e8f0',
    tick:     isDark ? '#64748b' : '#94a3b8',
    axisLine: isDark ? '#1e293b' : '#e2e8f0',
    yLabel:   isDark ? '#cbd5e1' : '#475569',
    refLine:  isDark ? '#334155' : '#cbd5e1',
  };

  // Delivery method support for corridors with non-default methods (e.g. China: Alipay)
  const deliveryMethods = useMemo(() => {
    const methods = DEPOSIT_METHOD_MAP[selectedCountry];
    if (Array.isArray(methods)) return methods;
    return [methods ?? 'Bank Deposit'];
  }, [selectedCountry]);

  const hasMultipleMethods = deliveryMethods.length > 1;

  useEffect(() => {
    setSelectedDeliveryMethod(
      deliveryMethods.includes('Bank Deposit') ? 'Bank Deposit' : deliveryMethods[0]
    );
  }, [deliveryMethods]);

  const filteredCountries = useMemo(
    () => countrySearch
      ? countries.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()))
      : countries,
    [countries, countrySearch]
  );

  // All records are already filtered for the selected country; additionally filter by delivery method for multi-method corridors
  const byCountry = useMemo(() => {
    if (!hasMultipleMethods || !selectedDeliveryMethod) return records;
    return records.filter(r => r.deliveryMethod === selectedDeliveryMethod);
  }, [records, hasMultipleMethods, selectedDeliveryMethod]);

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

  // Snapshot date/time lists (similar to Detailed Data filters)
  const snapshotDates = useMemo(
    () => [...new Set(runHours.map(rh => rh.slice(0, 10)))].sort().reverse(),
    [runHours]
  );
  const snapshotTimes = useMemo(() => {
    const filtered = snapshotDate
      ? runHours.filter(rh => rh.slice(0, 10) === snapshotDate)
      : runHours;
    return [...filtered].reverse();
  }, [runHours, snapshotDate]);

  // Auto-select latest date/time when data loads or country changes
  useEffect(() => {
    if (latestRunHour && (!snapshotDate || !snapshotTime)) {
      setSnapshotDate(latestRunHour.slice(0, 10));
      setSnapshotTime(latestRunHour);
    }
  }, [latestRunHour, snapshotDate, snapshotTime]);

  // Sync selectedRunHour from snapshotDate + snapshotTime
  useEffect(() => {
    if (!snapshotDate && !snapshotTime) {
      setSelectedRunHour('all');
    } else if (snapshotTime) {
      setSelectedRunHour(snapshotTime);
    } else if (snapshotDate) {
      const timesForDate = runHours.filter(rh => rh.slice(0, 10) === snapshotDate);
      setSelectedRunHour(timesForDate[timesForDate.length - 1] ?? 'all');
    }
  }, [snapshotDate, snapshotTime, runHours]);

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
        ? (() => { const exKRW = rateExchangeKRW(r); const raw = r.receiveAmount / exKRW; return parseFloat((raw >= 1 ? raw : exKRW / r.receiveAmount).toFixed(2)); })()
        : null,
      rateIsPerKRW: r.sendAmountKRW > 0
        ? (() => { const exKRW = rateExchangeKRW(r); return r.receiveAmount / exKRW >= 1; })()
        : false,
    })),
    [snapshot]
  );

  // Build a rate lookup map for Y-axis tick rendering
  const snapshotRateMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    snapshotChartData.forEach(r => { map[r.operator] = r.displayRate; });
    return map;
  }, [snapshotChartData]);

  const filteredSnapshotData = useMemo(
    () => snapshotChartData.filter(r => r.operator === 'GME' || !snapshotHiddenOps.has(r.operator)),
    [snapshotChartData, snapshotHiddenOps]
  );

  // Unique operators in the snapshot (for checkbox list)
  const snapshotOperators = useMemo(() => {
    const seen = new Set<string>();
    return snapshotChartData.filter(r => {
      if (seen.has(r.operator)) return false;
      seen.add(r.operator);
      return true;
    }).map(r => ({ operator: r.operator, status: r.status }));
  }, [snapshotChartData]);

  const avgDates = useMemo(
    () => [...new Set(byCountry.map(r => r.runHour.slice(0, 10)))].sort(),
    [byCountry]
  );

  const effectiveAvgFromDate = avgFromDate && avgDates.includes(avgFromDate) ? avgFromDate : '';
  const effectiveAvgToDate = avgToDate && avgDates.includes(avgToDate) ? avgToDate : avgDates[avgDates.length - 1] ?? '';

  const operatorStats = useMemo(() => {
    const map: Record<string, { gaps: number[]; count: number }> = {};
    byCountry
      .filter(r => {
        if (r.status === 'GME' || r.priceGap === null) return false;
        const d = r.runHour.slice(0, 10);
        if (effectiveAvgFromDate && d < effectiveAvgFromDate) return false;
        if (effectiveAvgToDate && d > effectiveAvgToDate) return false;
        return true;
      })
      .forEach(r => {
        if (!map[r.operator]) map[r.operator] = { gaps: [], count: 0 };
        map[r.operator].gaps.push(r.priceGap!);
        map[r.operator].count++;
      });
    const stats = Object.entries(map)
      .map(([operator, { gaps, count }]) => ({
        operator,
        avgGap: Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length),
        count,
      }));
    // Add GME as a zero-baseline reference
    if (stats.length > 0) {
      stats.push({ operator: 'GME', avgGap: 0, count: 0 });
    }
    return stats.sort((a, b) => avgGapSortDesc
      ? b.avgGap - a.avgGap
      : a.avgGap - b.avgGap);
  }, [byCountry, effectiveAvgFromDate, effectiveAvgToDate, avgGapSortDesc]);

  const trendData = useMemo(() => {
    const map: Record<string, number> = {};
    byCountry
      .filter(r => r.gmeBaseline !== null && r.gmeBaseline > 0)
      .forEach(r => {
        if (!map[r.runHour]) map[r.runHour] = r.gmeBaseline!;
      });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([runHour, gmeBaseline]) => ({ runHour, label: formatChartLabel(runHour), gmeBaseline }));
  }, [byCountry]);

  const gmeTrendDates = useMemo(
    () => [...new Set(trendData.map(d => d.runHour.slice(0, 10)))].sort().reverse(),
    [trendData]
  );

  const effectiveGmeTrendFromDate = gmeTrendDates.includes(gmeTrendFromDate) ? gmeTrendFromDate : '';
  const effectiveGmeTrendToDate = gmeTrendDates.includes(gmeTrendToDate) ? gmeTrendToDate : '';

  const trendOperators = useMemo(
    () => [...new Set(byCountry.filter(r => r.status !== 'GME').map(r => r.operator))].sort(),
    [byCountry]
  );

  const effectiveTrendOperators = useMemo(
    () => new Set([...selectedTrendOperators].filter(op => trendOperators.includes(op))),
    [selectedTrendOperators, trendOperators]
  );

  // Combined trend: GME baseline + selected operators overlaid
  const combinedTrendData = useMemo(() => {
    const opMaps: Record<string, Record<string, number>> = {};
    for (const op of effectiveTrendOperators) {
      const map: Record<string, number> = {};
      byCountry
        .filter(r => r.operator === op && r.totalSendingAmount > 0)
        .forEach(r => { if (!map[r.runHour]) map[r.runHour] = r.totalSendingAmount; });
      opMaps[op] = map;
    }
    return trendData.map(d => {
      const extra: Record<string, number | null> = {};
      for (const op of effectiveTrendOperators) {
        extra[`op_${op}`] = opMaps[op]?.[d.runHour] ?? null;
      }
      return { ...d, ...extra };
    });
  }, [trendData, byCountry, effectiveTrendOperators]);

  const filteredTrendData = useMemo(
    () => combinedTrendData.filter(d => {
      if (effectiveGmeTrendFromDate && d.runHour < effectiveGmeTrendFromDate) return false;
      if (effectiveGmeTrendToDate && d.runHour > effectiveGmeTrendToDate + 'T23:59') return false;
      return true;
    }),
    [combinedTrendData, effectiveGmeTrendFromDate, effectiveGmeTrendToDate]
  );

  const operatorTrendData = useMemo(() => {
    if (effectiveTrendOperators.size === 0) return [];
    const firstOp = [...effectiveTrendOperators][0];
    const map: Record<string, number> = {};
    byCountry
      .filter(r => r.operator === firstOp && r.totalSendingAmount > 0)
      .forEach(r => { if (!map[r.runHour]) map[r.runHour] = r.totalSendingAmount; });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([runHour, totalSendingAmount]) => ({ runHour, label: formatChartLabel(runHour), totalSendingAmount }));
  }, [byCountry, effectiveTrendOperators]);

  const operatorTrendDates = useMemo(
    () => [...new Set(operatorTrendData.map(d => d.runHour.slice(0, 10)))].sort().reverse(),
    [operatorTrendData]
  );

  const effectiveOperatorTrendFromDate = operatorTrendDates.includes(operatorTrendFromDate) ? operatorTrendFromDate : '';

  const filteredOperatorTrendData = useMemo(
    () => effectiveOperatorTrendFromDate
      ? operatorTrendData.filter(d => d.runHour >= effectiveOperatorTrendFromDate)
      : operatorTrendData,
    [operatorTrendData, effectiveOperatorTrendFromDate]
  );

  const latestGMEBaseline = trendData[trendData.length - 1]?.gmeBaseline ?? null;
  const cheaperCount = snapshot.filter(r => r.status === 'Cheaper than GME').length;
  const expensiveCount = snapshot.filter(r => r.status === 'Expensive than GME').length;
  const totalCompetitors = snapshot.filter(r => r.status !== 'GME').length;
  const receiveBaseline = byCountry[0]?.receiveAmount ?? null;
  const receiveCurrency = (() => {
    if (selectedDeliveryMethod) {
      const override = CURRENCY_MAP[`${selectedCountry}||${selectedDeliveryMethod}`];
      if (override) return override;
      const m = selectedDeliveryMethod.match(/\(([A-Z]{3})\)/);
      if (m) return m[1];
    }
    return CURRENCY_MAP[selectedCountry] ?? '';
  })();

  const tableDates = useMemo(
    () => [...new Set(runHours.map(rh => rh.slice(0, 10)))].sort().reverse(),
    [runHours]
  );

  const tableTimes = useMemo(
    () => {
      const filtered = tableDate === 'all'
        ? runHours
        : runHours.filter(rh => rh.slice(0, 10) === tableDate);
      return [...filtered].reverse();
    },
    [runHours, tableDate]
  );

  const tableDeliveryMethods = useMemo(
    () => [...new Set(byCountry.map(r => r.deliveryMethod).filter(Boolean))].sort(),
    [byCountry]
  );

  const tableData = useMemo(() => {
    let data = byCountry;
    if (tableSearch) {
      const q = tableSearch.toLowerCase();
      data = data.filter(r => r.operator.toLowerCase().includes(q));
    }
    if (tableStatus !== 'all') {
      data = data.filter(r => r.status === tableStatus);
    }
    if (tableDeliveryMethod !== 'all') {
      data = data.filter(r => r.deliveryMethod === tableDeliveryMethod);
    }
    if (tableDate !== 'all') {
      data = data.filter(r => r.runHour.slice(0, 10) === tableDate);
    }
    if (tableTime !== 'all') {
      data = data.filter(r => r.runHour === tableTime);
    }
    return [...data].sort((a, b) => b.runHour.localeCompare(a.runHour));
  }, [byCountry, tableSearch, tableStatus, tableDeliveryMethod, tableDate, tableTime]);

  const totalPages = Math.ceil(tableData.length / PAGE_SIZE);

  const jumpToDetailedData = (runHour: string, operator?: string) => {
    const date = runHour.slice(0, 10);
    const time = runHour;
    setTableDate(date);
    setTableTime(time);
    if (operator) setTableSearch(operator);
    setTableStatus('all');
    setTablePage(0);
    setTimeout(() => detailedDataRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  function handleDownloadXlsx() {
    const rows = tableData.map(r => ({
      Time: formatRunHour(r.runHour),
      Operator: r.operator,
      Method: r.deliveryMethod ?? 'Bank Deposit',
      Country: r.receivingCountry,
      'Recv. Amount': r.receiveAmount,
      Currency: CURRENCY_MAP[`${r.receivingCountry}||${r.deliveryMethod}`] ?? r.deliveryMethod?.match(/\(([A-Z]{3})\)/)?.[1] ?? CURRENCY_MAP[r.receivingCountry] ?? '',
      'Send Amt (KRW)': r.sendAmountKRW,
      'Service Fee': r.serviceFee,
      'Collection Amt (KRW)': r.totalSendingAmount,
      'GME Baseline': r.gmeBaseline ?? '',
      'Price Gap': r.priceGap ?? '',
      Rate: r.sendAmountKRW > 0
        ? (() => { const exKRW = rateExchangeKRW(r); const raw = r.receiveAmount / exKRW; return parseFloat((raw >= 1 ? raw : exKRW / r.receiveAmount).toFixed(4)); })()
        : '',
      Status: r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `GME_${selectedCountry}_${date}.xlsx`);
  }

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">

        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img src="/GME_swirl_icon.png" alt="GME" className="h-8 shrink-0" />
              <div>
                <h1 className="text-lg font-bold tracking-tight">{t.title}</h1>
                <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5">{t.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Summary link (public) */}
              <a href="/summary" className="px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                {isEn ? 'Summary' : '전체 요약'}
              </a>

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
                  한
                </button>
              </div>

              {/* Dark / Light toggle */}
              <button
                onClick={() => setIsDark(d => !d)}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                title={isDark ? t.lightModeTitle : t.darkModeTitle}
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
              </button>

              {/* Auth: Login / Settings + Logout */}
              {isLoggedIn ? (
                <>
                  <a href="/settings" className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                    {isEn ? 'Settings' : '설정'}
                  </a>
                  <NotificationsPopup isEn={isEn} />
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button
                    onClick={() => {
                      if (!confirm(isEn ? 'Are you sure you want to logout?' : '로그아웃 하시겠습니까?')) return;
                      localStorage.removeItem('alerts-auth');
                      localStorage.removeItem('alerts-auth-expires');
                      setIsLoggedIn(false);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    {isEn ? 'Logout' : '로그아웃'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      alert(isEn ? 'You need to login' : '로그인이 필요합니다');
                      setLoginUser(''); setLoginPass(''); setLoginError(''); setShowLoginModal(true);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    {isEn ? 'Settings' : '설정'}
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button
                    onClick={() => { setLoginUser(''); setLoginPass(''); setLoginError(''); setShowLoginModal(true); }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {isEn ? 'Login' : '로그인'}
                  </button>
                </>
              )}
            </div>
          </div>
          {/* Filter bar */}
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 pb-3 pt-1 flex items-end gap-4 flex-wrap">
            {/* Country */}
            <div>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.countryLabel}</span>
              <div ref={countryDropdownRef} className="relative">
                <button
                  onClick={() => { setCountryDropdownOpen(o => !o); setCountrySearch(''); }}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between gap-1.5 min-w-[140px]"
                >
                  <span>{selectedCountry}</span>
                  <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${countryDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {countryDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-52 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="p-1.5">
                      <input
                        type="text"
                        placeholder={isEn ? 'Search country...' : '국가 검색...'}
                        value={countrySearch}
                        onChange={e => setCountrySearch(e.target.value)}
                        autoFocus
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <ul className="max-h-56 overflow-y-auto py-1">
                      {filteredCountries.map(c => (
                        <li key={c}>
                          <button
                            onClick={() => { setSelectedCountry(c); setSelectedRunHour('all'); setSnapshotDate(''); setSnapshotTime(''); setTablePage(0); setTableSearch(''); setTableStatus('all'); setTableDeliveryMethod('all'); setTableDate('all'); setTableTime('all'); setSnapshotHiddenOps(new Set()); setCountryDropdownOpen(false); }}
                            className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${c === selectedCountry ? 'bg-blue-500 text-white' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                          >
                            {c}
                          </button>
                        </li>
                      ))}
                      {filteredCountries.length === 0 && (
                        <li className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">{t.noData}</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Deposit Method */}
            <div>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.depositMethod}</span>
              <select
                value={selectedDeliveryMethod}
                onChange={e => setSelectedDeliveryMethod(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {deliveryMethods.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Snapshot Date */}
            <div>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.snapshotDate}</span>
              <select
                value={snapshotDate}
                onChange={e => {
                  const newDate = e.target.value;
                  setSnapshotDate(newDate);
                  const timesForDate = runHours.filter(rh => rh.slice(0, 10) === newDate);
                  const latestTime = timesForDate[timesForDate.length - 1] ?? '';
                  setSnapshotTime(latestTime);
                }}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {snapshotDates.map(d => (
                  <option key={d} value={d}>{formatDate(d)}</option>
                ))}
              </select>
            </div>

            {/* Snapshot Time */}
            <div>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.snapshotTime}</span>
              <select
                value={snapshotTime}
                onChange={e => setSnapshotTime(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {snapshotTimes.map(rh => (
                  <option key={rh} value={rh}>{rh.slice(11, 16)}</option>
                ))}
              </select>
            </div>

            {/* Period */}
            <div>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.periodLabel}</span>
              <select
                value={daysRange}
                onChange={e => setDaysRange(Number(e.target.value))}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={3}>{isEn ? '3 days' : '3일'}</option>
                <option value={7}>{isEn ? '7 days' : '7일'}</option>
                <option value={14}>{isEn ? '14 days' : '14일'}</option>
                <option value={30}>{isEn ? '30 days' : '30일'}</option>
                <option value={60}>{isEn ? '60 days' : '60일'}</option>
                <option value={90}>{isEn ? '90 days' : '90일'}</option>
              </select>
            </div>

            {/* Last accessed — right aligned */}
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              {isLoadingRecords && (
                <span>{isEn ? 'Loading...' : '로딩 중...'}</span>
              )}
              <span>{t.lastAccessed}: {lastAccessed ? `${lastAccessed.getFullYear()}/${String(lastAccessed.getMonth() + 1).padStart(2, '0')}/${String(lastAccessed.getDate()).padStart(2, '0')} ${String(lastAccessed.getHours()).padStart(2, '0')}:${String(lastAccessed.getMinutes()).padStart(2, '0')}:${String(lastAccessed.getSeconds()).padStart(2, '0')}` : '--'}</span>
              <button
                onClick={handleRefresh}
                disabled={isLoadingRecords}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                title={isEn ? 'Refresh data' : '데이터 새로고침'}
              >
                <svg className={`h-3.5 w-3.5 ${isLoadingRecords ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.356v4.992" /></svg>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left group — aligns with Snapshot Comparison below */}
            <div className="grid grid-cols-2 gap-3">
              <KPICard
                title={t.receiveBaseline}
                value={receiveBaseline ? `${receiveBaseline.toLocaleString()} ${receiveCurrency}` : '-'}
                sub={selectedDeliveryMethod || deliveryMethods[0]}
              />
              <KPICard
                title={t.latestGMEBaseline}
                value={latestGMEBaseline ? `${latestGMEBaseline.toLocaleString('ko-KR')}${t.won}` : '-'}
                sub={latestRunHour ? formatRunHour(latestRunHour) : ''}
                color="text-blue-600 dark:text-blue-400"
              />
            </div>
            {/* Right group — aligns with Avg Price Difference below */}
            <div className="grid grid-cols-2 gap-3">
              <KPICard
                title={t.cheaperCompetitors}
                value={`${cheaperCount} / ${totalCompetitors}`}
                sub={cheaperCount > totalCompetitors / 2
                  ? (isEn ? 'Majority beating GME' : '과반수가 GME보다 저렴')
                  : (isEn ? 'GME is competitive' : 'GME 경쟁력 우위')}
                color={cheaperCount > totalCompetitors / 2 ? 'text-orange-500 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}
              />
              <KPICard
                title={t.expensiveCompetitors}
                value={`${expensiveCount} / ${totalCompetitors}`}
                sub={expensiveCount > totalCompetitors / 2
                  ? (isEn ? 'GME is competitive' : 'GME 경쟁력 우위')
                  : (isEn ? 'Few pricier than GME' : 'GME보다 비싼 경쟁사 적음')}
                color={expensiveCount > totalCompetitors / 2 ? 'text-green-600 dark:text-green-400' : 'text-orange-500 dark:text-orange-400'}
              />
            </div>
          </div>

          {/* Snapshot + Avg Gap */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Snapshot */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">{t.snapshotTitle} - {selectedCountry} ({selectedDeliveryMethod || deliveryMethods[0]})</h2>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-slate-500 dark:text-slate-500 text-xs">{t.snapshotSub(formatRunHour(targetRunHour))}</p>
                  <span className="text-xs text-slate-500 dark:text-slate-500">{t.rateLegend(receiveCurrency, snapshotChartData[0]?.rateIsPerKRW ?? false)}</span>
                </div>
              </div>
              {/* Operator checkboxes (GME always shown) */}
              {snapshotOperators.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer text-slate-500 dark:text-slate-400 font-medium">
                    <input
                      type="checkbox"
                      checked={snapshotHiddenOps.size === 0}
                      onChange={() => setSnapshotHiddenOps(prev => prev.size === 0 ? new Set(snapshotOperators.filter(o => o.operator !== 'GME').map(o => o.operator)) : new Set())}
                      className="rounded"
                    />
                    All
                  </label>
                  {snapshotOperators.filter(o => o.operator !== 'GME').map(({ operator }) => (
                    <label key={operator} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!snapshotHiddenOps.has(operator)}
                        onChange={() => setSnapshotHiddenOps(prev => {
                          const next = new Set(prev);
                          if (next.has(operator)) next.delete(operator); else next.add(operator);
                          return next;
                        })}
                        className="rounded"
                      />
                      <span className="text-slate-600 dark:text-slate-300">{operator}</span>
                    </label>
                  ))}
                </div>
              )}
              {filteredSnapshotData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(300, filteredSnapshotData.length * 38)}>
                  <BarChart data={filteredSnapshotData} layout="vertical" margin={{ top: 0, right: 70, left: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[(min: number) => Math.floor((min * 0.998) / 1000) * 1000, (max: number) => Math.ceil((max * 1.002) / 1000) * 1000]}
                      tickFormatter={v => `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })}K`}
                      tick={{ fill: ct.tick, fontSize: 11 }}
                      axisLine={{ stroke: ct.axisLine }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="operator"
                      tick={(props: { x: string | number; y: string | number; payload: { value: string } }) => {
                        const isGME = props.payload.value === 'GME';
                        const rate = snapshotRateMap[props.payload.value];
                        const label = isGME ? '★ GME' : props.payload.value;
                        const rateStr = rate != null ? ` (${rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : '';
                        return (
                          <text x={props.x} y={props.y} dy={4} textAnchor="end" fontSize={11}
                            fill={isGME ? '#ef4444' : ct.yLabel}
                            fontWeight={isGME ? 700 : 400}
                          >
                            {label}{rateStr}
                          </text>
                        );
                      }}
                      axisLine={false}
                      tickLine={false}
                      width={155}
                    />
                    <Tooltip content={(props) => <SnapshotTooltip {...props} t={t} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    {snapshotGMEBaseline && (
                      <ReferenceLine
                        x={snapshotGMEBaseline}
                        stroke="#ef4444"
                        strokeDasharray="5 3"
                      />
                    )}
                    <Bar dataKey="totalSendingAmount" radius={[0, 4, 4, 0]}>
                      {filteredSnapshotData.map((entry, i) => (
                        <Cell key={i} fill={statusColor(entry.status).hex} />
                      ))}
                      <LabelList
                        content={(props) => {
                          const { x, y, width, height, index } = props as { x?: string | number; y?: string | number; width?: string | number; height?: string | number; index?: number };
                          const nx = Number(x), ny = Number(y), nw = Number(width), nh = Number(height);
                          if (isNaN(nx) || index == null) return null;
                          const entry = filteredSnapshotData[index];
                          if (!entry) return null;
                          const labelX = nx + nw + 4;
                          if (entry.status === 'GME') {
                            return (
                              <text x={labelX} y={ny + nh / 2} dy={4} fontSize={10} fill="#ef4444" fontWeight={700} textAnchor="start">
                                GME
                              </text>
                            );
                          }
                          const gap = entry.priceGap;
                          if (gap == null || gap === 0) return null;
                          const label = `${gap > 0 ? '+' : ''}${gap.toLocaleString('ko-KR')}`;
                          return (
                            <text x={labelX} y={ny + nh / 2} dy={4} fontSize={10} fill={isDark ? '#f1f5f9' : '#1e293b'} fontWeight={700} textAnchor="start">
                              {label}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-72 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">{t.noData}</div>
              )}
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />{t.gmeBaselineLegend}</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />{t.moreExpensiveLegend}</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />{t.cheaperLegend}</span>
                <button
                  onClick={() => setSnapshotSortDesc(d => !d)}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  {snapshotSortDesc ? '↓ Most Expensive' : '↑ Least Expensive'}
                </button>
              </div>
            </div>

            {/* Avg Gap */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold">{t.avgDiffTitle}</h2>
                  <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5">{t.avgDiffSub(formatDate(effectiveAvgFromDate || avgDates[0] || ''), formatDate(effectiveAvgToDate || avgDates[avgDates.length - 1] || ''))}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 text-xs">
                    <select value={avgFromDate} onChange={e => setAvgFromDate(e.target.value)} className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">{isEn ? 'From' : '시작'}</option>
                      {[...avgDates].reverse().map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
                    </select>
                    <span className="text-slate-400">~</span>
                    <select value={avgToDate} onChange={e => setAvgToDate(e.target.value)} className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">{isEn ? 'To' : '종료'}</option>
                      {[...avgDates].reverse().map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              {/* Spacer to align chart start with snapshot (matches checkbox row height) */}
              {snapshotOperators.length > 0 && <div className="mb-3" style={{ height: '24px' }} />}
              {operatorStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(300, operatorStats.length * 38)}>
                  <BarChart data={operatorStats} layout="vertical" margin={{ top: 0, right: 70, left: 5, bottom: 0 }}>
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
                      tick={(props: { x: string | number; y: string | number; payload: { value: string } }) => {
                        const isGME = props.payload.value === 'GME';
                        return (
                          <text x={props.x} y={props.y} dy={4} textAnchor="end" fontSize={12}
                            fill={isGME ? '#ef4444' : ct.yLabel}
                            fontWeight={isGME ? 700 : 400}
                          >
                            {isGME ? '★ GME' : props.payload.value}
                          </text>
                        );
                      }}
                      axisLine={false}
                      tickLine={false}
                      width={90}
                    />
                    <Tooltip content={(props) => <GapTooltip {...props} t={t} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <ReferenceLine x={0} stroke={ct.refLine} strokeWidth={1.5} label={{ value: 'GME', position: 'top', fill: '#ef4444', fontSize: 11, fontWeight: 700 }} />
                    <Bar dataKey="avgGap" radius={[0, 4, 4, 0]}>
                      {operatorStats.map((entry, i) => (
                        <Cell key={i} fill={entry.operator === 'GME' ? '#ef4444' : entry.avgGap < 0 ? '#22c55e' : '#f97316'} />
                      ))}
                      <LabelList
                        dataKey="avgGap"
                        content={(props) => {
                          const { x, y, width, height, value } = props as { x?: string | number; y?: string | number; width?: string | number; height?: string | number; value?: string | number };
                          const nx = Number(x), ny = Number(y), nw = Number(width), nh = Number(height), nv = Number(value);
                          if (isNaN(nv) || isNaN(nx)) return null;
                          const label = `${nv > 0 ? '+' : ''}${nv.toLocaleString('ko-KR')}`;
                          const labelX = nw >= 0 ? nx + nw + 4 : nx + 4;
                          return (
                            <text x={labelX} y={ny + nh / 2} dy={4} fontSize={10} fill={isDark ? '#f1f5f9' : '#1e293b'} fontWeight={700} textAnchor="start">
                              {label}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : effectiveAvgFromDate && effectiveAvgToDate && effectiveAvgFromDate > effectiveAvgToDate ? (
                <div className="h-72 flex items-center justify-center text-orange-500 dark:text-orange-400 text-sm">{t.dateRangeError}</div>
              ) : (
                <div className="h-72 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">{t.noData}</div>
              )}
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />{t.gmeWins}</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />{t.gmeLoses}</span>
                <button
                  onClick={() => setAvgGapSortDesc(d => !d)}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  {avgGapSortDesc ? '↓ Most Expensive' : '↑ Least Expensive'}
                </button>
              </div>
            </div>
          </div>

          {/* GME Trend + Operator Overlay */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">{t.trendTitle}</h2>
                <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5">{t.trendSub}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 text-xs">
                  <select value={gmeTrendFromDate} onChange={e => setGmeTrendFromDate(e.target.value)} className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">{isEn ? 'From' : '시작'}</option>
                    {gmeTrendDates.map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
                  </select>
                  <span className="text-slate-400">~</span>
                  <select value={gmeTrendToDate} onChange={e => setGmeTrendToDate(e.target.value)} className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">{isEn ? 'To' : '종료'}</option>
                    {gmeTrendDates.map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {/* Operator checkboxes (max 3) */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
              {trendOperators.map(op => {
                const checked = selectedTrendOperators.has(op);
                const disabled = !checked && selectedTrendOperators.size >= 3;
                const sortedOps = [...effectiveTrendOperators];
                const colorIdx = sortedOps.indexOf(op);
                const dotColor = colorIdx >= 0 ? TREND_COLORS[colorIdx] : '#94a3b8';
                return (
                  <label key={op} className={`flex items-center gap-1 text-xs cursor-pointer select-none ${disabled ? 'opacity-40' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => {
                        const next = new Set(selectedTrendOperators);
                        if (next.has(op)) next.delete(op); else next.add(op);
                        setSelectedTrendOperators(next);
                      }}
                      className="rounded w-3 h-3 accent-blue-500"
                    />
                    <span className="text-slate-600 dark:text-slate-300">{op}</span>
                  </label>
                );
              })}
              {selectedTrendOperators.size >= 3 && (
                <span className="text-[10px] text-slate-400 ml-1">({isEn ? 'max 3' : '최대 3'})</span>
              )}
            </div>
            {filteredTrendData.length > 1 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={filteredTrendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  onClick={(e: Record<string, unknown>) => { const p = (e?.activePayload as Array<{ payload: { runHour?: string } }>)?.[0]; if (p?.payload?.runHour) jumpToDetailedData(p.payload.runHour); }}
                  style={{ cursor: 'pointer' }}
                >
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
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm shadow-xl">
                          <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">{label}</p>
                          {payload.map((p, i) => (
                            <p key={i} className="font-mono" style={{ color: p.color }}>
                              {p.name === 'gmeBaseline' ? 'GME' : String(p.name ?? '').replace(/^op_/, '')}: {formatKRW(p.value as number, t)}
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="gmeBaseline"
                    name="gmeBaseline"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', r: 2, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#f87171', strokeWidth: 0 }}
                  />
                  {[...effectiveTrendOperators].map((op, i) => (
                    <Line
                      key={op}
                      type="monotone"
                      dataKey={`op_${op}`}
                      name={op}
                      stroke={TREND_COLORS[i % TREND_COLORS.length]}
                      strokeWidth={2}
                      dot={{ fill: TREND_COLORS[i % TREND_COLORS.length], r: 2, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: TREND_COLORS[i % TREND_COLORS.length], strokeWidth: 0 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : effectiveGmeTrendFromDate && effectiveGmeTrendToDate && effectiveGmeTrendFromDate > effectiveGmeTrendToDate ? (
              <div className="h-48 flex items-center justify-center text-orange-500 dark:text-orange-400 text-sm">{t.dateRangeError}</div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">{t.insufficientData}</div>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-500 flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />GME</span>
              {[...effectiveTrendOperators].map((op, i) => (
                <span key={op} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: TREND_COLORS[i % TREND_COLORS.length] }} />{op}
                </span>
              ))}
            </div>
          </div>

          {/* Data Table */}
          <div ref={detailedDataRef} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{t.detailedData}</h2>
                  <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5">{t.records(tableData.length)}</p>
                </div>
                <button
                  onClick={handleDownloadXlsx}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  {isEn ? 'Download XLS' : 'XLS 다운로드'}
                </button>
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
                {tableDeliveryMethods.length > 1 && (
                  <select
                    value={tableDeliveryMethod}
                    onChange={e => { setTableDeliveryMethod(e.target.value); setTablePage(0); }}
                    className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">{t.allMethods}</option>
                    {tableDeliveryMethods.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                <select
                  value={tableDate}
                  onChange={e => { setTableDate(e.target.value); setTableTime('all'); setTablePage(0); }}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">{t.allDate}</option>
                  {tableDates.map(d => (
                    <option key={d} value={d}>{formatDate(d)}</option>
                  ))}
                </select>
                <select
                  value={tableTime}
                  onChange={e => { setTableTime(e.target.value); setTablePage(0); }}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">{t.allTime}</option>
                  {tableTimes.map(rh => (
                    <option key={rh} value={rh}>{rh.slice(11)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    {t.tableHeaders.map(h => (
                      <th key={h} className={`py-2.5 px-3 text-slate-500 dark:text-slate-500 font-medium text-xs ${t.rightAlignHeaders.includes(h) ? 'text-center' : h === t.tableHeaders[t.tableHeaders.length - 1] || h === 'Status' || h === '상태' ? 'text-center' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE).map((r) => {
                    const sc = statusColor(r.status);
                    return (
                      <tr key={r.id} className="border-b border-slate-200 dark:border-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">{formatRunHour(r.runHour)}</td>
                        <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.operator}</td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">{r.deliveryMethod ?? 'Bank Deposit'}</td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.receivingCountry}</td>
                        <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-200 font-mono whitespace-nowrap">
                          {r.receiveAmount.toLocaleString()}&nbsp;<span className="text-slate-400 dark:text-slate-500 text-xs">{CURRENCY_MAP[`${r.receivingCountry}||${r.deliveryMethod}`] ?? r.deliveryMethod?.match(/\(([A-Z]{3})\)/)?.[1] ?? CURRENCY_MAP[r.receivingCountry] ?? ''}</span>
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
                            ? (() => { const exKRW = rateExchangeKRW(r); const raw = r.receiveAmount / exKRW; const rate = raw >= 1 ? raw : exKRW / r.receiveAmount; return rate >= 10 ? rate.toFixed(2) : rate >= 1 ? rate.toFixed(3) : rate.toFixed(4); })()
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                            {statusLabel(r.status, t)}
                          </span>
                        </td>
                        <td className="py-2.5 px-1 text-center">
                          <button
                            onClick={() => handleDelete(r)}
                            disabled={deletingId === r.id}
                            title={deletingId === r.id ? t.deleting : undefined}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 transition-colors"
                          >
                            {deletingId === r.id ? (
                              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            )}
                          </button>
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
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setTablePage(0); }}
                    className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 text-xs"
                  >
                    {[20, 50, 100, 500, 1000, 5000, 10000].map(n => (
                      <option key={n} value={n}>{n.toLocaleString()} / page</option>
                    ))}
                  </select>
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

        {/* Login Modal */}
        {showLoginModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowLoginModal(false)}>
            <form
              onClick={e => e.stopPropagation()}
              onSubmit={async (e) => {
                e.preventDefault();
                setLoginError('');
                setLoginLoading(true);
                try {
                  const res = await fetch('/api/alerts/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: loginUser, password: loginPass }),
                  });
                  if (res.ok) {
                    localStorage.setItem('alerts-auth', 'true');
                    localStorage.setItem('alerts-auth-expires', String(Date.now() + 8 * 60 * 60 * 1000));
                    setIsLoggedIn(true);
                    setShowLoginModal(false);
                  } else {
                    setLoginError(isEn ? 'Invalid username or password' : '잘못된 사용자명 또는 비밀번호');
                  }
                } catch {
                  setLoginError(isEn ? 'Connection error' : '연결 오류');
                } finally {
                  setLoginLoading(false);
                }
              }}
              className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 mx-4"
            >
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">{isEn ? 'Sign In' : '로그인'}</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{isEn ? 'Sign in to access alert settings' : '알림 설정에 접근하려면 로그인하세요'}</p>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{isEn ? 'Username' : '사용자명'}</label>
                <input type="text" value={loginUser} onChange={e => setLoginUser(e.target.value)} autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{isEn ? 'Password' : '비밀번호'}</label>
                <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200" />
              </div>
              {loginError && <p className="text-red-500 text-xs">{loginError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={loginLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
                  {loginLoading ? (isEn ? 'Signing in...' : '로그인 중...') : (isEn ? 'Sign In' : '로그인')}
                </button>
                <button type="button" onClick={() => setShowLoginModal(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  {isEn ? 'Cancel' : '취소'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
