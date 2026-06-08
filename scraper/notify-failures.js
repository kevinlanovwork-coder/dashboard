/**
 * 시간당 실패 다이제스트 (Hourly failure digest)
 *
 * 모든 코리도(corridor) 스크래퍼는 실패 시 scraper_failure_log 테이블에 기록한다.
 * 이 스크립트는 현재 KST 시(hour)에 기록된 모든 실패를 한 통의 이메일로 묶어 보낸다.
 *
 * notify 잡(job)은 15분마다 트리거되는 워크플로마다 한 번 실행되지만,
 * failure_notification_log 의 UNIQUE hour_key 로 인해 시(hour)당 최대 1통만 발송된다
 * (옵션 A: 그 시간의 첫 실패 실행이 발송).
 */
import supabase from './lib/supabase.js';
import { getRunHour } from './lib/browser.js';
import { sendAlertEmail } from './lib/email.js';

const REASON_LABELS = {
  website_down: 'Website down / 사이트 접속 불가',
  api_error:    'API error / API 오류',
  scrape_error: 'Scrape error / 스크래핑 오류',
};

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtml(byCorridor, hourKey, total) {
  const corridors = Object.keys(byCorridor).sort();
  const sections = corridors.map(country => {
    const rows = byCorridor[country].map(f => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:500;">${esc(f.operator)}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">${esc(f.delivery_method)}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">${esc(REASON_LABELS[f.reason] ?? f.reason)}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;color:#dc2626;font-size:12px;">${esc(f.error_message ?? '')}</td>
      </tr>`).join('');
    return `
      <h3 style="color:#1e293b;margin:18px 0 6px 0;font-size:15px;">${esc(country)} <span style="color:#94a3b8;font-weight:400;font-size:13px;">(${byCorridor[country].length})</span></h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px;"><thead><tr style="background:#f8fafc;">
        <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Operator / 운영사</th>
        <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Method / 방식</th>
        <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Reason / 사유</th>
        <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Error / 오류</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:860px;margin:0 auto;">
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin-bottom:8px;">
      <h2 style="color:#991b1b;margin:0 0 4px 0;font-size:18px;">Scraper Failure Digest — ${esc(hourKey)} KST</h2>
      <p style="color:#b91c1c;margin:0;font-size:13px;">${total} operator failure(s) across ${corridors.length} corridor(s) this hour. / 이번 시간 ${corridors.length}개 코리도에서 ${total}건 실패.</p>
    </div>
    ${sections}
    <p style="margin-top:16px;font-size:13px;">
      <a href="https://gme-competitors-rate.vercel.app/settings" style="color:#2563eb;text-decoration:none;">Open Dashboard / 대시보드 열기 →</a>
    </p>
    <p style="color:#94a3b8;font-size:11px;margin-top:20px;">Automated hourly digest — one email per hour regardless of how many 15-min runs failed. / 15분 단위 실행과 무관하게 시간당 1통으로 묶어 발송됩니다.</p>
  </div>`;
}

async function main() {
  if (!process.env.NOTIFY_EMAIL || !process.env.GMAIL_APP_PASSWORD) {
    console.log('이메일 자격 증명 미설정 — 다이제스트 건너뜀.');
    return;
  }

  const runHour = getRunHour();          // e.g. '2026-06-08 14:15'
  const hourKey = runHour.slice(0, 13);  // e.g. '2026-06-08 14'

  // ── 이번 시(hour)에 기록된 모든 실패 조회 (:00 / :15 / :30 / :45) ──────────────
  const { data: failures, error } = await supabase
    .from('scraper_failure_log')
    .select('run_hour, operator, receiving_country, delivery_method, reason, error_message')
    .like('run_hour', `${hourKey}:%`)
    .order('run_hour', { ascending: true });

  if (error) {
    console.error(`실패 로그 조회 실패: ${error.message}`);
    process.exit(1);
  }
  if (!failures || failures.length === 0) {
    console.log(`${hourKey} 에 기록된 실패 없음 — 발송할 내용 없음.`);
    return;
  }

  // ── 이미 이번 시(hour)에 발송했는지 확인 (옵션 A: 시간당 1통) ──────────────────
  // 워크플로 concurrency(group: scrape)로 실행이 직렬화되므로 check-then-send 경쟁 없음.
  // 조회 자체가 실패하면(예: 마이그레이션 022 미적용) 중복 발송을 막기 위해 발송하지 않고 종료.
  const { data: already, error: dedupErr } = await supabase
    .from('failure_notification_log')
    .select('hour_key')
    .eq('hour_key', hourKey)
    .limit(1);
  if (dedupErr) {
    console.error(`중복 확인 실패 — 다이제스트 미발송 (마이그레이션 022 적용 필요?): ${dedupErr.message}`);
    process.exit(1);
  }
  if (already?.[0]) {
    console.log(`${hourKey} 다이제스트 이미 발송됨 — 건너뜀.`);
    return;
  }

  // ── 코리도 + 운영사 + 방식 기준 중복 제거 (지속 실패는 매 실행마다 기록됨) ──────
  const seen = new Set();
  const byCorridor = {};
  for (const f of failures) {
    const key = `${f.receiving_country}||${f.operator}||${f.delivery_method}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (byCorridor[f.receiving_country] ??= []).push(f);
  }
  const total = seen.size;

  // ── 수신자: alert_config.notify_emails, 없으면 NOTIFY_EMAIL ──────────────────
  const { data: configRows } = await supabase
    .from('alert_config').select('notify_emails').limit(1);
  const notifyEmails = configRows?.[0]?.notify_emails?.length
    ? configRows[0].notify_emails
    : [process.env.NOTIFY_EMAIL];

  const corridorCount = Object.keys(byCorridor).length;
  const subject = `[Scraper] ${total} failure(s) across ${corridorCount} corridor(s) — ${hourKey} KST`;
  const html = buildHtml(byCorridor, hourKey, total);

  // 발송을 먼저 시도하고, 성공 시에만 시(hour) 슬롯을 점유한다.
  // (발송 실패 시 슬롯을 비워두어 다음 15분 실행이 재시도하도록 함)
  await sendAlertEmail({ to: notifyEmails, subject, html });

  const { error: claimErr } = await supabase
    .from('failure_notification_log')
    .insert({ hour_key: hourKey, fail_count: total, sent_to: notifyEmails });
  if (claimErr && claimErr.code !== '23505') {
    console.warn(`슬롯 기록 실패 (비치명적): ${claimErr.message}`);
  }

  console.log(`✅ 실패 다이제스트 발송: ${hourKey} — ${total}건 / ${corridorCount}개 코리도 → ${notifyEmails.join(', ')}`);
}

main().catch(err => {
  console.error('예기치 않은 오류:', err);
  process.exit(1);
});
