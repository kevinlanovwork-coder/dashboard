/**
 * Service fee comparison: Indonesia (IDR 13,000,000) vs Thailand (THB 26,000)
 * Run: node --env-file=.env compare-fees.js
 */
import { chromium } from 'playwright';
import { extractNumber } from './lib/browser.js';

// ── Indonesia scrapers ────────────────────────────────────────────────────
import { scrape as scrapeGme_IDR }       from './scrapers/gme.js';
import { scrape as scrapeGmt_IDR }       from './scrapers/gmoneytrans.js';
import { scrape as scrapeWb_IDR }        from './scrapers/wirebarley.js';
import { scrape as scrapeSentbe_IDR }    from './scrapers/sentbe.js';
import { scrape as scrapeHanpass_IDR }   from './scrapers/hanpass.js';
import { scrape as scrapeUtransfer_IDR } from './scrapers/utransfer.js';
import { scrape as scrapeSbi_IDR }       from './scrapers/sbi.js';
import { scrape as scrapeCross_IDR }     from './scrapers/cross.js';
import { scrape as scrapeCoinshot_IDR }  from './scrapers/coinshot.js';
import { scrape as scrapeJrf_IDR }       from './scrapers/jrf.js';
import { scrape as scrapeE9pay_IDR }     from './scrapers/e9pay.js';

// ── Thailand scrapers (reuse run-thb.js logic as functions) ───────────────
async function scrapeGme_THB(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://online.gmeremit.com/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#nCountry', { timeout: 10000 });
    await page.click('#nCountry'); await page.waitForTimeout(500);
    await page.fill('#CountryValue', 'Thailand'); await page.waitForTimeout(300);
    await page.click('#toCurrUl li[data-countrycode="THB"]'); await page.waitForTimeout(1000);
    await page.fill('#recAmt', '26000'); await page.dispatchEvent('#recAmt', 'change');
    await page.waitForTimeout(3000);
    return { service_fee: 0 };
  } finally { await page.close(); }
}

async function scrapeGmt_THB() {
  const url = 'https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp?receive_amount=26000&payout_country=Thailand&total_collected=0&payment_type=Bank+Account&currencyType=THB';
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  const m = text.match(/serviceCharge--td_clm--([\d.]+)--td_end--/);
  return { service_fee: m ? parseFloat(m[1]) : null };
}

async function scrapeWb_THB(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.wirebarley.com/ko', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.locator('#lafc-popup button').click().catch(() => null); await page.waitForTimeout(1000);
    await page.locator('[data-title="currencyToMoneyBox"]').nth(1).locator('img[alt="드롭 다운"]').click();
    await page.waitForTimeout(2000);
    await page.locator('button:has(img[alt="TH"])').click(); await page.waitForTimeout(2000);
    await page.locator('[data-title="currencyToMoneyBox"]').nth(1).locator('button').click();
    await page.waitForTimeout(500);
    await page.locator('input').nth(1).fill('26000');
    await page.locator('input').nth(1).press('Enter'); await page.waitForTimeout(3000);
    const feeRaw = await page.evaluate(() => {
      const ps = Array.from(document.querySelectorAll('p'));
      const label = ps.find(p => p.textContent.trim() === '수수료');
      return label?.nextElementSibling?.textContent?.trim() ?? null;
    });
    return { service_fee: extractNumber(feeRaw) ?? 0 };
  } finally { await page.close(); }
}

async function scrapeSentbe_THB() { return { service_fee: 5000 }; }

async function scrapeHanpass_THB(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.hanpass.com/en', { waitUntil: 'networkidle', timeout: 30000 });
    await page.locator('.ExchangeCalculator_recipientAmountField__lbLSL button').click();
    await page.waitForSelector('#countrySearch', { timeout: 10000 });
    await page.fill('#countrySearch', 'Thailand'); await page.waitForTimeout(500);
    await page.locator('button[aria-label="Thailand THB"]').first().click(); await page.waitForTimeout(1500);
    await page.fill('#recipient', '26000'); await page.press('#recipient', 'Tab'); await page.waitForTimeout(3000);
    const feeRaw = await page.locator('.ExchangeCalculator_row__EPWVT')
      .filter({ hasText: 'Remittance fee' }).locator('span:last-child').textContent().catch(() => null);
    return { service_fee: extractNumber(feeRaw) ?? 0 };
  } finally { await page.close(); }
}

async function scrapeUtransfer_THB(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.utransfer.com', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.locator('select').nth(1).selectOption('THB'); await page.waitForTimeout(1000);
    await page.fill('input[name="toAmount"]', '26000');
    await page.dispatchEvent('input[name="toAmount"]', 'change'); await page.waitForTimeout(3000);
    const feeRaw = await page.locator('.utansfer_fees').textContent().catch(() => null);
    return { service_fee: extractNumber(feeRaw) ?? 5000 };
  } finally { await page.close(); }
}

async function scrapeSbi_THB() { return { service_fee: 1000 }; }
async function scrapeCross_THB() { return { service_fee: 5000 }; }
async function scrapeCoinshot_THB() { return { service_fee: 5000 }; }

async function scrapeJrf_THB(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.jpremit.co.kr/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.click('#div_curr'); await page.waitForTimeout(500);
    await page.click('li#THB'); await page.waitForTimeout(1500);
    await page.fill('#rec_money', '26000'); await page.dispatchEvent('#rec_money', 'keyup');
    await page.waitForTimeout(3000);
    const feeRaw = await page.textContent('#servicefee').catch(() => null);
    return { service_fee: extractNumber(feeRaw) ?? 5000 };
  } finally { await page.close(); }
}

async function scrapeE9pay_THB(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.e9pay.co.kr/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#TH_THB', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const r = document.querySelector('#TH_THB');
      r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(1000);
    await page.click('#reverse'); await page.waitForTimeout(500);
    await page.fill('#receive-money', '26000'); await page.dispatchEvent('#receive-money', 'blur');
    await page.waitForTimeout(3000);
    const feeRaw = await page.$eval('#remit-fee', el => el.textContent || el.value).catch(() => null);
    return { service_fee: extractNumber(feeRaw) ?? 0 };
  } finally { await page.close(); }
}

// ── Main ──────────────────────────────────────────────────────────────────
const SCRAPERS = [
  { name: 'GME',         idr: scrapeGme_IDR,       thb: scrapeGme_THB,       idrBrowser: true,  thbBrowser: true  },
  { name: 'GMoneyTrans', idr: scrapeGmt_IDR,       thb: scrapeGmt_THB,       idrBrowser: false, thbBrowser: false },
  { name: 'WireBarley',  idr: scrapeWb_IDR,        thb: scrapeWb_THB,        idrBrowser: true,  thbBrowser: true  },
  { name: 'Sentbe',      idr: scrapeSentbe_IDR,    thb: scrapeSentbe_THB,    idrBrowser: true,  thbBrowser: false },
  { name: 'Hanpass',     idr: scrapeHanpass_IDR,   thb: scrapeHanpass_THB,   idrBrowser: true,  thbBrowser: true  },
  { name: 'Utransfer',   idr: scrapeUtransfer_IDR, thb: scrapeUtransfer_THB, idrBrowser: true,  thbBrowser: true  },
  { name: 'SBI',         idr: scrapeSbi_IDR,       thb: scrapeSbi_THB,       idrBrowser: true,  thbBrowser: false },
  { name: 'Cross',       idr: scrapeCross_IDR,     thb: scrapeCross_THB,     idrBrowser: true,  thbBrowser: false },
  { name: 'Coinshot',    idr: scrapeCoinshot_IDR,  thb: scrapeCoinshot_THB,  idrBrowser: true,  thbBrowser: false },
  { name: 'JRF',         idr: scrapeJrf_IDR,       thb: scrapeJrf_THB,       idrBrowser: true,  thbBrowser: true  },
  { name: 'E9Pay',       idr: scrapeE9pay_IDR,     thb: scrapeE9pay_THB,     idrBrowser: true,  thbBrowser: true  },
];

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const results = [];

for (const s of SCRAPERS) {
  process.stdout.write(`  ${s.name.padEnd(13)}`);
  let idrFee, thbFee;
  try {
    const r = await (s.idrBrowser ? s.idr(browser) : s.idr());
    idrFee = r.service_fee;
    process.stdout.write(`IDR: ${String(idrFee?.toLocaleString() ?? '?').padStart(6)}원  `);
  } catch(e) { idrFee = null; process.stdout.write(`IDR: ERR  `); }
  try {
    const r = await (s.thbBrowser ? s.thb(browser) : s.thb());
    thbFee = r.service_fee;
    process.stdout.write(`THB: ${String(thbFee?.toLocaleString() ?? '?').padStart(6)}원\n`);
  } catch(e) { thbFee = null; process.stdout.write(`THB: ERR\n`); }
  results.push({ name: s.name, idrFee, thbFee });
}

await browser.close();

console.log('\n══ Service Fee 비교 (IDR 13,000,000 vs THB 26,000) ══════════════════');
console.log('운영사'.padEnd(16) + 'IDR 수수료'.padStart(11) + 'THB 수수료'.padStart(11) + '  비고');
console.log('─'.repeat(52));
for (const { name, idrFee, thbFee } of results) {
  const idrStr = idrFee != null ? idrFee.toLocaleString() + '원' : 'ERR';
  const thbStr = thbFee != null ? thbFee.toLocaleString() + '원' : 'ERR';
  let note = '';
  if (idrFee != null && thbFee != null) {
    if (idrFee === thbFee) note = '동일';
    else if (thbFee > idrFee) note = `THB +${(thbFee - idrFee).toLocaleString()}원`;
    else note = `THB -${(idrFee - thbFee).toLocaleString()}원`;
  }
  console.log(name.padEnd(16) + idrStr.padStart(11) + thbStr.padStart(11) + '  ' + note);
}
