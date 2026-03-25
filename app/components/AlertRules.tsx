'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AlertRule {
  id: number;
  receiving_country: string;
  operator: string | null;
  delivery_method: string;
  direction: string;
  threshold_krw: number;
  cooldown_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  lastTriggered: string | null;
}

interface AlertConfig {
  id: number;
  notify_emails: string[];
}

interface AlertLog {
  id: number;
  alert_rule_id: number;
  run_hour: string;
  operator: string;
  receiving_country: string;
  price_gap: number;
  total_sending_amount: number | null;
  gme_baseline: number | null;
  notified_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Operators keyed by "Country||DeliveryMethod"
// For countries with a single delivery method, the key is just "Country||<method>"
const OPERATOR_MAP: Record<string, string[]> = {
  'Indonesia||Bank Account':   ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'Utransfer', 'SBI', 'Cross', 'Coinshot', 'JRF', 'E9Pay'],
  'Thailand||Bank Account':    ['GME', 'GMoneyTrans', 'WireBarley', 'Sentbe', 'Hanpass', 'SBI', 'Cross', 'Coinshot', 'JRF', 'E9Pay'],
  'Vietnam||Bank Account':     ['GME', 'Sentbe', 'SBI', 'GMoneyTrans', 'E9Pay', 'Hanpass', 'Cross', 'JRF'],
  'Nepal||Bank Account':       ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'JRF', 'E9Pay', 'Coinshot'],
  'Philippines||Bank Account': ['GME', 'GMoneyTrans', 'SBI', 'Coinshot', 'Cross', 'E9Pay', 'JRF', 'Utransfer', 'Hanpass'],
  'Cambodia||Bank Account':    ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'SBI', 'E9Pay'],
  'China||Bank Account':       ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'SBI', 'Cross', 'WireBarley', 'Coinshot', 'Utransfer', 'Moin', 'Debunk'],
  'China||Alipay':             ['GME', 'GMoneyTrans', 'Hanpass', 'E9Pay'],
  'Mongolia||Bank Account':    ['GME', 'GMoneyTrans', 'Utransfer', 'Cross', 'E9Pay', 'Coinshot', 'Hanpass'],
  'Myanmar||Bank Account':     ['GME', 'GMoneyTrans', 'Hanpass', 'SBI', 'E9Pay'],
  'Cameroon||Mobile Wallet':   ['GME', 'GMoneyTrans'],
  'Liberia||Cash Pickup':      ['GME', 'GMoneyTrans'],
};

const DELIVERY_METHOD_MAP: Record<string, string[]> = {
  Indonesia: ['Bank Account'],
  Thailand: ['Bank Account'],
  Vietnam: ['Bank Account'],
  Nepal: ['Bank Account'],
  Philippines: ['Bank Account'],
  Cambodia: ['Bank Account'],
  China: ['Bank Account', 'Alipay'],
  Mongolia: ['Bank Account'],
  Myanmar: ['Bank Account'],
  Cameroon: ['Mobile Wallet'],
  Liberia: ['Cash Pickup'],
};

const COUNTRIES = Object.keys(DELIVERY_METHOD_MAP);

const COOLDOWN_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 480, label: '8 hours' },
  { value: 1440, label: '24 hours' },
];

// ─── Translations ────────────────────────────────────────────────────────────

const EN = {
  title: 'Alert Rules',
  subtitle: 'Get notified when competitors beat GME pricing',
  backToDashboard: 'Dashboard',
  addRule: 'Add Rule',
  editRule: 'Edit Rule',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  noRules: 'No alert rules configured yet.',
  country: 'Country',
  operator: 'Operator',
  anyOperator: 'Any operator',
  deliveryMethod: 'Delivery Method',
  direction: 'Direction',
  cheaper: 'Cheaper than GME',
  any: 'Any direction',
  threshold: 'Threshold (KRW)',
  thresholdHelp: 'Alert when price gap drops below this value (e.g. -2000)',
  cooldown: 'Cooldown',
  active: 'Active',
  lastTriggered: 'Last Triggered',
  never: 'Never',
  recentAlerts: 'Recent Alerts',
  noHistory: 'No alerts sent yet.',
  emailConfig: 'Email Recipients',
  emailConfigHelp: 'All alerts are sent to these addresses (comma-separated)',
  emailSave: 'Save Emails',
  emailSaved: 'Saved',
  lang: 'EN',
  darkMode: 'Dark',
  lightMode: 'Light',
};

const KO = {
  title: '알림 규칙',
  subtitle: '경쟁사가 GME보다 저렴할 때 알림 받기',
  backToDashboard: '대시보드',
  addRule: '규칙 추가',
  editRule: '규칙 수정',
  save: '저장',
  cancel: '취소',
  delete: '삭제',
  noRules: '설정된 알림 규칙이 없습니다.',
  country: '국가',
  operator: '운영사',
  anyOperator: '전체 운영사',
  deliveryMethod: '입금 방식',
  direction: '방향',
  cheaper: 'GME보다 저렴',
  any: '모든 방향',
  threshold: '임계값 (KRW)',
  thresholdHelp: '가격 차이가 이 값 이하일 때 알림 (예: -2000)',
  cooldown: '재알림 대기',
  active: '활성',
  lastTriggered: '마지막 알림',
  never: '없음',
  recentAlerts: '최근 알림',
  noHistory: '발송된 알림이 없습니다.',
  emailConfig: '이메일 수신자',
  emailConfigHelp: '모든 알림이 이 주소로 발송됩니다 (쉼표 구분)',
  emailSave: '이메일 저장',
  emailSaved: '저장됨',
  lang: 'KO',
  darkMode: '다크',
  lightMode: '라이트',
};

// ─── Login Gate ──────────────────────────────────────────────────────────────

function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDark] = useState(() => localStorage.getItem('dashboard-theme') === 'dark');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/alerts/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        sessionStorage.setItem('alerts-auth', 'true');
        onSuccess();
      } else {
        setError('Invalid username or password');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-200">Alert Rules</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Sign in to manage alert rules</p>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} autoFocus
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200" />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <a href="/" className="block text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            Back to Dashboard
          </a>
        </form>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AlertRules() {
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem('alerts-auth') === 'true');

  if (!authenticated) {
    return <LoginGate onSuccess={() => setAuthenticated(true)} />;
  }

  return <AlertRulesContent />;
}

function AlertRulesContent() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertLog[]>([]);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [isEn, setIsEn] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [emailSaved, setEmailSaved] = useState(false);
  const [sortColumn, setSortColumn] = useState<'receiving_country' | 'operator' | 'delivery_method' | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Form state
  const [formCountry, setFormCountry] = useState('Indonesia');
  const [formOperator, setFormOperator] = useState('');
  const [formDelivery, setFormDelivery] = useState('Bank Account');
  const [formDirection, setFormDirection] = useState('cheaper');
  const [formThreshold, setFormThreshold] = useState('-2000');
  const [formCooldown, setFormCooldown] = useState(120);

  const t = isEn ? EN : KO;

  const deliveryMethods = useMemo(() => DELIVERY_METHOD_MAP[formCountry] ?? ['Bank Account'], [formCountry]);
  const operators = useMemo(() => OPERATOR_MAP[`${formCountry}||${formDelivery}`] ?? [], [formCountry, formDelivery]);

  // Reset delivery method when country changes
  useEffect(() => {
    const methods = DELIVERY_METHOD_MAP[formCountry] ?? ['Bank Account'];
    setFormDelivery(methods[0]);
  }, [formCountry]);

  // Reset operator when delivery method changes
  useEffect(() => {
    setFormOperator('');
  }, [formDelivery]);

  // Load preferences
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-theme');
    if (saved === 'dark') setIsDark(true);
    const lang = localStorage.getItem('dashboard-lang');
    if (lang === 'ko') setIsEn(false);
  }, []);

  useEffect(() => {
    localStorage.setItem('dashboard-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('dashboard-lang', isEn ? 'en' : 'ko');
  }, [isEn]);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      if (Array.isArray(data)) setRules(data);
    } catch (err) {
      console.error('Failed to fetch alert rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts/config');
      const data = await res.json();
      if (data?.id) {
        setConfig(data);
        // Don't pre-fill input — emails are shown as pills above
      }
    } catch { /* ignore */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts/history');
      const data = await res.json();
      if (Array.isArray(data)) setHistory(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchConfig();
    fetchHistory();
  }, [fetchRules, fetchConfig, fetchHistory]);

  function resetForm() {
    setFormCountry('Indonesia');
    setFormOperator('');
    setFormDelivery('Bank Account');
    setFormDirection('cheaper');
    setFormThreshold('-2000');
    setFormCooldown(120);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(rule: AlertRule) {
    setFormCountry(rule.receiving_country);
    setFormDelivery(rule.delivery_method);
    setFormOperator(rule.operator ?? '');
    setFormDirection(rule.direction);
    setFormThreshold(String(rule.threshold_krw));
    setFormCooldown(rule.cooldown_minutes);
    setEditingId(rule.id);
    setShowForm(true);
  }

  function startDuplicate(rule: AlertRule) {
    setFormCountry(rule.receiving_country);
    setFormDelivery(rule.delivery_method);
    setFormOperator(rule.operator ?? '');
    setFormDirection(rule.direction);
    setFormThreshold(String(rule.threshold_krw));
    setFormCooldown(rule.cooldown_minutes);
    setEditingId(null); // null = create new
    setShowForm(true);
  }

  function findDuplicateRule(): AlertRule | null {
    const op = formOperator || null;
    return rules.find(r =>
      r.receiving_country === formCountry &&
      r.delivery_method === formDelivery &&
      (r.operator ?? null) === op &&
      r.id !== editingId // allow saving the same rule when editing
    ) ?? null;
  }

  async function handleSave() {
    const duplicate = findDuplicateRule();
    if (duplicate) {
      const wantEdit = confirm(isEn
        ? 'A rule with the same country, delivery method and operator already exists. Do you want to edit the existing rule?'
        : '동일한 국가, 입금 방식, 운영사 조합의 규칙이 이미 존재합니다. 기존 규칙을 수정하시겠습니까?');
      if (wantEdit) {
        startEdit(duplicate);
      }
      return;
    }

    const body = {
      id: editingId,
      receiving_country: formCountry,
      operator: formOperator || null,
      delivery_method: formDelivery,
      direction: formDirection,
      threshold_krw: Number(formThreshold),
      cooldown_minutes: formCooldown,
    };

    await fetch('/api/alerts', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    resetForm();
    fetchRules();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this alert rule?')) return;
    await fetch('/api/alerts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchRules();
  }

  async function handleToggle(rule: AlertRule) {
    await fetch('/api/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
    });
    fetchRules();
  }

  function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function handleEmailAdd() {
    const newEmails = emailInput.split(',').map(e => e.trim()).filter(Boolean);
    if (newEmails.length === 0) return;

    const invalid = newEmails.filter(e => !isValidEmail(e));
    if (invalid.length > 0) {
      alert(isEn
        ? `Invalid email format: ${invalid.join(', ')}`
        : `잘못된 이메일 형식: ${invalid.join(', ')}`);
      return;
    }

    const existing = config?.notify_emails ?? [];
    // Deduplicate
    const merged = [...existing, ...newEmails.filter(e => !existing.includes(e))];

    await fetch('/api/alerts/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: config?.id ?? 1, notify_emails: merged }),
    });
    setEmailInput('');
    setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 2000);
    fetchConfig();
  }

  function formatDate(iso: string | null) {
    if (!iso) return t.never;
    return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }

  function handleSort(col: 'receiving_country' | 'operator' | 'delivery_method') {
    if (sortColumn === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortColumn(col);
      setSortAsc(true);
    }
  }

  const sortedRules = useMemo(() => {
    if (!sortColumn) return rules;
    return [...rules].sort((a, b) => {
      const aVal = (a[sortColumn] ?? '').toLowerCase();
      const bVal = (b[sortColumn] ?? '').toLowerCase();
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [rules, sortColumn, sortAsc]);

  const sortIcon = (col: string) => {
    if (sortColumn !== col) return ' ↕';
    return sortAsc ? ' ↑' : ' ↓';
  };

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 transition-colors">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{t.title}</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <a href="/" className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t.backToDashboard}
              </a>
              <button onClick={() => setIsEn(!isEn)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t.lang}
              </button>
              <button onClick={() => setIsDark(!isDark)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {isDark ? t.lightMode : t.darkMode}
              </button>
              <button onClick={() => { sessionStorage.removeItem('alerts-auth'); window.location.reload(); }}
                className="px-2.5 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                {isEn ? 'Logout' : '로그아웃'}
              </button>
            </div>
          </div>

          {/* Global Email Config */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-2">{t.emailConfig}</h2>
            <p className="text-xs text-slate-400 mb-3">{t.emailConfigHelp}</p>
            {/* Saved email list */}
            {config && config.notify_emails.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {config.notify_emails.map(email => (
                  <span key={email} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                    {email}
                    <button
                      onClick={() => {
                        const updated = config.notify_emails.filter(e => e !== email);
                        fetch('/api/alerts/config', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: config.id, notify_emails: updated }),
                        }).then(() => fetchConfig());
                      }}
                      className="hover:text-red-500 transition-colors"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEmailAdd(); } }}
                placeholder={isEn ? 'Enter email and press Add' : '이메일 입력 후 추가 클릭'}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
              <button
                onClick={handleEmailAdd}
                className={`px-4 py-2 rounded-lg text-sm text-white transition-colors ${emailSaved ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {emailSaved ? t.emailSaved : (isEn ? 'Add' : '추가')}
              </button>
            </div>
          </div>

          {/* Add Rule Button */}
          {!showForm && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              + {t.addRule}
            </button>
          )}

          {/* Form */}
          {showForm && (
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold">{editingId ? t.editRule : t.addRule}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Country */}
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.country}</label>
                  <select value={formCountry} onChange={e => setFormCountry(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {/* Delivery Method — before Operator so operator list updates accordingly */}
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.deliveryMethod}</label>
                  <select value={formDelivery} onChange={e => setFormDelivery(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                    {deliveryMethods.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                {/* Operator — list depends on selected country + delivery method */}
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.operator}</label>
                  <select value={formOperator} onChange={e => setFormOperator(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                    <option value="">{t.anyOperator}</option>
                    {operators.filter(o => o !== 'GME').map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {/* Direction */}
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.direction}</label>
                  <select value={formDirection} onChange={e => setFormDirection(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                    <option value="cheaper">{t.cheaper}</option>
                    <option value="any">{t.any}</option>
                  </select>
                </div>
                {/* Threshold */}
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.threshold}</label>
                  <input type="number" value={formThreshold} onChange={e => setFormThreshold(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                  <p className="text-xs text-slate-400 mt-0.5">{t.thresholdHelp}</p>
                </div>
                {/* Cooldown */}
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.cooldown}</label>
                  <select value={formCooldown} onChange={e => setFormCooldown(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                    {COOLDOWN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">{t.save}</button>
                <button onClick={resetForm} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">{t.cancel}</button>
              </div>
            </div>
          )}

          {/* Rules Table */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading...</div>
            ) : rules.length === 0 ? (
              <div className="p-8 text-center text-slate-400">{t.noRules}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3">{t.active}</th>
                      <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors" onClick={() => handleSort('receiving_country')}>{t.country}{sortIcon('receiving_country')}</th>
                      <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors" onClick={() => handleSort('delivery_method')}>{t.deliveryMethod}{sortIcon('delivery_method')}</th>
                      <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors" onClick={() => handleSort('operator')}>{t.operator}{sortIcon('operator')}</th>
                      <th className="px-4 py-3">{t.threshold}</th>
                      <th className="px-4 py-3">{t.cooldown}</th>
                      <th className="px-4 py-3">{t.lastTriggered}</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRules.map(rule => (
                      <tr key={rule.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <button onClick={() => handleToggle(rule)}
                            className={`w-10 h-5 rounded-full transition-colors relative ${rule.is_active ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${rule.is_active ? 'left-5' : 'left-0.5'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium">{rule.receiving_country}</td>
                        <td className="px-4 py-3">{rule.delivery_method}</td>
                        <td className="px-4 py-3">{rule.operator ?? t.anyOperator}</td>
                        <td className="px-4 py-3 font-mono text-red-600 dark:text-red-400">{rule.threshold_krw.toLocaleString()}</td>
                        <td className="px-4 py-3">{COOLDOWN_OPTIONS.find(o => o.value === rule.cooldown_minutes)?.label ?? `${rule.cooldown_minutes}m`}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{formatDate(rule.lastTriggered)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => startDuplicate(rule)} className="px-2 py-1 text-xs rounded border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                              {isEn ? 'Duplicate' : '복제'}
                            </button>
                            <button onClick={() => startEdit(rule)} className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                              Edit
                            </button>
                            <button onClick={() => handleDelete(rule.id)} className="px-2 py-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                              {t.delete}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Alert History */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-3">{t.recentAlerts}</h2>
            {history.length === 0 ? (
              <p className="text-sm text-slate-400">{t.noHistory}</p>
            ) : (
              <div className="space-y-2">
                {history.slice(0, 20).map(log => (
                  <div key={log.id} className="flex items-center justify-between text-xs py-2 border-b border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">{formatDate(log.notified_at)}</span>
                      <span className="font-medium">{log.receiving_country}</span>
                      <span>{log.operator}</span>
                    </div>
                    <span className={`font-mono ${log.price_gap < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {log.price_gap > 0 ? '+' : ''}{log.price_gap.toLocaleString()} KRW
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
