# GME Rate Scraper

Web scraper that collects remittance exchange rates from competing Korean
operators across **23 countries / 26 corridor runs** and saves the results to
Supabase. Runs every 15 minutes via GitHub Actions.

## Architecture

```
scraper/
├── run-idr.js          # Indonesia    IDR 13,000,000  (Bank Deposit)
├── run-thb.js          # Thailand     THB 26,000      (Bank Deposit)
├── run-mnt.js          # Mongolia     MNT 2,500,000   (Bank Deposit)
├── run-vnd.js          # Vietnam      VND 20,000,000  (Bank Deposit)
├── run-npr.js          # Nepal        NPR 100,000     (Bank Deposit)
├── run-cny.js          # China        CNY 10,000      (Alipay)
├── run-khm.js          # Cambodia     USD 1,000       (Bank Deposit + Cash Pickup)
├── run-mmk.js          # Myanmar      MMK 1,000,000   (Bank Deposit)
├── run-php.js          # Philippines  PHP 40,000      (Bank Deposit + Cash Pickup)
├── run-pkr.js          # Pakistan     PKR 100,000     (Bank Deposit)
├── run-lak.js          # Laos         LAK 15,000,000  (Bank Deposit, LAK)
├── run-lak-usd.js      # Laos         USD 1,000       (Bank Deposit, USD)
├── run-lkr.js          # Sri Lanka    LKR 230,000     (Bank Deposit)
├── run-inr.js          # India        INR 100,000     (Bank Deposit)
├── run-tls.js          # Timor Leste  USD 1,000       (Bank Deposit + Cash Pickup MoneyGram)
├── run-bdt.js          # Bangladesh   BDT 100,000     (Bank Deposit)
├── run-uzb.js          # Uzbekistan   USD 1,000       (Cash Pickup)
├── run-uzb-card.js     # Uzbekistan   UZS 1,000,000   (Card Payment)
├── run-rub.js          # Russia       RUB 10,000      (Cash Payment + Card Payment)
├── run-kzt.js          # Kazakhstan   USD 1,000       (Cash Pickup)
├── run-kgs.js          # Kyrgyzstan   USD 1,000       (Cash Pickup)
├── run-kgs-card.js     # Kyrgyzstan   KGS 50,000      (Card Payment)
├── run-ghs.js          # Ghana        GHS 5,000       (Bank Deposit + Mobile Wallet)
├── run-zar.js          # South Africa ZAR 10,000      (Bank Deposit)
├── run-cad.js          # Canada       CAD 1,000       (Bank Deposit)
├── run-ngn.js          # Nigeria      NGN 1,000,000   (Bank Deposit)
├── notify-failures.js  # Hourly failure-digest email (runs once per trigger)
├── scrapers/           # Shared operator modules (imported by the run-*.js corridors)
│   ├── gme.js
│   ├── gmoneytrans.js
│   ├── hanpass.js
│   ├── sbi.js
│   ├── jrf.js
│   ├── e9pay.js
│   ├── cross.js
│   ├── coinshot.js
│   ├── utransfer.js
│   └── wirebarley.js
└── lib/
    ├── browser.js      # getRunHour (KST), extractNumber, withRetry, trySelectors
    ├── supabase.js     # Supabase client, saveRates (outlier validation), logFailure
    ├── fees.js         # loadFees, applyFeeOverrides, seedFees, API_OPERATORS
    ├── alerts.js       # checkAlerts + competitor price-alert email logic
    └── email.js        # Gmail SMTP transport
```

> The authoritative corridor/operator configuration lives in
> `../app/lib/corridors.ts` (`OPERATOR_MAP`); the table below mirrors it.

## Corridors & Operators

| Corridor | File | Amount | Method(s) | Operators |
|---|---|---|---|---|
| Indonesia | run-idr.js | IDR 13,000,000 | Bank Deposit | GME, GMoneyTrans, Hanpass, Utransfer, SBI, Cross, Coinshot, JRF, E9Pay |
| Thailand | run-thb.js | THB 26,000 | Bank Deposit | GME, GMoneyTrans, WireBarley, Hanpass, SBI, Cross, Coinshot, JRF, E9Pay |
| Mongolia | run-mnt.js | MNT 2,500,000 | Bank Deposit | GME, GMoneyTrans, Utransfer, Cross, E9Pay, Coinshot, Hanpass |
| Vietnam | run-vnd.js | VND 20,000,000 | Bank Deposit | GME, SBI, GMoneyTrans, E9Pay, Hanpass, Cross, JRF |
| Nepal | run-npr.js | NPR 100,000 | Bank Deposit | GME, GMoneyTrans, Hanpass, JRF, E9Pay, Coinshot |
| China | run-cny.js | CNY 10,000 | Alipay | GME, GMoneyTrans, Hanpass, SBI, Cross, WireBarley, Coinshot, E9Pay, Utransfer, Moin, Debunk |
| Cambodia | run-khm.js | USD 1,000 | Bank Deposit + Cash Pickup | GME, GMoneyTrans, Hanpass, SBI, E9Pay |
| Myanmar | run-mmk.js | MMK 1,000,000 | Bank Deposit | GME, GMoneyTrans, Hanpass, SBI, E9Pay |
| Philippines | run-php.js | PHP 40,000 | Bank Deposit + Cash Pickup | GME, GMoneyTrans, SBI, Coinshot, Cross, E9Pay, JRF, Utransfer, Hanpass |
| Pakistan | run-pkr.js | PKR 100,000 | Bank Deposit | GME, GMoneyTrans, Hanpass, JRF |
| Laos (LAK) | run-lak.js | LAK 15,000,000 | Bank Deposit | GME, GMoneyTrans, E9Pay, Hanpass |
| Laos (USD) | run-lak-usd.js | USD 1,000 | Bank Deposit | GME, Hanpass, Cross |
| Sri Lanka | run-lkr.js | LKR 230,000 | Bank Deposit | GME, E9Pay, GMoneyTrans, Coinshot, JRF, Hanpass |
| India | run-inr.js | INR 100,000 | Bank Deposit | WireBarley, GMoneyTrans, GME, Hanpass |
| Timor Leste | run-tls.js | USD 1,000 | Bank Deposit + Cash Pickup (MoneyGram) | GME, GMoneyTrans, Hanpass |
| Bangladesh | run-bdt.js | BDT 100,000 | Bank Deposit | GME, GMoneyTrans, E9Pay, Utransfer, Hanpass, JRF, Cross |
| Uzbekistan (USD) | run-uzb.js | USD 1,000 | Cash Pickup | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass |
| Uzbekistan (UZS) | run-uzb-card.js | UZS 1,000,000 | Card Payment | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass |
| Russia | run-rub.js | RUB 10,000 | Cash Payment + Card Payment | GME, GMoneyTrans, E9Pay (Card Payment: GME, E9Pay only) |
| Kazakhstan | run-kzt.js | USD 1,000 | Cash Pickup | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass, Cross |
| Kyrgyzstan (USD) | run-kgs.js | USD 1,000 | Cash Pickup | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass, Cross |
| Kyrgyzstan (KGS) | run-kgs-card.js | KGS 50,000 | Card Payment | GME, GMoneyTrans, E9Pay |
| Ghana | run-ghs.js | GHS 5,000 | Bank Deposit + Mobile Wallet | GME, GMoneyTrans |
| South Africa | run-zar.js | ZAR 10,000 | Bank Deposit | GME, GMoneyTrans, Hanpass |
| Canada | run-cad.js | CAD 1,000 | Bank Deposit | GME, GMoneyTrans |
| Nigeria | run-ngn.js | NGN 1,000,000 | Bank Deposit | GME, GMoneyTrans |

## How It Runs

- **Trigger**: [cron-job.org](https://cron-job.org) fires a `workflow_dispatch`
  event every 15 minutes (`:00`/`:15`/`:30`/`:45` UTC).
- **Execution**: GitHub Actions runs all 26 corridor jobs in parallel
  (`fail-fast: false`), then a single `notify` job sends the failure digest.
- **Timeout**: 14 minutes per corridor job, 5 minutes for the notify job.
- **Browser caching**: Playwright Chromium is cached by `package-lock.json`
  hash to avoid reinstalling on every run.
- **Timestamps**: `run_hour` is rounded to the nearest 15-minute mark in KST
  (UTC+9), e.g. `2026-06-16 11:45`.

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
6. Schedule: every 15 minutes

### 4. Local Development

```bash
cd scraper
cp .env.example .env   # fill in SUPABASE_URL and SUPABASE_SERVICE_KEY
npm install
npx playwright install chromium --with-deps
node --env-file=.env run-idr.js      # run any single corridor
```

## Service Fees: API vs. Override

`API_OPERATORS` (**GME, GMoneyTrans, Hanpass**) report their service fee
directly in their own JSON APIs — `scCharge`, `serviceCharge`, and
`transferFee` respectively. That value is always authoritative:
`applyFeeOverrides()` skips these operators, `seedFees()` never creates
`service_fees` rows for them, and the Settings UI hides them. Migration
`020_remove_api_operator_fees.sql` purged their stale override rows.

For browser-scraped operators where the site exposes the fee inconsistently or
not at all, each corridor passes a fallback fee, and admins can override it from
**Settings → Service Fees** (persisted in the `service_fees` table across runs).

## Failure Notifications

Every corridor scraper records its failures to the `scraper_failure_log` table
(via `logFailure()` in `lib/supabase.js`), keyed by `run_hour`.

After all corridor jobs finish, a single `notify` job runs `notify-failures.js`,
which aggregates **every** failure logged during the current KST clock-hour
(across the `:00`/`:15`/`:30`/`:45` runs) into **one** digest email, grouped by
corridor. A `UNIQUE hour_key` in `failure_notification_log` caps this at **one
email per hour** even though scraping runs every 15 minutes — the first failing
run of the hour sends; later runs that hour are skipped.

This replaced the old behavior of one email per corridor per run, which could
emit ~100 emails/hour and blew past Gmail's daily sending limit.

> Competitor price/rate alerts (`lib/alerts.js`) are a separate email path with
> their own per-rule cooldowns, unaffected by this digest.

## Data Schema

Each row saved to the `rate_records` table:

| Column | Type | Description |
|---|---|---|
| `id` | bigserial | Primary key |
| `run_hour` | text | KST datetime rounded to 15 min (e.g. `2026-06-16 11:45`) |
| `operator` | text | Operator name (GME, Hanpass, etc.) |
| `receiving_country` | text | Destination country |
| `receive_amount` | numeric | Amount received in destination currency |
| `send_amount_krw` | numeric | KRW amount excluding fee |
| `service_fee` | numeric | Service fee in KRW |
| `total_sending_amount` | numeric | Total KRW to send (send + fee) |
| `gme_baseline` | numeric | GME's total for the same run/method (for comparison) |
| `price_gap` | numeric | `total_sending_amount − gme_baseline` (null for GME row) |
| `status` | text | `'GME 유리'` or `'경쟁사 유리'` (null for GME row) |
| `delivery_method` | text | Bank Deposit, Alipay, Cash Pickup, Card Payment, etc. |
| `deleted_at` | timestamptz | Soft-delete marker (legacy; kept so old soft-deletes stay hidden) |
| `scraped_at` | timestamptz | Insert timestamp |

**Unique key:** `(run_hour, operator, receiving_country, delivery_method)` — `saveRates()` upserts on this.

## Engineering Notes

### Reliability: `withRetry`

Operators that show transient failures in GitHub Actions CI (network resets, timeouts) are wrapped with `withRetry(fn, retries=2, delayMs=3000)`. This retries up to 2 times with 3 s / 6 s exponential backoff:

- **GME** — `domcontentloaded` instead of `networkidle` (analytics keep network busy), plus `withRetry`
- **SBI** — `withRetry` for transient timeouts
- **JRF** — `withRetry` for transient timeouts
- **E9Pay** — `withRetry` for `ERR_NETWORK_CHANGED`

### Outlier detection

`saveRates()` validates each value against the median of the last 12 records for
that operator/corridor/method before inserting. Round multiples of 1,000 KRW
with >10% deviation are treated as scraping defaults; any value with >50%
deviation is treated as an outlier. Flagged values are skipped and logged to
`outlier_log` (Coinshot is exempt from the round-number check — it legitimately
returns round values).

### Hanpass: React input

Hanpass uses React-controlled inputs that ignore `page.fill()`. The correct approach is `keyboard.type()` followed by `dispatchEvent('blur')`, then `waitForFunction` polling `#deposit` until it changes from its previous value.

### JRF: shared module + 2026 site redesign (iframe calculator)

All corridors that scrape JRF import the single `scrapers/jrf.js` module and pass
per-corridor options (`countryCode`, `country`, `amount`, optional `payout`,
`fee`/`feeFallback`, and `deliveryMethod`).

In 2026 jpremit.co.kr moved its calculator into an iframe served from
`https://rateweb.jpremit.co.kr/`, which the module loads directly. The old
markup (`#co-list`, `#div_curr`, `li#<currency>`, `#rec_money`, `#send_money`)
no longer exists. The new calculator:

- **Country & payout** are hidden `<select>`s (`#country` by ISO code e.g. `ID`,
  `#payout` `B`=Bank Account / `C`=Cash Pickup). They're set via JS
  (`value` + `change` event) — the calc engine reads the hidden select directly,
  not the custom dropdown label.
- **Receiving amount** (`#receiverAmount`) must be filled with *real keystrokes*
  (`keyboard.type`); `page.fill()` does not trigger the recalculation.
- **Sending amount** is read from `#senderAmount`; the **fee** is parsed from the
  `Sending Fee : N KRW` text (the real per-corridor fee — so Pakistan is 0, etc.).
  `fee` forces a fixed value; `feeFallback` is used only if the text can't be parsed.

JRF's certificate is expired — all JRF contexts use `ignoreHTTPSErrors: true`.

> Note: `compare-fees.js` is an unrelated dev utility that still references the
> old JRF markup; it is not part of the scrape pipeline.

### GME USD corridors: direct API

The GME calculator UI is disabled for all USD corridors (`data-showamount="N"`). USD scraping (Cambodia, Timor Leste, Uzbekistan, Kazakhstan, Kyrgyzstan, Laos-USD) uses a direct POST to `Default.aspx` with `method=GetExRate&calBy=P&pAmt=…`, which returns `collAmt` (total KRW) and `scCharge` (fee) as JSON — no browser needed.

### GMoneyTrans: Alipay for China

GMoneyTrans China uses Alipay as the payment method (`payment_type=Alipay`) because bank transfers are not supported for that corridor.

### Moin popup

Moin's site renders a fullscreen popup via a React portal (`#portalRoot`) that intercepts pointer events. It is hidden via an injected style (`#portalRoot .mds-modal { display: none }`) before any interaction.
