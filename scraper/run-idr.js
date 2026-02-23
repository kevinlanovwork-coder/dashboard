/**
 * 메인 스크래퍼 실행기
 * - 모든 경쟁사 사이트에서 KRW→IDR 13,000,000 송금액 수집
 * - GME 기준값 대비 가격 차이(price_gap) 계산
 * - Supabase에 저장
 */
import { chromium } from 'playwright';
import { getRunHour, withRetry } from './lib/browser.js';
import { saveRates } from './lib/supabase.js';

// ── 스크래퍼 임포트 ──────────────────────────────────────────────────────
import { scrape as scrapeGme }        from './scrapers/gme.js';
import { scrape as scrapeGmoneytrans } from './scrapers/gmoneytrans.js';
import { scrape as scrapeSentbe }     from './scrapers/sentbe.js';
import { scrape as scrapeHanpass }    from './scrapers/hanpass.js';
import { scrape as scrapeUtransfer }  from './scrapers/utransfer.js';
import { scrape as scrapeSbi }        from './scrapers/sbi.js';
import { scrape as scrapeCross }      from './scrapers/cross.js';
import { scrape as scrapeCoinshot }   from './scrapers/coinshot.js';
import { scrape as scrapeJrf }        from './scrapers/jrf.js';
import { scrape as scrapeE9pay }      from './scrapers/e9pay.js';

// ── 스크래퍼 목록 ────────────────────────────────────────────────────────
// needsBrowser: true → Playwright 브라우저 필요
// needsBrowser: false → 직접 fetch (브라우저 불필요)
const SCRAPERS = [
  { name: 'GME',          fn: (b) => withRetry(() => scrapeGme(b)), needsBrowser: true  },
  { name: 'GMoneyTrans',  fn: scrapeGmoneytrans,  needsBrowser: false },
  { name: 'Sentbe',       fn: scrapeSentbe,       needsBrowser: true  },
  { name: 'Hanpass',      fn: scrapeHanpass,      needsBrowser: true  },
  { name: 'Utransfer',    fn: scrapeUtransfer,    needsBrowser: true  },
  { name: 'SBI',          fn: (b) => withRetry(() => scrapeSbi(b)), needsBrowser: true  },
  { name: 'Cross',        fn: scrapeCross,        needsBrowser: true  },
  { name: 'Coinshot',     fn: scrapeCoinshot,     needsBrowser: true  },
  { name: 'JRF',          fn: scrapeJrf,          needsBrowser: true  },
  { name: 'E9Pay',        fn: scrapeE9pay,        needsBrowser: true  },
];

async function main() {
  const runHour = getRunHour();
  console.log(`\n[${new Date().toISOString()}] 스크래핑 시작 — run_hour: ${runHour}\n`);

  // ── Playwright 브라우저 실행 ──────────────────────────────────────────
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];
  const errors  = [];

  // ── 각 스크래퍼 병렬 실행 ─────────────────────────────────────────────
  console.log(`  모든 스크래퍼 병렬 실행 중... (${SCRAPERS.length}개)\n`);
  const settled = await Promise.allSettled(
    SCRAPERS.map(({ fn, needsBrowser }) => (needsBrowser ? fn(browser) : fn()))
  );

  for (let i = 0; i < settled.length; i++) {
    const { name } = SCRAPERS[i];
    const result = settled[i];
    if (result.status === 'fulfilled') {
      results.push(result.value);
      console.log(`  ✓ ${name}: 총 ${result.value.total_sending_amount?.toLocaleString()}원`);
    } else {
      console.error(`  ✗ ${name} 실패: ${result.reason?.message}`);
      errors.push({ name, error: result.reason?.message });
    }
  }

  await browser.close();

  if (results.length === 0) {
    console.error('\n모든 스크래퍼 실패. 종료합니다.');
    process.exit(1);
  }

  // ── GME 기준값 계산 ───────────────────────────────────────────────────
  const gmeRecord = results.find(r => r.operator === 'GME');
  const gmeBaseline = gmeRecord?.total_sending_amount ?? null;

  if (!gmeBaseline) {
    console.warn('\n⚠️  GME 기준값 없음 — price_gap 계산 불가');
  }

  // ── Supabase 저장용 레코드 구성 ───────────────────────────────────────
  const toSave = results.map(r => {
    const priceGap = gmeBaseline && r.operator !== 'GME'
      ? r.total_sending_amount - gmeBaseline
      : null;

    // price_gap > 0 → GME가 더 저렴 (competitor가 더 비쌈)
    // price_gap < 0 → competitor가 더 저렴
    const status = priceGap === null
      ? null
      : priceGap > 0
        ? 'GME 유리'
        : '경쟁사 유리';

    return {
      run_hour:             runHour,
      operator:             r.operator,
      receiving_country:    r.receiving_country,
      receive_amount:       r.receive_amount,
      send_amount_krw:      r.send_amount_krw,
      service_fee:          r.service_fee ?? 0,
      total_sending_amount: r.total_sending_amount,
      gme_baseline:         gmeBaseline,
      price_gap:            priceGap,
      status:               status,
    };
  });

  // ── Supabase 저장 ─────────────────────────────────────────────────────
  try {
    await saveRates(toSave);
    console.log(`\n✅ ${toSave.length}건 Supabase 저장 완료`);
  } catch (err) {
    console.error(`\n❌ Supabase 저장 실패: ${err.message}`);
    process.exit(1);
  }

  if (errors.length > 0) {
    console.warn(`\n⚠️  실패한 스크래퍼 (${errors.length}개):`);
    errors.forEach(e => console.warn(`   - ${e.name}: ${e.error}`));
  }

  console.log('\n완료.\n');
}

main().catch(err => {
  console.error('예기치 않은 오류:', err);
  process.exit(1);
});
