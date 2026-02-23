# GME Rate Scraper

Hourly web scraper that collects remittance exchange rates from competing Korean operators across 8 corridors and saves results to Supabase.

## Architecture

```
scraper/
├── run-idr.js          # Indonesia  (IDR 13,000,000)
├── run-thb.js          # Thailand   (THB 26,000)
├── run-mnt.js          # Mongolia   (MNT 100,000)
├── run-vnd.js          # Vietnam    (VND 5,000,000)
├── run-npr.js          # Nepal      (NPR 100,000)
├── run-cny.js          # China      (CNY 10,000)
├── run-khm.js          # Cambodia   (USD 1,000)
├── run-mmk.js          # Myanmar    (MMK 5,000,000)
├── scrapers/           # Shared operator modules (used by run-idr.js)
│   ├── gme.js
│   ├── gmoneytrans.js
│   ├── sentbe.js
│   ├── hanpass.js
│   ├── sbi.js
│   ├── jrf.js
│   ├── e9pay.js
│   ├── cross.js
│   ├── coinshot.js
│   ├── utransfer.js
│   └── wirebarley.js
└── lib/
    ├── browser.js      # getRunHour, extractNumber, withRetry
    └── supabase.js     # saveRates
```

## Corridors & Operators

| Corridor | File | Amount | Operators |
|---|---|---|---|
| Indonesia | run-idr.js | IDR 13,000,000 | GME, GMoneyTrans, Sentbe, Hanpass, Utransfer, SBI, Cross, Coinshot, JRF, E9Pay |
| Thailand | run-thb.js | THB 26,000 | GME, GMoneyTrans, Sentbe, Hanpass, SBI, E9Pay, Coinshot, JRF |
| Mongolia | run-mnt.js | MNT 100,000 | GME, GMoneyTrans, Sentbe, Hanpass, SBI, E9Pay |
| Vietnam | run-vnd.js | VND 5,000,000 | GME, GMoneyTrans, Sentbe, Hanpass, SBI, JRF, E9Pay, Coinshot |
| Nepal | run-npr.js | NPR 100,000 | GME, GMoneyTrans, Sentbe, Hanpass, JRF, E9Pay, Coinshot |
| China | run-cny.js | CNY 10,000 | GME, GMoneyTrans, Sentbe, Hanpass, SBI, Cross, WireBarley, Coinshot, E9Pay, Utransfer, Moin, Debunk |
| Cambodia | run-khm.js | USD 1,000 | GME, GMoneyTrans, Sentbe, Hanpass, SBI, E9Pay |
| Myanmar | run-mmk.js | MMK 5,000,000 | GME, GMoneyTrans, Hanpass, SBI, E9Pay |

## How It Runs

- **Trigger**: [cron-job.org](https://cron-job.org) fires a `workflow_dispatch` event every hour at `:00 UTC`
- **Execution**: GitHub Actions runs all 8 corridor jobs in parallel (`fail-fast: false`)
- **Timeout**: 20 minutes per job
- **Browser caching**: Playwright Chromium is cached by `package-lock.json` hash to avoid reinstalling on every run

## Setup

### 1. GitHub Secrets

| Secret | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `NOTIFY_EMAIL` | Gmail address for failure alerts |
| `GMAIL_APP_PASSWORD` | Gmail App Password (not account password) |

### 2. Gmail App Password

1. Enable 2-Step Verification on the Gmail account
2. Go to **Google Account → Security → App passwords**
3. Create an app password for "Mail"
4. Save it as the `GMAIL_APP_PASSWORD` secret

### 3. cron-job.org Setup

1. Create a new job at [cron-job.org](https://cron-job.org)
2. URL: `https://api.github.com/repos/{owner}/{repo}/actions/workflows/scrape.yml/dispatches`
3. Method: `POST`
4. Headers: `Authorization: Bearer {GITHUB_PAT}`, `Accept: application/vnd.github+json`
5. Body: `{"ref":"main"}`
6. Schedule: every hour

### 4. Local Development

```bash
cd scraper
cp .env.example .env   # fill in SUPABASE_URL and SUPABASE_SERVICE_KEY
npm install
node --env-file=.env run-idr.js
```

## Failure Notifications

When any scraper within a corridor run fails, the workflow sends a Gmail alert with:
- Which operators failed and their error messages
- A link to the GitHub Actions run

The check looks for the Korean string `실패한 스크래퍼` in scraper output. Only corridors with partial failures send an email — a corridor with zero successful results exits with code 1 and the job itself fails.

## Data Schema

Each row saved to Supabase:

| Column | Type | Description |
|---|---|---|
| `run_hour` | text | ISO datetime truncated to hour |
| `operator` | text | Operator name (GME, Sentbe, etc.) |
| `receiving_country` | text | Destination country |
| `receive_amount` | numeric | Amount received in destination currency |
| `send_amount_krw` | numeric | KRW amount excluding fee |
| `service_fee` | numeric | Service fee in KRW |
| `total_sending_amount` | numeric | Total KRW to send (send + fee) |
| `gme_baseline` | numeric | GME's total for same run (for comparison) |
| `price_gap` | numeric | `total_sending_amount − gme_baseline` (null for GME row) |
| `status` | text | `'GME 유리'` or `'경쟁사 유리'` (null for GME row) |

## Engineering Notes

### Reliability: `withRetry`

Operators that show transient failures in GitHub Actions CI (network resets, timeouts) are wrapped with `withRetry(fn, retries=2, delayMs=3000)`. This retries up to 2 times with 3 s / 6 s exponential backoff:

- **GME** — `domcontentloaded` instead of `networkidle` (analytics keep network busy), plus `withRetry`
- **SBI** — `withRetry` for transient timeouts
- **JRF** — `withRetry` for transient timeouts
- **E9Pay** — `withRetry` for `ERR_NETWORK_CHANGED`

### Hanpass: React input

Hanpass uses React-controlled inputs that ignore `page.fill()`. The correct approach is `keyboard.type()` followed by `dispatchEvent('blur')`, then `waitForFunction` polling `#deposit` until it changes from its previous value.

### JRF: SSL & dropdown visibility

JRF's certificate is expired — all JRF contexts use `ignoreHTTPSErrors: true`. The country dropdown uses a CSS animation; `waitForSelector('li#IDR', { state: 'visible' })` is used instead of a fixed timeout.

### GME Cambodia USD: direct API

The GME calculator UI is disabled for all USD corridors (`data-showamount="N"`). Cambodia USD scraping uses a direct POST to `Default.aspx` with `method=GetExRate&calBy=P&pAmt=1000`, which returns `collAmt` (total KRW) and `scCharge` (fee) as JSON — no browser needed.

### GMoneyTrans China: Alipay

GMoneyTrans China uses Alipay as the payment method (`payment_type=Alipay`) because bank transfers are not supported for that corridor.

### Moin popup

Moin's site renders a fullscreen popup via a React portal (`#portalRoot`) that intercepts pointer events. It is dismissed with `page.evaluate(() => document.querySelector('#portalRoot div[style*="top: 21px"]')?.click())` before any interaction.

### Sentbe Cambodia USD currency selector

Sentbe's dropdown has both `캄보디아` (KHR) and `캄보디아 / 달러` (USD) entries. The selector uses `has-text("캄보디아 / 달러")` to avoid matching the wrong currency.
