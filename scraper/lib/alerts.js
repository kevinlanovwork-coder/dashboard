import supabase from './supabase.js';
import { sendAlertEmail } from './email.js';

/**
 * Check alert rules against the latest scrape results and send notifications.
 * Email recipients are fetched from the global alert_config table.
 * This function is non-fatal — errors are logged but never thrown.
 *
 * @param {Array<{operator:string, receiving_country:string, delivery_method:string,
 *   price_gap:number|null, total_sending_amount:number, gme_baseline:number|null}>} records
 * @param {string} runHour
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
    if (notifyEmails.length === 0) return; // no recipients configured

    // Fetch active rules for this corridor
    const { data: rules, error } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('is_active', true)
      .eq('receiving_country', country);

    if (error || !rules || rules.length === 0) return;

    for (const rule of rules) {
      try {
        await processRule(rule, records, runHour, notifyEmails);
      } catch (err) {
        console.warn(`  ⚠️ Alert rule #${rule.id} failed: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`  ⚠️ Alert check failed (non-fatal): ${err.message}`);
  }
}

async function processRule(rule, records, runHour, notifyEmails) {
  // Filter records that match this rule
  const matching = records.filter(r => {
    if (r.operator === 'GME') return false;          // skip GME itself
    if (r.price_gap === null) return false;           // no gap computed
    if (rule.operator && r.operator !== rule.operator) return false;
    if (rule.delivery_method && r.delivery_method !== rule.delivery_method) return false;

    // Check threshold: for 'cheaper', price_gap must be <= threshold (negative)
    if (rule.direction === 'cheaper') {
      return r.price_gap <= rule.threshold_krw;
    }
    // 'any' direction: absolute gap exceeds absolute threshold
    return Math.abs(r.price_gap) >= Math.abs(rule.threshold_krw);
  });

  if (matching.length === 0) return;

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
    if (Date.now() - lastNotified.getTime() < cooldownMs) {
      return; // still in cooldown
    }
  }

  // Build and send email
  const country = rule.receiving_country;
  const sorted = matching.sort((a, b) => a.price_gap - b.price_gap);
  const subject = `[Notice] ${matching.length} competitor${matching.length > 1 ? 's' : ''} cheaper than GME for ${country}`;

  const rows = sorted.map(r => `
    <tr>
      <td style="padding:6px 12px;border:1px solid #ddd;">${r.operator}</td>
      <td style="padding:6px 12px;border:1px solid #ddd;">${r.delivery_method}</td>
      <td style="padding:6px 12px;border:1px solid #ddd;text-align:right;">${r.total_sending_amount?.toLocaleString('ko-KR')} KRW</td>
      <td style="padding:6px 12px;border:1px solid #ddd;text-align:right;">${r.gme_baseline?.toLocaleString('ko-KR') ?? '-'} KRW</td>
      <td style="padding:6px 12px;border:1px solid #ddd;text-align:right;color:${r.price_gap < 0 ? '#dc2626' : '#16a34a'};">${r.price_gap > 0 ? '+' : ''}${r.price_gap?.toLocaleString('ko-KR')} KRW</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:sans-serif;max-width:600px;">
      <h2 style="color:#1e293b;">GME Competitors Price Alert - ${country}</h2>
      <p style="color:#64748b;">Run: ${runHour} KST &nbsp;|&nbsp; Threshold: ${rule.threshold_krw?.toLocaleString('ko-KR')} KRW</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:6px 12px;border:1px solid #ddd;text-align:left;">Operator</th>
            <th style="padding:6px 12px;border:1px solid #ddd;text-align:left;">Method</th>
            <th style="padding:6px 12px;border:1px solid #ddd;text-align:right;">Competitors Price</th>
            <th style="padding:6px 12px;border:1px solid #ddd;text-align:right;">GME Baseline</th>
            <th style="padding:6px 12px;border:1px solid #ddd;text-align:right;">Price Gap</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;">
        <a href="https://gme-competitors-rate.vercel.app" style="color:#2563eb;">Open Dashboard</a>
      </p>
    </div>
  `;

  await sendAlertEmail({ to: notifyEmails, subject, html });

  // Log each triggered operator
  const logEntries = matching.map(r => ({
    alert_rule_id: rule.id,
    run_hour: runHour,
    operator: r.operator,
    receiving_country: country,
    price_gap: r.price_gap,
    total_sending_amount: r.total_sending_amount,
    gme_baseline: r.gme_baseline,
    email_sent_to: notifyEmails,
  }));

  await supabase.from('alert_log').insert(logEntries);

  console.log(`  📧 Alert sent for rule #${rule.id}: ${matching.length} operator(s) → ${notifyEmails.join(', ')}`);
}
