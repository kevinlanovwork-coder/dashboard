import supabase from './supabase.js';
import { sendAlertEmail } from './email.js';

const CURRENCY_MAP = {
  Indonesia: 'IDR', Thailand: 'THB', Vietnam: 'VND', Nepal: 'NPR',
  Philippines: 'PHP', Cambodia: 'USD', China: 'CNY', Mongolia: 'MNT',
  Myanmar: 'MMK', Pakistan: 'PKR', Laos: 'LAK', 'Sri Lanka': 'LKR',
  India: 'INR', Liberia: 'USD',
};

function calcRate(receiveAmount, sendKRW) {
  if (!receiveAmount || !sendKRW) return null;
  const raw = receiveAmount / sendKRW;
  return raw >= 1 ? raw : sendKRW / receiveAmount;
}

/**
 * Check alert rules against the latest scrape results and send one combined
 * email per corridor with all triggered operators, suggested GME rates, and thresholds.
 * This function is non-fatal — errors are logged but never thrown.
 */
export async function checkAlerts(records, runHour) {
  try {
    if (!process.env.NOTIFY_EMAIL || !process.env.GMAIL_APP_PASSWORD) {
      return; // email credentials not configured — skip silently
    }

    const country = records[0]?.receiving_country;
    if (!country) return;

    // Fetch global email recipients
    const { data: configRows } = await supabase
      .from('alert_config')
      .select('notify_emails')
      .limit(1);

    const notifyEmails = configRows?.[0]?.notify_emails ?? [];
    if (notifyEmails.length === 0) return;

    // Fetch active rules for this corridor
    const { data: rules, error } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('is_active', true)
      .eq('receiving_country', country);

    if (error || !rules || rules.length === 0) return;

    // Find GME record(s) for fee & baseline info
    const gmeRecords = records.filter(r => r.operator === 'GME');
    const gme = gmeRecords[0];
    const gmeRate = gme ? calcRate(gme.receive_amount, gme.send_amount_krw) : null;
    const gmeRateStr = gmeRate != null ? gmeRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
    const gmeInfo = gme
      ? `GME Current: ${gme.total_sending_amount?.toLocaleString('ko-KR')} KRW (Send: ${gme.send_amount_krw?.toLocaleString('ko-KR')} + Fee: ${gme.service_fee?.toLocaleString('ko-KR')}) | Rate: ${gmeRateStr}`
      : '';
    const receiveInfo = `Receive Amount: ${gme?.receive_amount?.toLocaleString('ko-KR') ?? '-'} ${CURRENCY_MAP[country] ?? country}`;

    // Split rules by type
    const priceRules = rules.filter(r => (r.alert_type ?? 'price') === 'price');
    const rateRules  = rules.filter(r => r.alert_type === 'rate');

    // ── Process PRICE rules (existing logic) ─────────────────────────────
    const priceTriggered = [];
    const priceSeenKeys = new Set();
    const priceRuleIds = [];

    for (const rule of priceRules) {
      const { data: lastLog } = await supabase
        .from('alert_log').select('notified_at').eq('alert_rule_id', rule.id)
        .order('notified_at', { ascending: false }).limit(1);
      if (lastLog?.[0]) {
        const cooldownMs = (rule.cooldown_minutes ?? 120) * 60 * 1000;
        if (Date.now() - new Date(lastLog[0].notified_at).getTime() < cooldownMs) continue;
      }

      const matching = records.filter(r => {
        if (r.operator === 'GME') return false;
        if (r.price_gap === null) return false;
        if (rule.operator && r.operator !== rule.operator) return false;
        if (rule.delivery_method && r.delivery_method !== rule.delivery_method) return false;
        if (rule.direction === 'cheaper') return r.price_gap <= rule.threshold_krw;
        return Math.abs(r.price_gap) >= Math.abs(rule.threshold_krw);
      });
      if (matching.length === 0) continue;
      priceRuleIds.push(rule.id);

      for (const r of matching) {
        const key = `${r.operator}||${r.delivery_method}`;
        if (priceSeenKeys.has(key)) continue;
        priceSeenKeys.add(key);
        const gmeMatch = gmeRecords.find(g => g.delivery_method === r.delivery_method) ?? gme;
        const gmeFee = gmeMatch?.service_fee ?? 0;
        const suggestedGmeSend = r.total_sending_amount - gmeFee;
        const suggestedRate = r.receive_amount > 0 && suggestedGmeSend > 0
          ? calcRate(r.receive_amount, suggestedGmeSend) : null;
        priceTriggered.push({ ...r, threshold: rule.threshold_krw, gmeFee, suggestedGmeSend, suggestedRate });
      }
    }

    if (priceTriggered.length > 0) {
      priceTriggered.sort((a, b) => a.price_gap - b.price_gap);
      const cheaperCount = priceTriggered.filter(r => r.price_gap < 0).length;
      const subject = `[Notice] ${cheaperCount} competitor${cheaperCount !== 1 ? 's' : ''} cheaper than GME for ${country}`;
      const rows = priceTriggered.map(r => {
        const gapColor = r.price_gap < 0 ? '#dc2626' : '#16a34a';
        const rateStr = r.suggestedRate != null ? r.suggestedRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
        return `<tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.operator}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.delivery_method}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${r.total_sending_amount?.toLocaleString('ko-KR')}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${r.service_fee?.toLocaleString('ko-KR') ?? '0'}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${r.gme_baseline?.toLocaleString('ko-KR') ?? '-'}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;color:${gapColor};font-weight:bold;">${r.price_gap > 0 ? '+' : ''}${r.price_gap?.toLocaleString('ko-KR')}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${r.threshold?.toLocaleString('ko-KR')}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;color:#2563eb;font-weight:bold;">${rateStr}</td>
        </tr>`;
      }).join('');
      const html = `<div style="font-family:sans-serif;max-width:900px;">
        <h2 style="color:#1e293b;margin-bottom:4px;">GME Competitors Price Alert - ${country}</h2>
        <p style="color:#64748b;margin-top:0;">Run: ${runHour} KST &nbsp;|&nbsp; ${receiveInfo}</p>
        ${gmeInfo ? `<p style="color:#ef4444;font-weight:bold;margin:8px 0;">${gmeInfo}</p>` : ''}
        <table style="border-collapse:collapse;width:100%;font-size:13px;"><thead><tr style="background:#f1f5f9;">
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Operator</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Method</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">Competitor Price</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">Their Fee</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">GME Baseline</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">Price Gap</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">Threshold</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;color:#2563eb;">Suggested Rate</th>
        </tr></thead><tbody>${rows}</tbody></table>
        <p style="color:#94a3b8;font-size:12px;margin-top:12px;">* Suggested Rate = rate GME needs to match the competitor's price (after deducting GME fee).</p>
        <p style="margin-top:12px;"><a href="https://gme-competitors-rate.vercel.app" style="color:#2563eb;">Open Dashboard</a></p>
      </div>`;
      await sendAlertEmail({ to: notifyEmails, subject, html });
      const logEntries = priceTriggered.map(r => ({
        alert_rule_id: priceRuleIds[0], run_hour: runHour, operator: r.operator,
        receiving_country: country, price_gap: r.price_gap,
        total_sending_amount: r.total_sending_amount, gme_baseline: r.gme_baseline, email_sent_to: notifyEmails,
      }));
      await supabase.from('alert_log').insert(logEntries);
      console.log(`  📧 Price alert sent for ${country}: ${priceTriggered.length} operator(s) → ${notifyEmails.join(', ')}`);
    }

    // ── Process RATE rules ───────────────────────────────────────────────
    const rateTriggered = [];
    const rateSeenKeys = new Set();
    const rateRuleIds = [];

    for (const rule of rateRules) {
      const { data: lastLog } = await supabase
        .from('alert_log').select('notified_at').eq('alert_rule_id', rule.id)
        .order('notified_at', { ascending: false }).limit(1);
      if (lastLog?.[0]) {
        const cooldownMs = (rule.cooldown_minutes ?? 120) * 60 * 1000;
        if (Date.now() - new Date(lastLog[0].notified_at).getTime() < cooldownMs) continue;
      }

      const matching = records.filter(r => {
        if (r.operator === 'GME') return false;
        if (rule.operator && r.operator !== rule.operator) return false;
        if (rule.delivery_method && r.delivery_method !== rule.delivery_method) return false;
        const compRate = calcRate(r.receive_amount, r.send_amount_krw);
        if (compRate === null || gmeRate === null) return false;
        const rateGap = Math.abs(compRate - gmeRate);
        return rateGap >= Math.abs(rule.threshold_krw);
      });
      if (matching.length === 0) continue;
      rateRuleIds.push(rule.id);

      for (const r of matching) {
        const key = `${r.operator}||${r.delivery_method}`;
        if (rateSeenKeys.has(key)) continue;
        rateSeenKeys.add(key);
        const compRate = calcRate(r.receive_amount, r.send_amount_krw);
        const rateGap = compRate !== null && gmeRate !== null ? compRate - gmeRate : null;
        rateTriggered.push({ ...r, compRate, rateGap, threshold: rule.threshold_krw });
      }
    }

    if (rateTriggered.length > 0) {
      rateTriggered.sort((a, b) => (a.rateGap ?? 0) - (b.rateGap ?? 0));
      const subject = `[Notice] Rate alert: ${rateTriggered.length} competitor${rateTriggered.length !== 1 ? 's' : ''} for ${country}`;
      const fmtRate = (v) => v != null ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
      const rows = rateTriggered.map(r => {
        const gapColor = r.rateGap != null && r.rateGap < 0 ? '#dc2626' : '#16a34a';
        return `<tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.operator}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.delivery_method}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${fmtRate(r.compRate)}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${fmtRate(gmeRate)}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;color:${gapColor};font-weight:bold;">${r.rateGap != null ? (r.rateGap > 0 ? '+' : '') + fmtRate(r.rateGap) : '-'}</td>
        </tr>`;
      }).join('');
      const html = `<div style="font-family:sans-serif;max-width:700px;">
        <h2 style="color:#1e293b;margin-bottom:4px;">GME Competitors Rate Alert - ${country}</h2>
        <p style="color:#64748b;margin-top:0;">Run: ${runHour} KST &nbsp;|&nbsp; ${receiveInfo}</p>
        ${gmeInfo ? `<p style="color:#ef4444;font-weight:bold;margin:8px 0;">${gmeInfo}</p>` : ''}
        <table style="border-collapse:collapse;width:100%;font-size:13px;"><thead><tr style="background:#f1f5f9;">
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Operator</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Method</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">Competitor Rate</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">GME Rate</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">Rate Gap</th>
        </tr></thead><tbody>${rows}</tbody></table>
        <p style="color:#94a3b8;font-size:12px;margin-top:12px;">* Rate Gap = Competitor Rate - GME Rate.</p>
        <p style="margin-top:12px;"><a href="https://gme-competitors-rate.vercel.app" style="color:#2563eb;">Open Dashboard</a></p>
      </div>`;
      await sendAlertEmail({ to: notifyEmails, subject, html });
      const logEntries = rateTriggered.map(r => ({
        alert_rule_id: rateRuleIds[0], run_hour: runHour, operator: r.operator,
        receiving_country: country, price_gap: r.rateGap,
        total_sending_amount: r.total_sending_amount, gme_baseline: r.gme_baseline, email_sent_to: notifyEmails,
      }));
      await supabase.from('alert_log').insert(logEntries);
      console.log(`  📧 Rate alert sent for ${country}: ${rateTriggered.length} operator(s) → ${notifyEmails.join(', ')}`);
    }
  } catch (err) {
    console.warn(`  ⚠️ Alert check failed (non-fatal): ${err.message}`);
  }
}
