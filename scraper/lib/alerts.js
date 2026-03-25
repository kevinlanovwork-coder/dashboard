import supabase from './supabase.js';
import { sendAlertEmail } from './email.js';

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

    // Collect all triggered operators across all rules (deduplicated)
    const triggered = [];
    const seenKeys = new Set();
    const triggeredRuleIds = [];

    for (const rule of rules) {
      // Check cooldown
      const { data: lastLog } = await supabase
        .from('alert_log')
        .select('notified_at')
        .eq('alert_rule_id', rule.id)
        .order('notified_at', { ascending: false })
        .limit(1);

      if (lastLog && lastLog.length > 0) {
        const lastNotified = new Date(lastLog[0].notified_at);
        const cooldownMs = (rule.cooldown_minutes ?? 120) * 60 * 1000;
        if (Date.now() - lastNotified.getTime() < cooldownMs) continue;
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

      triggeredRuleIds.push(rule.id);

      for (const r of matching) {
        const key = `${r.operator}||${r.delivery_method}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        // Find the GME record matching this delivery method for fee calculation
        const gme = gmeRecords.find(g => g.delivery_method === r.delivery_method) ?? gmeRecords[0];
        const gmeFee = gme?.service_fee ?? 0;
        const receiveAmount = r.receive_amount;

        // Suggested GME total to match this competitor
        const suggestedGmeTotal = r.total_sending_amount;
        const suggestedGmeSend = suggestedGmeTotal - gmeFee;
        // Suggested exchange rate: how much KRW per 1 unit of foreign currency
        const suggestedRate = receiveAmount > 0 ? (suggestedGmeSend / receiveAmount) : null;

        triggered.push({
          ...r,
          threshold: rule.threshold_krw,
          gmeFee,
          suggestedGmeTotal,
          suggestedGmeSend,
          suggestedRate,
        });
      }
    }

    if (triggered.length === 0 || triggeredRuleIds.length === 0) return;

    // Sort by price gap (most negative first = cheapest competitor)
    triggered.sort((a, b) => a.price_gap - b.price_gap);

    const cheaperCount = triggered.filter(r => r.price_gap < 0).length;
    const subject = `[Notice] ${cheaperCount} competitor${cheaperCount !== 1 ? 's' : ''} cheaper than GME for ${country}`;

    const rows = triggered.map(r => {
      const gapColor = r.price_gap < 0 ? '#dc2626' : '#16a34a';
      const rateStr = r.suggestedRate != null ? r.suggestedRate.toFixed(2) : '-';
      return `
        <tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.operator}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.delivery_method}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${r.total_sending_amount?.toLocaleString('ko-KR')}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${r.service_fee?.toLocaleString('ko-KR') ?? '0'}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${r.gme_baseline?.toLocaleString('ko-KR') ?? '-'}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;color:${gapColor};font-weight:bold;">${r.price_gap > 0 ? '+' : ''}${r.price_gap?.toLocaleString('ko-KR')}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${r.threshold?.toLocaleString('ko-KR')}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;color:#2563eb;font-weight:bold;">${r.suggestedGmeTotal?.toLocaleString('ko-KR')}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;color:#2563eb;font-weight:bold;">${rateStr}</td>
        </tr>`;
    }).join('');

    // GME current info
    const gme = gmeRecords[0];
    const gmeInfo = gme
      ? `GME Current: ${gme.total_sending_amount?.toLocaleString('ko-KR')} KRW (Send: ${gme.send_amount_krw?.toLocaleString('ko-KR')} + Fee: ${gme.service_fee?.toLocaleString('ko-KR')})`
      : '';

    const html = `
      <div style="font-family:sans-serif;max-width:900px;">
        <h2 style="color:#1e293b;margin-bottom:4px;">GME Competitors Price Alert - ${country}</h2>
        <p style="color:#64748b;margin-top:0;">Run: ${runHour} KST &nbsp;|&nbsp; Receive: ${gme?.receive_amount?.toLocaleString('ko-KR') ?? '-'} ${country}</p>
        ${gmeInfo ? `<p style="color:#ef4444;font-weight:bold;margin:8px 0;">${gmeInfo}</p>` : ''}
        <table style="border-collapse:collapse;width:100%;font-size:13px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Operator</th>
              <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Method</th>
              <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">Competitor Price</th>
              <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">Their Fee</th>
              <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">GME Baseline</th>
              <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">Price Gap</th>
              <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;">Threshold</th>
              <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;color:#2563eb;">Suggested GME Total</th>
              <th style="padding:6px 10px;border:1px solid #ddd;text-align:right;color:#2563eb;">Suggested Rate</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#94a3b8;font-size:12px;margin-top:12px;">
          * Suggested GME Total = competitor's price (to match). Suggested Rate = (Suggested Total - GME Fee) / Receive Amount.
        </p>
        <p style="margin-top:12px;">
          <a href="https://gme-competitors-rate.vercel.app" style="color:#2563eb;">Open Dashboard</a>
        </p>
      </div>
    `;

    await sendAlertEmail({ to: notifyEmails, subject, html });

    // Log all triggered operators
    const logEntries = triggered.map(r => ({
      alert_rule_id: triggeredRuleIds[0],
      run_hour: runHour,
      operator: r.operator,
      receiving_country: country,
      price_gap: r.price_gap,
      total_sending_amount: r.total_sending_amount,
      gme_baseline: r.gme_baseline,
      email_sent_to: notifyEmails,
    }));

    await supabase.from('alert_log').insert(logEntries);

    console.log(`  📧 Alert sent for ${country}: ${triggered.length} operator(s) → ${notifyEmails.join(', ')}`);
  } catch (err) {
    console.warn(`  ⚠️ Alert check failed (non-fatal): ${err.message}`);
  }
}
