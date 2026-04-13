/**
 * Alipay 수령 방식 탐색 스크립트 (임시)
 * 실행: node discover-alipay.js
 *
 * 브라우저 기반 사업자 사이트에서 중국(CNY) 선택 후
 * Alipay 관련 수령 방식 선택자(라디오, 드롭다운, 탭 등)를 자동 탐색합니다.
 */
import { chromium } from 'playwright';

const OPERATORS = [
  {
    name: 'SBI',
    url: 'https://www.sbicosmoney.com/',
    async setup(page) {
      await page.waitForTimeout(2000);
      await page.click('button:has-text("Close")').catch(() => null);
      await page.waitForTimeout(500);
      await page.click('.dest-country');
      await page.waitForTimeout(500);
      await page.click('a[data-currency="CNY"]');
      await page.waitForTimeout(2000);
    },
  },
  {
    name: 'Cross',
    url: 'https://crossenf.com/remittance',
    async setup(page) {
      await page.waitForTimeout(2000);
      await page.locator('div.relative:has(span:text("THB"))').click();
      await page.waitForSelector('#aside-root ul', { timeout: 10000 });
      await page.locator('#aside-root li:has(img[alt="CN flag"])').click();
      await page.waitForTimeout(2000);
    },
  },
  {
    name: 'WireBarley',
    url: 'https://www.wirebarley.com/ko',
    async setup(page) {
      await page.waitForTimeout(3000);
      await page.locator('#lafc-popup button').click().catch(() => null);
      await page.waitForTimeout(1000);
      await page.locator('[data-title="currencyToMoneyBox"]').nth(1)
        .locator('img[alt="드롭 다운"]').click();
      await page.waitForTimeout(2000);
      await page.locator('button:has(img[alt="CN"])').click();
      await page.waitForTimeout(3000);
    },
  },
  {
    name: 'Coinshot',
    url: 'https://coinshot.org/main',
    async setup(page) {
      await page.waitForTimeout(2000);
      await page.waitForSelector('button.lang-btn[value="ko"]', { timeout: 10000 });
      await page.click('button.lang-btn[value="ko"]');
      await page.waitForTimeout(1000);
      await page.click('#current-receiving-currency');
      await page.waitForTimeout(500);
      await page.click('#select-receiving-currency a[data-currency="CNY"]');
      await page.waitForTimeout(2000);
    },
  },
  {
    name: 'E9Pay',
    url: 'https://www.e9pay.co.kr/',
    async setup(page) {
      await page.waitForTimeout(3000);
      await page.waitForSelector('#CN_CNY', { state: 'attached', timeout: 10000 });
      await page.evaluate(() => {
        const radio = document.querySelector('#CN_CNY');
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('click', { bubbles: true }));
      });
      await page.waitForTimeout(2000);
    },
  },
  {
    name: 'Utransfer',
    url: 'https://www.utransfer.com',
    async setup(page) {
      await page.waitForTimeout(2000);
      await page.locator('select').nth(1).selectOption('CNY');
      await page.waitForTimeout(2000);
    },
  },
  {
    name: 'Moin',
    url: 'https://www.themoin.com/',
    async setup(page) {
      await page.waitForTimeout(3000);
      await page.evaluate(() => {
        document.querySelector('#portalRoot div[style*="top: 21px"]')?.click();
      });
      await page.waitForTimeout(1000);
      await page.locator('div[color="var(--primary-100)"] div[class*="sc-qZusK"]').click();
      await page.waitForTimeout(2000);
      await page.locator('text=중국').first().click();
      await page.waitForTimeout(3000);
    },
  },
  {
    name: 'Debunk',
    url: 'https://www.debunk.co.kr/',
    async setup(page) {
      await page.waitForTimeout(3000);
    },
  },
];

// 페이지에서 Alipay 관련 요소 탐색
async function discoverAlipayElements(page) {
  return page.evaluate(() => {
    const keywords = ['alipay', '알리페이', 'ali pay', 'zhifubao', '支付宝'];
    const results = [];

    // 모든 텍스트 노드에서 Alipay 키워드 검색
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim().toLowerCase();
      if (keywords.some(kw => text.includes(kw))) {
        const el = walker.currentNode.parentElement;
        results.push({
          type: 'text_match',
          tag: el?.tagName,
          id: el?.id || null,
          class: el?.className || null,
          text: walker.currentNode.textContent.trim().slice(0, 100),
          parentTag: el?.parentElement?.tagName,
          parentId: el?.parentElement?.id || null,
        });
      }
    }

    // 라디오 버튼, 셀렉트 옵션, 탭 등에서 검색
    const selectors = [
      'input[type="radio"]',
      'select option',
      '[role="tab"]',
      '[role="option"]',
      'button',
      'a',
      'label',
      'li',
      'div[class*="tab"]',
      'div[class*="method"]',
      'div[class*="delivery"]',
      'div[class*="payment"]',
    ];

    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').toLowerCase();
        if (keywords.some(kw => text.includes(kw))) {
          results.push({
            type: 'interactive_element',
            selector: sel,
            tag: el.tagName,
            id: el.id || null,
            class: el.className || null,
            value: el.value || null,
            text: (el.textContent || '').trim().slice(0, 100),
            name: el.name || null,
          });
        }
      });
    }

    // delivery method 관련 셀렉터 일반 검색
    const deliverySelectors = document.querySelectorAll(
      '[class*="delivery"], [class*="method"], [class*="payout"], [id*="delivery"], [id*="method"], [id*="payout"], [name*="delivery"], [name*="method"]'
    );
    deliverySelectors.forEach(el => {
      results.push({
        type: 'delivery_selector',
        tag: el.tagName,
        id: el.id || null,
        class: el.className?.toString().slice(0, 200) || null,
        name: el.name || null,
        text: (el.textContent || '').trim().slice(0, 200),
        childCount: el.children.length,
        innerHTML: el.innerHTML.slice(0, 500),
      });
    });

    return results;
  });
}

async function main() {
  console.log('Alipay 수령 방식 탐색 시작\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const op of OPERATORS) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${op.name} — ${op.url}`);
    console.log('═'.repeat(60));

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      locale: 'ko-KR',
    });
    const page = await context.newPage();

    try {
      await page.goto(op.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await op.setup(page);

      const findings = await discoverAlipayElements(page);

      if (findings.length === 0) {
        console.log('  ❌ Alipay 관련 요소 없음');
      } else {
        console.log(`  ✅ ${findings.length}개 요소 발견:`);
        findings.forEach((f, i) => {
          console.log(`\n  [${i + 1}] type: ${f.type}`);
          Object.entries(f).forEach(([k, v]) => {
            if (k !== 'type' && v !== null && v !== undefined && v !== '') {
              console.log(`      ${k}: ${typeof v === 'string' ? v.slice(0, 150) : v}`);
            }
          });
        });
      }
    } catch (err) {
      console.error(`  ⚠️  오류: ${err.message}`);
    } finally {
      await page.close();
      await context.close();
    }
  }

  await browser.close();
  console.log('\n\n탐색 완료.\n');
}

main().catch(err => {
  console.error('예기치 않은 오류:', err);
  process.exit(1);
});
