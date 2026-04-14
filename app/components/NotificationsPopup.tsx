'use client';
import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';

const STORAGE_KEY = 'dashboard-notifications-last-viewed';

interface FailureItem {
  runHour: string;
  country: string;
  operator: string;
  deliveryMethod: string;
  reason: string;
  errorMessage?: string | null;
}
interface AlertItem {
  id: number;
  run_hour: string;
  receiving_country: string;
  operator: string;
  alert_type?: string;
  price_gap: number;
  threshold?: number | null;
  notified_at: string;
}
interface OutlierItem {
  runHour: string;
  country: string;
  operator: string;
  deliveryMethod: string;
  scrapedValue: number;
  medianValue: number;
  deviationPct: number;
}
interface ExpiredFeeItem {
  id: number;
  receiving_country: string;
  operator: string;
  delivery_method: string;
  old_fee: number;
  new_fee: number;
  edited_at: string;
  action: string;
}

type TabKey = 'failures' | 'alerts' | 'outliers' | 'fees';
type ColorKey = 'red' | 'blue' | 'amber' | 'purple';

function runHourMs(rh: string): number {
  if (!rh) return 0;
  return new Date(rh.replace(' ', 'T')).getTime();
}

function FormattedRunHour({ rh }: { rh: string }) {
  if (!rh) return <span>(no time)</span>;
  const [date, time] = rh.split(' ');
  return (
    <>
      <span>{date.replace(/-/g, '/')}</span>
      <span className="ml-3">{time ?? ''}</span>
    </>
  );
}

const REASON_META: Record<string, { label: { en: string; ko: string }; color: string; bg: string }> = {
  scrape_error:     { label: { en: 'Scrape Error',  ko: '스크랩 오류' }, color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/20' },
  website_down:     { label: { en: 'Website Down',  ko: '사이트 다운' }, color: 'text-red-700 dark:text-red-300',       bg: 'bg-red-100 dark:bg-red-900/20' },
  api_error:        { label: { en: 'API Error',     ko: 'API 오류' },    color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-900/20' },
  not_scraped:      { label: { en: 'Not Scraped',   ko: '미실행' },      color: 'text-slate-700 dark:text-slate-300',   bg: 'bg-slate-200 dark:bg-slate-700/30' },
  manually_deleted: { label: { en: 'Deleted',       ko: '삭제됨' },      color: 'text-slate-600 dark:text-slate-400',   bg: 'bg-slate-100 dark:bg-slate-800/50' },
};
function reasonLabel(r: string, isEn: boolean) {
  const m = REASON_META[r];
  return m ? (isEn ? m.label.en : m.label.ko) : r;
}

function groupByRunHour<T>(items: T[], getRh: (item: T) => string): { runHour: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const rh = getRh(item) ?? '';
    if (!map.has(rh)) map.set(rh, []);
    map.get(rh)!.push(item);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([runHour, items]) => ({ runHour, items }));
}

export default function NotificationsPopup({ isEn }: { isEn: boolean }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('failures');
  const [lastViewed, setLastViewed] = useState<number>(0);
  const [failures, setFailures] = useState<FailureItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [outliers, setOutliers] = useState<OutlierItem[]>([]);
  const [expiredFees, setExpiredFees] = useState<ExpiredFeeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLastViewed(Number(localStorage.getItem(STORAGE_KEY) ?? 0));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, alertsRes, feesRes] = await Promise.all([
        fetch('/api/settings/health?days=7').then(r => r.json()).catch(() => ({})),
        fetch('/api/alerts/history').then(r => r.json()).catch(() => []),
        fetch('/api/settings/fees/history').then(r => r.json()).catch(() => []),
      ]);
      setFailures(Array.isArray(healthRes?.recentFailures) ? healthRes.recentFailures : []);
      setOutliers(Array.isArray(healthRes?.recentOutliers) ? healthRes.recentOutliers : []);
      setAlerts(Array.isArray(alertsRes) ? alertsRes : []);
      setExpiredFees(
        (Array.isArray(feesRes) ? feesRes : [])
          .filter((f: { action?: string }) => f.action === 'expired')
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const newFailures = failures.filter(f => runHourMs(f.runHour) > lastViewed).length;
  const newAlerts = alerts.filter(a => new Date(a.notified_at).getTime() > lastViewed).length;
  const newOutliers = outliers.filter(o => runHourMs(o.runHour) > lastViewed).length;
  const newExpiredFees = expiredFees.filter(f => new Date(f.edited_at).getTime() > lastViewed).length;
  const totalNew = newFailures + newAlerts + newOutliers + newExpiredFees;

  // Auto-select tab when popup opens — pick first tab with new items
  function pickInitialTab(): TabKey {
    if (newFailures > 0) return 'failures';
    if (newAlerts > 0) return 'alerts';
    if (newOutliers > 0) return 'outliers';
    if (newExpiredFees > 0) return 'fees';
    return 'failures';
  }

  function handleToggle() {
    if (!open) {
      setActiveTab(pickInitialTab());
      const now = Date.now();
      localStorage.setItem(STORAGE_KEY, String(now));
      setLastViewed(now);
      fetchAll();
    }
    setOpen(o => !o);
  }

  const TABS: { key: TabKey; label: string; color: ColorKey; newCount: number }[] = [
    { key: 'failures', label: isEn ? 'Failures' : '실패',    color: 'red',    newCount: newFailures },
    { key: 'alerts',   label: isEn ? 'Alerts'   : '알림',    color: 'blue',   newCount: newAlerts },
    { key: 'outliers', label: isEn ? 'Outliers' : '이상치', color: 'amber',  newCount: newOutliers },
    { key: 'fees',     label: isEn ? 'Fee'      : '수수료', color: 'purple', newCount: newExpiredFees },
  ];

  const activeTabColors: Record<ColorKey, string> = {
    red:    'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-b-2 border-red-500',
    blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500',
    amber:  'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-b-2 border-amber-500',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-b-2 border-purple-500',
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={handleToggle}
        className="relative p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        title={isEn ? 'Notifications' : '알림'}
      >
        <BellIcon />
        {totalNew > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {totalNew > 99 ? '99+' : totalNew}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-96 max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl z-50">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
            <h3 className="text-sm font-semibold">{isEn ? 'Notifications' : '알림'}</h3>
            {loading && <span className="text-xs text-slate-400">{isEn ? 'Loading...' : '불러오는 중...'}</span>}
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 sticky top-[45px] bg-white dark:bg-slate-800 z-10">
            {TABS.map(t => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex-1 px-2 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                    isActive ? activeTabColors[t.color] : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                  }`}
                >
                  <span>{t.label}</span>
                  {t.newCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">{t.newCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {activeTab === 'failures' && (
            <FailuresGroupedList
              groups={groupByRunHour(failures, f => f.runHour)}
              isEn={isEn}
              emptyText={isEn ? 'No failures' : '실패 없음'}
            />
          )}

          {activeTab === 'alerts' && (
            <GroupedList
              groups={groupByRunHour(alerts, a => a.run_hour)}
              color="blue"
              emptyText={isEn ? 'No alerts' : '알림 없음'}
              renderItem={(a: AlertItem) => {
                const isRate = (a.alert_type ?? 'price') === 'rate';
                const fmt = (n: number) => isRate
                  ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : n.toLocaleString() + ' KRW';
                const typePillBg = isRate
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
                return (
                  <div key={a.id}>
                    <div className="font-medium flex items-center justify-between gap-2">
                      <span>{a.receiving_country} — {a.operator}</span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${typePillBg}`}>
                        {isRate ? (isEn ? 'Rate' : '환율') : (isEn ? 'Price' : '가격')}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex justify-between gap-3">
                      <span>
                        {isEn ? 'Gap' : '차이'}: <span className={`font-mono ${a.price_gap < 0 ? 'text-red-500' : 'text-green-500'}`}>{a.price_gap > 0 ? '+' : ''}{fmt(a.price_gap)}</span>
                      </span>
                      {a.threshold != null && (
                        <span>
                          {isEn ? 'Threshold' : '임계값'}: <span className="font-mono">{a.threshold > 0 ? '+' : ''}{fmt(a.threshold)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          )}

          {activeTab === 'outliers' && (
            <GroupedList
              groups={groupByRunHour(outliers, o => o.runHour)}
              color="amber"
              emptyText={isEn ? 'No outliers' : '이상치 없음'}
              renderItem={(o: OutlierItem, i) => (
                <div key={i}>
                  <div className="font-medium">{o.country} — {o.operator}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex justify-between gap-3">
                    <span>{o.deliveryMethod}: {o.scrapedValue?.toLocaleString()}</span>
                    {o.deviationPct != null && (
                      <span className="text-amber-600 dark:text-amber-400">({isEn ? 'Error rate' : '오차율'}: {o.deviationPct}%)</span>
                    )}
                  </div>
                </div>
              )}
            />
          )}

          {activeTab === 'fees' && (
            <GroupedList
              groups={groupByRunHour(expiredFees, f => {
                const d = new Date(f.edited_at);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
              })}
              color="purple"
              emptyText={isEn ? 'No expired fees' : '만료된 수수료 없음'}
              renderItem={(f: ExpiredFeeItem) => (
                <div key={f.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{f.receiving_country} — {f.operator}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {f.delivery_method}: {f.old_fee?.toLocaleString()} → {f.new_fee?.toLocaleString()} KRW
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                    {isEn ? 'Expired' : '만료'}
                  </span>
                </div>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FailuresGroupedList({ groups, isEn, emptyText }: {
  groups: { runHour: string; items: FailureItem[] }[];
  isEn: boolean;
  emptyText: string;
}) {
  if (groups.length === 0) return <EmptyState text={emptyText} />;
  return (
    <>
      {groups.map((g, gi) => {
        // Step 1: methods per (country, operator, reason)
        const methodsPerKey = new Map<string, Set<string>>();
        for (const item of g.items) {
          const reason = item.reason || 'scrape_error';
          const key = `${item.country}||${item.operator}||${reason}`;
          if (!methodsPerKey.has(key)) methodsPerKey.set(key, new Set());
          methodsPerKey.get(key)!.add(item.deliveryMethod);
        }
        // Step 2: merge operators that share country + same method set + same reason
        type Group = { country: string; operators: string[]; methods: string[]; reason: string };
        const merged = new Map<string, Group>();
        for (const [key, methodSet] of methodsPerKey) {
          const [country, operator, reason] = key.split('||');
          const sortedMethods = [...methodSet].sort();
          const mergeKey = `${country}||${sortedMethods.join('|')}||${reason}`;
          if (!merged.has(mergeKey)) merged.set(mergeKey, { country, operators: [], methods: sortedMethods, reason });
          merged.get(mergeKey)!.operators.push(operator);
        }
        // Sort: by reason, then country
        const groupEntries = [...merged.values()].sort((a, b) =>
          a.reason.localeCompare(b.reason) || a.country.localeCompare(b.country)
        );
        return (
          <div key={gi} className="border-b border-slate-100 dark:border-slate-700/50 last:border-b-0">
            <div className="px-4 py-1.5 text-xs font-semibold flex justify-between bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
              <span><FormattedRunHour rh={g.runHour} /></span>
              <span className="opacity-70">({g.items.length})</span>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {groupEntries.map((grp, ci) => {
                const meta = REASON_META[grp.reason] ?? REASON_META.scrape_error;
                return (
                  <li key={ci} className="px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/30 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{grp.country} — {grp.operators.sort().join(', ')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{grp.methods.join(', ')}</div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.bg} ${meta.color}`}>
                      {reasonLabel(grp.reason, isEn)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function GroupedList<T>({ groups, color, emptyText, renderItem }: {
  groups: { runHour: string; items: T[] }[];
  color: 'red' | 'blue' | 'amber' | 'purple';
  emptyText: string;
  renderItem: (item: T, idx: number) => ReactNode;
}) {
  if (groups.length === 0) return <EmptyState text={emptyText} />;
  const headerBg: Record<'red' | 'blue' | 'amber' | 'purple', string> = {
    red:    'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    blue:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    amber:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  };
  return (
    <>
      {groups.map((g, gi) => (
        <div key={gi} className="border-b border-slate-100 dark:border-slate-700/50 last:border-b-0">
          <div className={`px-4 py-1.5 text-xs font-semibold flex justify-between ${headerBg[color]}`}>
            <span><FormattedRunHour rh={g.runHour} /></span>
            <span className="opacity-70">({g.items.length})</span>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {g.items.map((item, i) => (
              <li key={i} className="px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                {renderItem(item, i)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function FlatList<T>({ items, emptyText, renderItem }: {
  items: T[];
  emptyText: string;
  renderItem: (item: T, idx: number) => ReactNode;
}) {
  if (items.length === 0) return <EmptyState text={emptyText} />;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
      {items.map((item, i) => (
        <li key={i} className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/30">
          {renderItem(item, i)}
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-slate-400">{text}</div>;
}

function BellIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}
