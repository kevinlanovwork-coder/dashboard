'use client';
import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';

const STORAGE_KEY = 'dashboard-notifications-last-viewed';
const ITEMS_PER_CATEGORY = 10;

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

// runHour is "YYYY-MM-DD HH:mm" (KST). Convert to ms for comparison.
function runHourMs(rh: string): number {
  if (!rh) return 0;
  return new Date(rh.replace(' ', 'T')).getTime();
}

export default function NotificationsPopup({ isEn }: { isEn: boolean }) {
  const [open, setOpen] = useState(false);
  const [lastViewed, setLastViewed] = useState<number>(0);
  const [failures, setFailures] = useState<FailureItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [outliers, setOutliers] = useState<OutlierItem[]>([]);
  const [expiredFees, setExpiredFees] = useState<ExpiredFeeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load last viewed from localStorage on mount
  useEffect(() => {
    setLastViewed(Number(localStorage.getItem(STORAGE_KEY) ?? 0));
  }, []);

  // Click-outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Fetch all 4 data sources (3 endpoints)
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
    const interval = setInterval(fetchAll, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchAll]);

  // "New" = newer than last viewed timestamp
  const newFailures = failures.filter(f => runHourMs(f.runHour) > lastViewed).length;
  const newAlerts = alerts.filter(a => new Date(a.notified_at).getTime() > lastViewed).length;
  const newOutliers = outliers.filter(o => runHourMs(o.runHour) > lastViewed).length;
  const newExpiredFees = expiredFees.filter(f => new Date(f.edited_at).getTime() > lastViewed).length;
  const totalNew = newFailures + newAlerts + newOutliers + newExpiredFees;

  function handleToggle() {
    if (!open) {
      const now = Date.now();
      localStorage.setItem(STORAGE_KEY, String(now));
      setLastViewed(now);
      fetchAll();
    }
    setOpen(o => !o);
  }

  const allEmpty = failures.length === 0 && alerts.length === 0 && outliers.length === 0 && expiredFees.length === 0;

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
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800">
            <h3 className="text-sm font-semibold">{isEn ? 'Notifications' : '알림'}</h3>
            {loading && <span className="text-xs text-slate-400">{isEn ? 'Loading...' : '불러오는 중...'}</span>}
          </div>

          <Section
            title={isEn ? 'Recent Failures' : '최근 실패'}
            color="red"
            items={failures.slice(0, ITEMS_PER_CATEGORY)}
            renderItem={(f: FailureItem, i) => (
              <div key={i}>
                <div className="font-medium">{f.country} — {f.operator}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{f.deliveryMethod} • {f.reason}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">{f.runHour}</div>
              </div>
            )}
          />
          <Section
            title={isEn ? 'Recent Alerts' : '최근 알림'}
            color="blue"
            items={alerts.slice(0, ITEMS_PER_CATEGORY)}
            renderItem={(a: AlertItem) => (
              <div key={a.id}>
                <div className="font-medium">{a.receiving_country} — {a.operator}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {(a.alert_type ?? 'price') === 'rate' ? 'Rate' : 'Price'} gap: {a.price_gap > 0 ? '+' : ''}{a.price_gap.toLocaleString()}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">{new Date(a.notified_at).toLocaleString()}</div>
              </div>
            )}
          />
          <Section
            title={isEn ? 'Outliers' : '이상치'}
            color="amber"
            items={outliers.slice(0, ITEMS_PER_CATEGORY)}
            renderItem={(o: OutlierItem, i) => (
              <div key={i}>
                <div className="font-medium">{o.country} — {o.operator}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {o.scrapedValue?.toLocaleString()} vs median {o.medianValue?.toLocaleString()}
                  {o.deviationPct != null && ` (${o.deviationPct}%)`}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">{o.runHour}</div>
              </div>
            )}
          />
          <Section
            title={isEn ? 'Fee Expired' : '수수료 만료'}
            color="purple"
            items={expiredFees.slice(0, ITEMS_PER_CATEGORY)}
            renderItem={(f: ExpiredFeeItem) => (
              <div key={f.id}>
                <div className="font-medium">{f.receiving_country} — {f.operator}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {f.delivery_method}: {f.old_fee?.toLocaleString()} → {f.new_fee?.toLocaleString()} KRW
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">{new Date(f.edited_at).toLocaleString()}</div>
              </div>
            )}
          />

          {allEmpty && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              {isEn ? 'No notifications' : '알림 없음'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section<T>({ title, color, items, renderItem }: {
  title: string;
  color: 'red' | 'blue' | 'amber' | 'purple';
  items: T[];
  renderItem: (item: T, idx: number) => ReactNode;
}) {
  if (items.length === 0) return null;
  const colorClasses = {
    red:    'border-l-red-500 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300',
    blue:   'border-l-blue-500 bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-300',
    amber:  'border-l-amber-500 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300',
    purple: 'border-l-purple-500 bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-300',
  }[color];
  return (
    <div className="border-b border-slate-100 dark:border-slate-700/50 last:border-b-0">
      <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border-l-4 ${colorClasses}`}>
        {title} ({items.length})
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
        {items.map((item, i) => (
          <li key={i} className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/30">
            {renderItem(item, i)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BellIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}
