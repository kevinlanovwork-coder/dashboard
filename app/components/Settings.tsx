'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AlertRule {
  id: number;
  receiving_country: string;
  operator: string | null;
  delivery_method: string;
  direction: string;
  alert_type: string;
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
  effective_until: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const OPERATOR_MAP: Record<string, string[]> = {
  'Indonesia||Bank Deposit':   ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'Utransfer', 'SBI', 'Cross', 'Coinshot', 'JRF', 'E9Pay'],
  'Thailand||Bank Deposit':    ['GME', 'GMoneyTrans', 'WireBarley', 'Sentbe', 'Hanpass', 'SBI', 'Cross', 'Coinshot', 'JRF', 'E9Pay'],
  'Vietnam||Bank Deposit':     ['GME', 'Sentbe', 'SBI', 'GMoneyTrans', 'E9Pay', 'Hanpass', 'Cross', 'JRF'],
  'Nepal||Bank Deposit':       ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'JRF', 'E9Pay', 'Coinshot'],
  'Philippines||Bank Deposit': ['GME', 'GMoneyTrans', 'SBI', 'Coinshot', 'Cross', 'E9Pay', 'JRF', 'Utransfer', 'Hanpass'],
  'Cambodia||Bank Deposit':    ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'SBI', 'E9Pay'],
  'China||Alipay':             ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'SBI', 'Cross', 'WireBarley', 'Coinshot', 'E9Pay', 'Utransfer', 'Moin', 'Debunk'],
  'Mongolia||Bank Deposit':    ['GME', 'GMoneyTrans', 'Utransfer', 'Cross', 'E9Pay', 'Coinshot', 'Hanpass'],
  'Myanmar||Bank Deposit':     ['GME', 'GMoneyTrans', 'Hanpass', 'SBI', 'E9Pay'],
  'Pakistan||Bank Deposit':    ['GME', 'GMoneyTrans', 'Sentbe', 'Hanpass', 'JRF'],
  'Laos||Bank Deposit':        ['GME', 'GMoneyTrans', 'E9Pay', 'Hanpass'],
  'Sri Lanka||Bank Deposit':   ['GME', 'Sentbe', 'E9Pay', 'GMoneyTrans', 'Coinshot', 'JRF', 'Hanpass'],
  'India||Bank Deposit':       ['WireBarley', 'Sentbe', 'GMoneyTrans', 'GME', 'Hanpass'],
};

const DELIVERY_METHOD_MAP: Record<string, string[]> = {
  Indonesia: ['Bank Deposit'], Thailand: ['Bank Deposit'], Vietnam: ['Bank Deposit'],
  Nepal: ['Bank Deposit'], Philippines: ['Bank Deposit'], Cambodia: ['Bank Deposit'],
  China: ['Alipay'], Mongolia: ['Bank Deposit'], Myanmar: ['Bank Deposit'],
  Pakistan: ['Bank Deposit'], Laos: ['Bank Deposit'], 'Sri Lanka': ['Bank Deposit'], India: ['Bank Deposit'],
};

const COUNTRIES = Object.keys(DELIVERY_METHOD_MAP);

const COOLDOWN_OPTIONS = [
  { value: 30, label: '30 min' }, { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' }, { value: 240, label: '4 hours' },
  { value: 480, label: '8 hours' }, { value: 1440, label: '24 hours' },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Settings() {
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('alerts-auth') !== 'true') {
      window.location.href = '/';
    }
  }, []);

  if (typeof window !== 'undefined' && sessionStorage.getItem('alerts-auth') !== 'true') {
    return null;
  }

  return <SettingsContent />;
}

function SettingsContent() {
  const [activeTab, setActiveTab] = useState<'alerts' | 'fees' | 'health'>('alerts');
  const [isDark, setIsDark] = useState(false);
  const [isEn, setIsEn] = useState(true);

  useEffect(() => {
    if (localStorage.getItem('dashboard-theme') === 'dark') setIsDark(true);
    if (localStorage.getItem('dashboard-lang') === 'ko') setIsEn(false);
  }, []);

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 transition-colors">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{isEn ? 'Settings' : '설정'}</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                {isEn ? 'Manage alert rules and service fees' : '알림 규칙 및 수수료 관리'}
              </p>
            </div>
            <a href="/" className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {isEn ? 'Home' : '홈'}
            </a>
          </div>

          {/* Tabs */}
          <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden text-sm">
            <button
              onClick={() => setActiveTab('alerts')}
              className={`flex-1 px-4 py-2 transition-colors ${activeTab === 'alerts' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              {isEn ? 'Alert Rules' : '알림 규칙'}
            </button>
            <button
              onClick={() => setActiveTab('fees')}
              className={`flex-1 px-4 py-2 transition-colors ${activeTab === 'fees' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              {isEn ? 'Service Fees' : '수수료 설정'}
            </button>
            <button
              onClick={() => setActiveTab('health')}
              className={`flex-1 px-4 py-2 transition-colors ${activeTab === 'health' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              {isEn ? 'Scraper Health' : '스크래퍼 상태'}
            </button>
          </div>

          {activeTab === 'alerts' ? <AlertRulesTab isEn={isEn} /> : activeTab === 'fees' ? <ServiceFeesTab isEn={isEn} /> : <ScraperHealthTab isEn={isEn} />}

        </div>
      </div>
    </div>
  );
}

// ─── Alert Rules Tab ─────────────────────────────────────────────────────────

function AlertRulesTab({ isEn }: { isEn: boolean }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertLog[]>([]);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [emailSaved, setEmailSaved] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const [sortColumn, setSortColumn] = useState<'receiving_country' | 'operator' | 'delivery_method' | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [historyPage, setHistoryPage] = useState(0);
  const HISTORY_PAGE_SIZE = 10;
  const [filterCountry, setFilterCountry] = useState('');
  const [rulesPage, setRulesPage] = useState(0);
  const RULES_PAGE_SIZE = 10;

  const [formCountry, setFormCountry] = useState('Indonesia');
  const [formOperators, setFormOperators] = useState<Set<string>>(new Set());
  const [formDelivery, setFormDelivery] = useState('Bank Deposit');
  const [formDirection, setFormDirection] = useState('cheaper');
  const [formAlertType, setFormAlertType] = useState('price');
  const [formThreshold, setFormThreshold] = useState('-2000');
  const [formCooldown, setFormCooldown] = useState(120);
  const skipOperatorResetRef = useRef(false);

  const deliveryMethods = useMemo(() => DELIVERY_METHOD_MAP[formCountry] ?? ['Bank Deposit'], [formCountry]);
  const operators = useMemo(() => OPERATOR_MAP[`${formCountry}||${formDelivery}`] ?? [], [formCountry, formDelivery]);

  useEffect(() => { setFormDelivery((DELIVERY_METHOD_MAP[formCountry] ?? ['Bank Deposit'])[0]); }, [formCountry]);
  useEffect(() => { if (skipOperatorResetRef.current) { skipOperatorResetRef.current = false; return; } setFormOperators(new Set()); }, [formDelivery]);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      if (Array.isArray(data)) setRules(data);
    } catch (err) { console.error('Failed to fetch alert rules:', err); }
    finally { setLoading(false); }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts/config');
      const data = await res.json();
      if (data?.id) setConfig(data);
    } catch { /* ignore */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts/history');
      const data = await res.json();
      if (Array.isArray(data)) setHistory(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchRules(); fetchConfig(); fetchHistory(); }, [fetchRules, fetchConfig, fetchHistory]);

  function resetForm() {
    setFormCountry('Indonesia'); setFormOperators(new Set()); setFormDelivery('Bank Deposit');
    setFormDirection('cheaper'); setFormAlertType('price'); setFormThreshold('-2000'); setFormCooldown(120);
    setEditingId(null); setShowForm(false);
  }

  function startEdit(rule: AlertRule, groupRules?: AlertRule[]) {
    skipOperatorResetRef.current = true;
    const ops = groupRules ? groupRules.map(r => r.operator).filter(Boolean) as string[] : (rule.operator ? [rule.operator] : []);
    setFormCountry(rule.receiving_country); setFormDelivery(rule.delivery_method);
    setFormOperators(new Set(ops)); setFormDirection(rule.direction);
    setFormAlertType(rule.alert_type ?? 'price'); setFormThreshold(String(rule.threshold_krw)); setFormCooldown(rule.cooldown_minutes);
    setEditingId(rule.id); setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  function startDuplicate(rule: AlertRule, groupRules?: AlertRule[]) {
    skipOperatorResetRef.current = true;
    const ops = groupRules ? groupRules.map(r => r.operator).filter(Boolean) as string[] : (rule.operator ? [rule.operator] : []);
    setFormCountry(rule.receiving_country); setFormDelivery(rule.delivery_method);
    setFormOperators(new Set(ops)); setFormDirection(rule.direction);
    setFormAlertType(rule.alert_type ?? 'price'); setFormThreshold(String(rule.threshold_krw)); setFormCooldown(rule.cooldown_minutes);
    setEditingId(null); setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  async function handleSave() {
    const base = { receiving_country: formCountry, delivery_method: formDelivery, direction: formDirection, alert_type: formAlertType, threshold_krw: Number(formThreshold), cooldown_minutes: formCooldown };
    if (editingId) {
      // Find the group this rule belongs to
      const group = groupedRules.find(g => g.rules.some(r => r.id === editingId));
      const existingRules = group?.rules ?? [];
      const newOps: (string | null)[] = formOperators.size > 0 ? [...formOperators] : [null];
      // Delete rules whose operators were unchecked
      const toDelete = existingRules.filter(r => !newOps.includes(r.operator));
      // Update rules whose operators still exist
      const toUpdate = existingRules.filter(r => newOps.includes(r.operator));
      // Create rules for newly checked operators
      const existingOps = existingRules.map(r => r.operator);
      const toCreate = newOps.filter(op => !existingOps.includes(op));
      await Promise.all([
        ...toDelete.map(r => fetch('/api/alerts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id }) })),
        ...toUpdate.map(r => fetch('/api/alerts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, ...base, operator: r.operator, is_active: true }) })),
        ...toCreate.map(op => fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, operator: op }) })),
      ]);
    } else if (formOperators.size === 0) {
      // "Any operator" — single rule with null
      await fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...base, operator: null }) });
    } else {
      // Multiple operators — one rule per operator
      await Promise.all([...formOperators].map(op =>
        fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...base, operator: op }) })
      ));
    }
    resetForm(); fetchRules();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this alert rule?')) return;
    await fetch('/api/alerts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    fetchRules();
  }

  async function handleToggle(rule: AlertRule) {
    await fetch('/api/alerts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }) });
    fetchRules();
  }

  function isValidEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

  async function handleEmailAdd() {
    const newEmails = emailInput.split(',').map(e => e.trim()).filter(Boolean);
    if (newEmails.length === 0) return;
    const invalid = newEmails.filter(e => !isValidEmail(e));
    if (invalid.length > 0) { alert(isEn ? `Invalid email format: ${invalid.join(', ')}` : `잘못된 이메일 형식: ${invalid.join(', ')}`); return; }
    const merged = [...(config?.notify_emails ?? []), ...newEmails.filter(e => !(config?.notify_emails ?? []).includes(e))];
    await fetch('/api/alerts/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: config?.id ?? 1, notify_emails: merged }) });
    setEmailInput(''); setEmailSaved(true); setTimeout(() => setEmailSaved(false), 2000); fetchConfig();
  }

  function formatDate(iso: string | null) { if (!iso) return isEn ? 'Never' : '없음'; return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }); }

  function handleSort(col: 'receiving_country' | 'operator' | 'delivery_method') {
    if (sortColumn === col) setSortAsc(!sortAsc); else { setSortColumn(col); setSortAsc(true); }
  }
  const filteredRules = useMemo(() => {
    if (!filterCountry) return rules;
    return rules.filter(r => r.receiving_country === filterCountry);
  }, [rules, filterCountry]);

  const sortedRules = useMemo(() => {
    const sorted = sortColumn
      ? [...filteredRules].sort((a, b) => { const aV = (a[sortColumn] ?? '').toLowerCase(), bV = (b[sortColumn] ?? '').toLowerCase(); return aV < bV ? (sortAsc ? -1 : 1) : aV > bV ? (sortAsc ? 1 : -1) : 0; })
      : [...filteredRules];
    // Active rules always on top
    return sorted.sort((a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1));
  }, [filteredRules, sortColumn, sortAsc]);

  // Group rules with same settings but different operators into a single row
  const groupedRules = useMemo(() => {
    const groups: { key: string; rules: AlertRule[]; operators: string[]; is_active: boolean }[] = [];
    const map = new Map<string, typeof groups[0]>();
    for (const rule of sortedRules) {
      const k = `${rule.receiving_country}||${rule.delivery_method}||${rule.direction}||${rule.alert_type ?? 'price'}||${rule.threshold_krw}||${rule.cooldown_minutes}||${rule.is_active}`;
      const existing = map.get(k);
      if (existing) {
        existing.rules.push(rule);
        existing.operators.push(rule.operator ?? (isEn ? 'Any' : '전체'));
      } else {
        const g = { key: k, rules: [rule], operators: [rule.operator ?? (isEn ? 'Any' : '전체')], is_active: rule.is_active };
        groups.push(g);
        map.set(k, g);
      }
    }
    return groups;
  }, [sortedRules, isEn]);

  const totalRulesPages = Math.ceil(groupedRules.length / RULES_PAGE_SIZE);
  const pagedGroups = groupedRules.slice(rulesPage * RULES_PAGE_SIZE, (rulesPage + 1) * RULES_PAGE_SIZE);
  const sortIcon = (col: string) => sortColumn !== col ? ' ↕' : sortAsc ? ' ↑' : ' ↓';

  return (
    <div className="space-y-6">
      {/* Email Config */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-2">{isEn ? 'Email Recipients' : '이메일 수신자'}</h2>
        <p className="text-xs text-slate-400 mb-3">{isEn ? 'All alerts are sent to these addresses' : '모든 알림이 이 주소로 발송됩니다'}</p>
        {config && config.notify_emails.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {config.notify_emails.map(email => (
              <span key={email} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                {email}
                <button onClick={() => { const updated = config.notify_emails.filter(e => e !== email); fetch('/api/alerts/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: config.id, notify_emails: updated }) }).then(() => fetchConfig()); }} className="hover:text-red-500 transition-colors">&times;</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input value={emailInput} onChange={e => setEmailInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEmailAdd(); } }} placeholder={isEn ? 'Enter email and press Add' : '이메일 입력 후 추가 클릭'} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          <button onClick={handleEmailAdd} className={`px-4 py-2 rounded-lg text-sm text-white transition-colors ${emailSaved ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}>{emailSaved ? (isEn ? 'Saved' : '저장됨') : (isEn ? 'Add' : '추가')}</button>
        </div>
      </div>

      {/* Add Rule */}
      {!showForm && (
        <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">+ {isEn ? 'Add Rule' : '규칙 추가'}</button>
      )}

      {/* Form */}
      {showForm && (
        <div ref={formRef} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">{editingId ? (isEn ? 'Edit Rule' : '규칙 수정') : (isEn ? 'Add Rule' : '규칙 추가')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{isEn ? 'Country' : '국가'}</label><select value={formCountry} onChange={e => setFormCountry(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">{COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{isEn ? 'Delivery Method' : '입금 방식'}</label><select value={formDelivery} onChange={e => setFormDelivery(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">{deliveryMethods.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
            <div><label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{isEn ? 'Operators' : '운영사'}</label>
              <div className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm max-h-36 overflow-y-auto space-y-1">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formOperators.size === 0} onChange={() => setFormOperators(new Set())} className="rounded" /><span className="text-slate-500">{isEn ? 'Any operator' : '전체 운영사'}</span></label>
                {operators.filter(o => o !== 'GME').map(o => (
                  <label key={o} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formOperators.has(o)} onChange={() => { const next = new Set(formOperators); if (next.has(o)) next.delete(o); else next.add(o); setFormOperators(next); }} className="rounded" />{o}</label>
                ))}
              </div>
            </div>
            <div><label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{isEn ? 'Direction' : '방향'}</label><select value={formDirection} onChange={e => setFormDirection(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"><option value="cheaper">{isEn ? 'Cheaper than GME' : 'GME보다 저렴'}</option><option value="any">{isEn ? 'Any direction' : '모든 방향'}</option></select></div>
            <div><label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{isEn ? 'Alert Type' : '알림 유형'}</label><select value={formAlertType} onChange={e => setFormAlertType(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"><option value="price">{isEn ? 'Price' : '가격'}</option><option value="rate">{isEn ? 'Rate' : '환율'}</option></select></div>
            <div><label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{formAlertType === 'rate' ? (isEn ? 'Threshold (Rate)' : '임계값 (환율)') : (isEn ? 'Threshold (KRW)' : '임계값 (KRW)')}</label><input type="number" step={formAlertType === 'rate' ? '0.01' : '1'} value={formThreshold} onChange={e => setFormThreshold(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" /><p className="text-xs text-slate-400 mt-0.5">{formAlertType === 'rate' ? (isEn ? 'Alert when rate gap exceeds this value (e.g. 0.5)' : '환율 차이가 이 값을 초과할 때 알림 (예: 0.5)') : (isEn ? 'Alert when price gap drops below this value (e.g. -2000)' : '가격 차이가 이 값 이하일 때 알림 (예: -2000)')}</p></div>
            <div><label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{isEn ? 'Cooldown' : '재알림 대기'}</label><select value={formCooldown} onChange={e => setFormCooldown(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">{COOLDOWN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">{isEn ? 'Save' : '저장'}</button>
            <button onClick={resetForm} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">{isEn ? 'Cancel' : '취소'}</button>
          </div>
        </div>
      )}

      {/* Country filter + Rules Table */}
      <div className="flex items-center gap-3">
        <select value={filterCountry} onChange={e => { setFilterCountry(e.target.value); setRulesPage(0); }} className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="">{isEn ? 'All Countries' : '전체 국가'}</option>
          {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-slate-400">{groupedRules.length} {isEn ? 'groups' : '그룹'} ({sortedRules.length} {isEn ? 'rules' : '규칙'})</span>
      </div>
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {loading ? <div className="p-8 text-center text-slate-400">Loading...</div>
        : sortedRules.length === 0 ? <div className="p-8 text-center text-slate-400">{isEn ? (filterCountry ? 'No rules for this country.' : 'No alert rules configured yet.') : (filterCountry ? '해당 국가의 규칙이 없습니다.' : '설정된 알림 규칙이 없습니다.')}</div>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3">{isEn ? 'Active' : '활성'}</th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors" onClick={() => handleSort('receiving_country')}>{isEn ? 'Country' : '국가'}{sortIcon('receiving_country')}</th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors" onClick={() => handleSort('delivery_method')}>{isEn ? 'Method' : '방식'}{sortIcon('delivery_method')}</th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors" onClick={() => handleSort('operator')}>{isEn ? 'Operator' : '운영사'}{sortIcon('operator')}</th>
                  <th className="px-4 py-3">{isEn ? 'Type' : '유형'}</th>
                  <th className="px-4 py-3">{isEn ? 'Threshold' : '임계값'}</th>
                  <th className="px-4 py-3">{isEn ? 'Cooldown' : '대기'}</th>
                  <th className="px-4 py-3">{isEn ? 'Last Triggered' : '마지막 알림'}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {pagedGroups.map(group => {
                  const rule = group.rules[0];
                  const allIds = group.rules.map(r => r.id);
                  return (
                  <tr key={group.key} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3"><button onClick={async () => { await Promise.all(group.rules.map(r => fetch('/api/alerts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, is_active: !group.is_active }) }))); fetchRules(); }} className={`w-10 h-5 rounded-full transition-colors relative ${group.is_active ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${group.is_active ? 'left-5' : 'left-0.5'}`} /></button></td>
                    <td className="px-4 py-3 font-medium">{rule.receiving_country}</td>
                    <td className="px-4 py-3">{rule.delivery_method}</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{group.operators.map((op, i) => <span key={i} className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-xs">{op}</span>)}</div></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${(rule.alert_type ?? 'price') === 'rate' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>{(rule.alert_type ?? 'price') === 'rate' ? (isEn ? 'Rate' : '환율') : (isEn ? 'Price' : '가격')}</span></td>
                    <td className="px-4 py-3 font-mono text-red-600 dark:text-red-400">{(rule.alert_type ?? 'price') === 'rate' ? rule.threshold_krw : rule.threshold_krw.toLocaleString()}</td>
                    <td className="px-4 py-3">{COOLDOWN_OPTIONS.find(o => o.value === rule.cooldown_minutes)?.label ?? `${rule.cooldown_minutes}m`}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDate(group.rules.reduce((latest, r) => r.lastTriggered && (!latest || r.lastTriggered > latest) ? r.lastTriggered : latest, null as string | null))}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => startDuplicate(rule, group.rules)} className="px-2 py-1 text-xs rounded border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">{isEn ? 'Duplicate' : '복제'}</button>
                        <button onClick={() => startEdit(rule, group.rules)} className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Edit</button>
                        <button onClick={async () => { if (!confirm(isEn ? `Delete ${allIds.length} rule(s)?` : `${allIds.length}개 규칙을 삭제하시겠습니까?`)) return; await Promise.all(allIds.map(id => fetch('/api/alerts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }))); fetchRules(); }} className="px-2 py-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">{isEn ? 'Delete' : '삭제'}</button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalRulesPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500 border-t border-slate-200 dark:border-slate-800">
            <span>{rulesPage * RULES_PAGE_SIZE + 1}–{Math.min((rulesPage + 1) * RULES_PAGE_SIZE, groupedRules.length)} / {groupedRules.length}</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setRulesPage(p => Math.max(0, p - 1))} disabled={rulesPage === 0} className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">{isEn ? 'Prev' : '이전'}</button>
              <span className="px-2">{rulesPage + 1} / {totalRulesPages}</span>
              <button onClick={() => setRulesPage(p => Math.min(totalRulesPages - 1, p + 1))} disabled={rulesPage >= totalRulesPages - 1} className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">{isEn ? 'Next' : '다음'}</button>
            </div>
          </div>
        )}
      </div>

      {/* Alert History */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">{isEn ? 'Recent Alerts' : '최근 알림'} <span className="text-slate-400 font-normal">({history.length})</span></h2>
          {history.length > 0 && (
            <button
              onClick={async () => {
                if (!confirm(isEn ? 'Clear all alert history?' : '모든 알림 이력을 삭제하시겠습니까?')) return;
                await fetch('/api/alerts/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clearAll: true }) });
                fetchHistory(); setHistoryPage(0);
              }}
              className="px-2.5 py-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              {isEn ? 'Clear All' : '전체 삭제'}
            </button>
          )}
        </div>
        {history.length === 0 ? <p className="text-sm text-slate-400">{isEn ? 'No alerts sent yet.' : '발송된 알림이 없습니다.'}</p> : (
          <>
            <div className="space-y-1">
              {history.slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE).map(log => (
                <div key={log.id} className="flex items-center justify-between text-xs py-2 border-b border-slate-100 dark:border-slate-800/50">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">{formatDate(log.notified_at)}</span>
                    <span className="font-medium">{log.receiving_country}</span>
                    <span>{log.operator}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono ${log.price_gap < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {log.price_gap > 0 ? '+' : ''}{log.price_gap.toLocaleString()} KRW
                    </span>
                    <button
                      onClick={async () => {
                        await fetch('/api/alerts/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: log.id }) });
                        fetchHistory();
                      }}
                      className="text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {history.length > HISTORY_PAGE_SIZE && (
              <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                <span>{historyPage * HISTORY_PAGE_SIZE + 1}–{Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, history.length)} / {history.length}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setHistoryPage(p => Math.max(0, p - 1))} disabled={historyPage === 0} className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">{isEn ? 'Prev' : '이전'}</button>
                  <span className="px-2">{historyPage + 1} / {Math.ceil(history.length / HISTORY_PAGE_SIZE)}</span>
                  <button onClick={() => setHistoryPage(p => Math.min(Math.ceil(history.length / HISTORY_PAGE_SIZE) - 1, p + 1))} disabled={historyPage >= Math.ceil(history.length / HISTORY_PAGE_SIZE) - 1} className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">{isEn ? 'Next' : '다음'}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Service Fees Tab ────────────────────────────────────────────────────────

interface FeeEditLog {
  id: number;
  receiving_country: string;
  operator: string;
  delivery_method: string;
  old_fee: number;
  new_fee: number;
  action: string;
  notes: string | null;
  edited_at: string;
}

function ServiceFeesTab({ isEn }: { isEn: boolean }) {
  const [fees, setFees] = useState<ServiceFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFee, setEditFee] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editEffectiveUntil, setEditEffectiveUntil] = useState('');
  const [feeHistory, setFeeHistory] = useState<FeeEditLog[]>([]);
  const [feeHistoryPage, setFeeHistoryPage] = useState(0);
  const FEE_HISTORY_PAGE_SIZE = 10;

  const fetchFees = useCallback(async () => {
    try {
      const params = selectedCountry ? `?country=${encodeURIComponent(selectedCountry)}` : '';
      const res = await fetch(`/api/settings/fees${params}`);
      const data = await res.json();
      if (Array.isArray(data)) setFees(data);
    } catch (err) { console.error('Failed to fetch fees:', err); }
    finally { setLoading(false); }
  }, [selectedCountry]);

  const fetchFeeHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/fees/history');
      const data = await res.json();
      if (Array.isArray(data)) setFeeHistory(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { setLoading(true); fetchFees(); }, [fetchFees]);
  useEffect(() => { fetchFeeHistory(); }, [fetchFeeHistory]);

  const grouped = useMemo(() => {
    const map: Record<string, ServiceFee[]> = {};
    fees.forEach(f => { if (!map[f.receiving_country]) map[f.receiving_country] = []; map[f.receiving_country].push(f); });
    return map;
  }, [fees]);

  function startEdit(fee: ServiceFee) { setEditingId(fee.id); setEditFee(String(fee.fee_krw)); setEditNotes(fee.notes ?? ''); setEditEffectiveUntil(fee.effective_until ? new Date(fee.effective_until).toISOString().slice(0, 16) : ''); }

  async function handleSave() {
    if (editingId === null) return;
    await fetch('/api/settings/fees', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, fee_krw: Number(editFee), notes: editNotes || null, effective_until: editEffectiveUntil ? new Date(editEffectiveUntil).toISOString() : null }) });
    setEditingId(null); fetchFees(); fetchFeeHistory();
  }

  async function handleReset(fee: ServiceFee) {
    const res = await fetch('/api/settings/fees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiving_country: fee.receiving_country, operator: fee.operator, delivery_method: fee.delivery_method }) });
    const { scraped_fee } = await res.json();
    const label = scraped_fee != null ? scraped_fee.toLocaleString() : 'unknown';
    if (!confirm(isEn ? `Reset ${fee.operator} fee to scraped value (${label} KRW)?` : `${fee.operator} 수수료를 스크래핑 값 (${label} KRW)으로 되돌리시겠습니까?`)) return;
    if (scraped_fee == null) return;
    await fetch('/api/settings/fees', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: fee.id, fee_krw: scraped_fee, reset: true }) });
    fetchFees(); fetchFeeHistory();
  }

  function formatDate(iso: string | null) { if (!iso) return '-'; return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }); }

  return (
    <div className="space-y-6">
      {/* Country filter */}
      <select value={selectedCountry} onChange={e => setSelectedCountry(e.target.value)} className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg px-3 py-2 text-sm">
        <option value="">{isEn ? 'All Countries' : '전체 국가'}</option>
        {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {loading ? <div className="p-8 text-center text-slate-400">Loading...</div>
      : Object.keys(grouped).length === 0 ? <div className="p-8 text-center text-slate-400">{isEn ? 'No fee data yet. Fees will be populated after the next scraper run.' : '수수료 데이터가 없습니다. 다음 스크래퍼 실행 후 자동으로 채워집니다.'}</div>
      : Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([country, countryFees]) => (
        <div key={country} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800"><h3 className="text-sm font-semibold">{country}</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-2.5">{isEn ? 'Operator' : '운영사'}</th>
                  <th className="px-4 py-2.5">{isEn ? 'Delivery Method' : '입금 방식'}</th>
                  <th className="px-4 py-2.5 text-right">{isEn ? 'Service Fee (KRW)' : '수수료 (KRW)'}</th>
                  <th className="px-4 py-2.5">{isEn ? 'Notes' : '메모'}</th>
                  <th className="px-4 py-2.5">{isEn ? 'Status' : '상태'}</th>
                  <th className="px-4 py-2.5">{isEn ? 'Edited At' : '수정 시간'}</th>
                  <th className="px-4 py-2.5">{isEn ? 'Effective Until' : '유효 기간'}</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {countryFees.map(fee => (
                  <tr key={fee.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-medium">{fee.operator}</td>
                    <td className="px-4 py-2.5 text-slate-500">{fee.delivery_method === 'Bank Deposit' ? 'Bank Deposit' : fee.delivery_method}</td>
                    {editingId === fee.id ? (
                      <>
                        <td className="px-4 py-2.5 text-right"><input type="number" value={editFee} onChange={e => setEditFee(e.target.value)} className="w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-right" autoFocus /></td>
                        <td className="px-4 py-2.5"><input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder={isEn ? 'Add note...' : '메모 추가...'} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" /></td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">{fee.manually_edited ? (isEn ? 'Edited' : '수정됨') : (isEn ? 'Default' : '기본값')}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">{fee.manually_edited && fee.edited_at ? formatDate(fee.edited_at) : '-'}</td>
                        <td className="px-4 py-2.5"><input type="datetime-local" value={editEffectiveUntil} onChange={e => setEditEffectiveUntil(e.target.value)} className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs" /></td>
                        <td className="px-4 py-2.5"><div className="flex gap-1"><button onClick={handleSave} className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">{isEn ? 'Save' : '저장'}</button><button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">{isEn ? 'Cancel' : '취소'}</button></div></td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 text-right font-mono">{fee.fee_krw.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{fee.notes ?? '-'}</td>
                        <td className="px-4 py-2.5 text-xs">{fee.manually_edited ? <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">{isEn ? 'Edited' : '수정됨'}</span> : <span className="text-slate-400">{isEn ? 'Default' : '기본값'}</span>}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">{fee.manually_edited && fee.edited_at ? formatDate(fee.edited_at) : '-'}</td>
                        <td className="px-4 py-2.5 text-xs">{fee.effective_until ? (new Date(fee.effective_until) < new Date() ? <span className="text-red-500">{isEn ? 'Expired' : '만료'}</span> : <span className="text-blue-600 dark:text-blue-400">{formatDate(fee.effective_until)}</span>) : <span className="text-slate-400">-</span>}</td>
                        <td className="px-4 py-2.5"><div className="flex gap-1"><button onClick={() => startEdit(fee)} className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Edit</button>{fee.manually_edited && <button onClick={() => handleReset(fee)} className="px-2 py-1 text-xs rounded border border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">Reset</button>}</div></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Fee Edit History */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">{isEn ? 'Edit History' : '수정 이력'} <span className="text-slate-400 font-normal">({feeHistory.length})</span></h2>
          {feeHistory.length > 0 && (
            <button
              onClick={async () => {
                if (!confirm(isEn ? 'Clear all fee edit history?' : '모든 수수료 수정 이력을 삭제하시겠습니까?')) return;
                await fetch('/api/settings/fees/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clearAll: true }) });
                fetchFeeHistory(); setFeeHistoryPage(0);
              }}
              className="px-2.5 py-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              {isEn ? 'Clear All' : '전체 삭제'}
            </button>
          )}
        </div>
        {feeHistory.length === 0 ? <p className="text-sm text-slate-400">{isEn ? 'No edits yet.' : '수정 이력이 없습니다.'}</p> : (
          <>
            <div className="space-y-1">
              {feeHistory.slice(feeHistoryPage * FEE_HISTORY_PAGE_SIZE, (feeHistoryPage + 1) * FEE_HISTORY_PAGE_SIZE).map(log => (
                <div key={log.id} className="flex items-center justify-between text-xs py-2 border-b border-slate-100 dark:border-slate-800/50">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">{formatDate(log.edited_at)}</span>
                    <span className="font-medium">{log.receiving_country}</span>
                    <span>{log.operator}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${log.action === 'reset' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>{log.action === 'reset' ? 'Reset' : 'Edit'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-500">{log.old_fee.toLocaleString()}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-mono font-semibold">{log.new_fee.toLocaleString()}</span>
                    <button
                      onClick={async () => {
                        await fetch('/api/settings/fees/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: log.id }) });
                        fetchFeeHistory();
                      }}
                      className="text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {feeHistory.length > FEE_HISTORY_PAGE_SIZE && (
              <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                <span>{feeHistoryPage * FEE_HISTORY_PAGE_SIZE + 1}–{Math.min((feeHistoryPage + 1) * FEE_HISTORY_PAGE_SIZE, feeHistory.length)} / {feeHistory.length}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setFeeHistoryPage(p => Math.max(0, p - 1))} disabled={feeHistoryPage === 0} className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">{isEn ? 'Prev' : '이전'}</button>
                  <span className="px-2">{feeHistoryPage + 1} / {Math.ceil(feeHistory.length / FEE_HISTORY_PAGE_SIZE)}</span>
                  <button onClick={() => setFeeHistoryPage(p => Math.min(Math.ceil(feeHistory.length / FEE_HISTORY_PAGE_SIZE) - 1, p + 1))} disabled={feeHistoryPage >= Math.ceil(feeHistory.length / FEE_HISTORY_PAGE_SIZE) - 1} className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">{isEn ? 'Next' : '다음'}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Scraper Health Tab ──────────────────────────────────────────────────────

interface HealthData {
  days: number;
  totalRuns: number;
  overallSuccessRate: number;
  corridors: {
    country: string;
    deliveryMethod: string;
    totalRuns: number;
    operators: {
      operator: string;
      successes: number;
      failures: number;
      successRate: number;
      lastSuccess: string | null;
      lastFailure: string | null;
    }[];
  }[];
  recentFailures: { runHour: string; country: string; operator: string; deliveryMethod: string }[];
}

function ScraperHealthTab({ isEn }: { isEn: boolean }) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [failurePage, setFailurePage] = useState(0);
  const FAILURE_PAGE_SIZE = 10;

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/health?days=${days}`);
      const data = await res.json();
      if (data?.corridors) setHealth(data);
    } catch (err) { console.error('Failed to fetch health:', err); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  function formatRunHour(rh: string | null) {
    if (!rh) return '-';
    const [date, time] = rh.split(' ');
    return `${date.slice(5)} ${time}`;
  }

  function rateColor(rate: number) {
    if (rate >= 95) return 'text-green-600 dark:text-green-400';
    if (rate >= 80) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  }

  function rateBg(rate: number) {
    if (rate >= 95) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
    if (rate >= 80) return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
    return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
  }

  if (loading) return <div className="p-8 text-center text-slate-400">Loading...</div>;
  if (!health) return <div className="p-8 text-center text-slate-400">{isEn ? 'No health data available.' : '상태 데이터가 없습니다.'}</div>;

  const issueCorridors = health.corridors.filter(c => c.operators.some(o => o.successRate < 95));

  return (
    <div className="space-y-6">
      {/* Date range */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">{isEn ? 'Period:' : '기간:'}</span>
        {[1, 3, 7].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${days === d ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
            {d === 1 ? (isEn ? '24h' : '24시간') : `${d}${isEn ? ' days' : '일'}`}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">{isEn ? 'Total Scrape Runs' : '총 스크래핑 횟수'}</p>
          <p className="text-2xl font-bold">{health.totalRuns}</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">{isEn ? 'Overall Success Rate' : '전체 성공률'}</p>
          <p className={`text-2xl font-bold ${rateColor(health.overallSuccessRate)}`}>{health.overallSuccessRate}%</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">{isEn ? 'Corridors with Issues' : '이슈 발생 복도'}</p>
          <p className={`text-2xl font-bold ${issueCorridors.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>{issueCorridors.length} / {health.corridors.length}</p>
        </div>
      </div>

      {/* Per-corridor tables */}
      {health.corridors.map(corridor => (
        <div key={`${corridor.country}||${corridor.deliveryMethod}`} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{corridor.country} <span className="text-slate-400 font-normal">— {corridor.deliveryMethod === 'Bank Deposit' ? 'Bank Deposit' : corridor.deliveryMethod}</span></h3>
            <span className="text-xs text-slate-400">{corridor.totalRuns} {isEn ? 'runs' : '회'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-2.5">{isEn ? 'Operator' : '운영사'}</th>
                  <th className="px-4 py-2.5 text-center">{isEn ? 'Success Rate' : '성공률'}</th>
                  <th className="px-4 py-2.5 text-right">{isEn ? 'Successes' : '성공'}</th>
                  <th className="px-4 py-2.5 text-right">{isEn ? 'Failures' : '실패'}</th>
                  <th className="px-4 py-2.5">{isEn ? 'Last Success' : '최근 성공'}</th>
                  <th className="px-4 py-2.5">{isEn ? 'Last Failure' : '최근 실패'}</th>
                </tr>
              </thead>
              <tbody>
                {corridor.operators.map(op => (
                  <tr key={op.operator} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-medium">{op.operator}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rateBg(op.successRate)}`}>{op.successRate}%</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-green-600 dark:text-green-400">{op.successes}</td>
                    <td className="px-4 py-2.5 text-right text-red-600 dark:text-red-400">{op.failures > 0 ? op.failures : '-'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{formatRunHour(op.lastSuccess)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{op.lastFailure ? formatRunHour(op.lastFailure) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Recent failures */}
      {health.recentFailures.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">{isEn ? 'Recent Failures' : '최근 실패'} <span className="text-slate-400 font-normal">({health.recentFailures.length})</span></h2>
          </div>
          <>
            <div className="space-y-1">
              {health.recentFailures.slice(failurePage * FAILURE_PAGE_SIZE, (failurePage + 1) * FAILURE_PAGE_SIZE).map((f, i) => (
                <div key={i} className="flex items-center gap-3 text-xs py-2 border-b border-slate-100 dark:border-slate-800/50">
                  <span className="text-slate-400">{formatRunHour(f.runHour)}</span>
                  <span className="font-medium">{f.country}</span>
                  <span className="text-red-600 dark:text-red-400">{f.operator}</span>
                  <span className="text-slate-400">{f.deliveryMethod === 'Bank Deposit' ? 'Bank Deposit' : f.deliveryMethod}</span>
                </div>
              ))}
            </div>
            {health.recentFailures.length > FAILURE_PAGE_SIZE && (
              <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                <span>{failurePage * FAILURE_PAGE_SIZE + 1}–{Math.min((failurePage + 1) * FAILURE_PAGE_SIZE, health.recentFailures.length)} / {health.recentFailures.length}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setFailurePage(p => Math.max(0, p - 1))} disabled={failurePage === 0} className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">{isEn ? 'Prev' : '이전'}</button>
                  <span className="px-2">{failurePage + 1} / {Math.ceil(health.recentFailures.length / FAILURE_PAGE_SIZE)}</span>
                  <button onClick={() => setFailurePage(p => Math.min(Math.ceil(health.recentFailures.length / FAILURE_PAGE_SIZE) - 1, p + 1))} disabled={failurePage >= Math.ceil(health.recentFailures.length / FAILURE_PAGE_SIZE) - 1} className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">{isEn ? 'Next' : '다음'}</button>
                </div>
              </div>
            )}
          </>
        </div>
      )}
    </div>
  );
}
