# GME Exchange Rate Comparison Dashboard

A real-time remittance rate monitoring dashboard for **Global Money Express (GME)**, tracking how GME's KRW → foreign currency rates compare against competitors across multiple corridors - updated every 30 minutes, 24/7.

---

## What it does

Every 30 minutes, automated scrapers visit competitor remittance websites, extract their send amounts and fees for a fixed receive amount, and store the results in a database. The dashboard visualises this data so GME can instantly see:

- Who is cheaper or more expensive right now
- How the gap has changed over time
- Which operators are consistently competitive per corridor

---

## Architecture

```
Competitor websites
        |
        v  (Playwright browser automation + fetch API, every 30 min)
  GitHub Actions  -------------------------------------------+
  (matrix: one job per corridor, runs in parallel)           |
        |                                                    |
        v  (Supabase JS client)                              |
    Supabase (PostgreSQL)                                    |
        |                                                    |
        v  (Next.js API route reads on each request)         |
  Dashboard (Next.js + Recharts)  <-- Vercel (auto-deploy) --+
        |
        v
    Browser (user)
```

---

## Corridors tracked

| Country      | Currency | Receive Baseline   | Deposit Method | Operators |
|--------------|----------|--------------------|----------------|-----------|
| Indonesia    | IDR      | 13,000,000 IDR     | Bank Deposit | GME, GMoneyTrans, Hanpass, Utransfer, SBI, Cross, Coinshot, JRF, E9Pay |
| Thailand     | THB      | 26,000 THB         | Bank Deposit | GME, GMoneyTrans, WireBarley, Hanpass, SBI, Cross, Coinshot, JRF, E9Pay |
| Vietnam      | VND      | 20,000,000 VND     | Bank Deposit | GME, SBI, GMoneyTrans, E9Pay, Hanpass, Cross, JRF |
| Mongolia     | MNT      | 2,500,000 MNT      | Bank Deposit | GME, GMoneyTrans, Utransfer, Cross, E9Pay, Coinshot, Hanpass |
| Nepal        | NPR      | 100,000 NPR        | Bank Deposit | GME, GMoneyTrans, Hanpass, JRF, E9Pay, Coinshot |
| China        | CNY      | 10,000 CNY         | Alipay | GME, GMoneyTrans, Hanpass, SBI, Cross, WireBarley, Coinshot, E9Pay, Utransfer, Moin, Debunk |
| Cambodia     | USD      | 1,000 USD          | Bank Deposit + Cash Pickup | GME, GMoneyTrans, Hanpass, SBI, E9Pay |
| Myanmar      | MMK      | 1,000,000 MMK      | Bank Deposit | GME, GMoneyTrans, Hanpass, SBI, E9Pay |
| Pakistan     | PKR      | 100,000 PKR        | Bank Deposit | GME, GMoneyTrans, Hanpass, JRF |
| Laos         | LAK      | 15,000,000 LAK     | Bank Deposit | GME, GMoneyTrans, E9Pay, Hanpass |
| Sri Lanka    | LKR      | 230,000 LKR        | Bank Deposit | GME, E9Pay, GMoneyTrans, Coinshot, JRF, Hanpass |
| India        | INR      | 100,000 INR        | Bank Deposit | GMoneyTrans, GME, Hanpass |
| Timor Leste  | USD      | 1,000 USD          | Bank Deposit + Cash Pickup (MoneyGram) | GMoneyTrans, Hanpass |
| Philippines  | PHP      | 40,000 PHP         | Bank Deposit + Cash Pickup | GME, GMoneyTrans, SBI, Coinshot, Cross, E9Pay, JRF, Utransfer, Hanpass |
| Bangladesh   | BDT      | 100,000 BDT        | Bank Deposit | GME, GMoneyTrans, E9Pay, Utransfer, Hanpass, JRF, Cross |
| Russia       | RUB      | 10,000 RUB         | Cash Payment + Card Payment | GME, GMoneyTrans, E9Pay |
| Uzbekistan   | USD      | 1,000 USD          | Cash Pickup | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass |
| Uzbekistan   | UZS      | 1,000,000 UZS      | Card Payment | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass |
| Kazakhstan   | USD      | 1,000 USD          | Cash Pickup | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass, Cross |
| Kyrgyzstan   | USD      | 1,000 USD          | Cash Pickup | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass, Cross |
| Ghana        | GHS      | 5,000 GHS          | Bank Deposit | GME, GMoneyTrans |
| South Africa | ZAR      | 10,000 ZAR         | Bank Deposit | GME, GMoneyTrans, Hanpass |
| Canada       | CAD      | 1,000 CAD          | Bank Deposit | GME, GMoneyTrans |
| Nigeria      | NGN      | 1,000,000 NGN      | Bank Deposit | GME, GMoneyTrans |

---

## Dashboard features

- **Snapshot bar chart** --total send amount per operator at the latest scrape, with exchange rate labels
- **Avg. Price Difference chart** --daily average gap vs GME per operator, with a date picker
- **GME Baseline Trend** --GME send amount over time (line chart), filterable by start date
- **Operator Trend** --per-operator send amount over time, with operator and date dropdowns
- **KPI cards** --Receive Baseline, Latest GME Baseline, Cheaper Competitors, More Expensive Competitors
- **Detailed data table** --full record history with search, status filter, and pagination
- **Summary page** (`/summary`) --multi-corridor wallboard view, with each card linking back to the home dashboard pre-filtered to that corridor + deposit method (up to 12 corridors)
- **Weekly Competitive Position Report** (`/report`) --per-corridor daily ranks, weekly price-gap snapshot, and a cross-corridor Summary tab
- **Dark / Light mode** --toggled in the header, persisted in `localStorage`
- **EN / Korean** --full bilingual UI, persisted in `localStorage`
- **Country persistence** --selected corridor is remembered across page refreshes
- **Sticky filter bar** --Country, Deposit Method, Date, Time, Period dropdowns with labels, always visible
- **Last accessed** --timestamp with refresh button (right-aligned in filter bar)
- **Date range error** --charts show error message when From date is after To date
- **XLS export** --download detailed data as Excel spreadsheet
- **Outlier detection** --round-number and median-deviation guards prevent bad data from being saved (rows that would have needed manual deletion never enter the table)
- **Scraper Health** --Settings tab showing success rates, recent failures, and outliers

---

## Tech stack

### Dashboard (frontend)
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16 | React framework, SSR |
| React | 19 | UI library |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 4 | Styling, dark mode |
| Recharts | 3 | Charts (bar, line, tooltips) |
| Vercel | --| Hosting, auto-deploy on push |

### Scraper (backend)
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 22 | Runtime (ESM modules) |
| Playwright | 1.40+ | Browser automation (Chromium) |
| Supabase JS | 2 | Writing scraped data to database |
| fetch API | built-in | Direct API calls (e.g. GMoneyTrans, Hanpass) |

### Infrastructure
| Technology | Purpose |
|---|---|
| Supabase (PostgreSQL) | Stores all rate records with timestamps |
| GitHub Actions | Runs all 26 scrapers every 30 min via `workflow_dispatch` |
| cron-job.org | External cron service that triggers GitHub Actions at :00 and :30 UTC |
| GitHub Secrets | Securely stores `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, notification credentials |

### AI
| Tool | Purpose |
|---|---|
| Claude (Anthropic) | Built and iterated the entire project --scrapers, dashboard UI, debugging, git workflow |

---

## Project structure

```
dashboard/
+-- app/
|   +-- api/
|   |   +-- rates/route.ts             # GET rates
|   |   +-- alerts/                    # Alert rules + history + auth + config
|   |   +-- settings/                  # Service fees + scraper health
|   |   +-- summary/                   # Summary + Report config + aggregated rates
|   +-- components/
|   |   +-- Dashboard.tsx              # Main dashboard (charts, table, KPIs)
|   |   +-- SummaryDashboard.tsx       # Multi-corridor wallboard cards
|   |   +-- ReportDashboard.tsx        # Weekly competitive-position report
|   |   +-- Settings.tsx               # Alerts, fees, summary/report setup
|   |   +-- NotificationsPopup.tsx
|   +-- lib/
|   |   +-- parseRates.ts              # RateRecord type
|   |   +-- corridors.ts               # OPERATOR_MAP, DELIVERY_METHOD_MAP, CURRENCY_MAP
|   |   +-- rankAnalysis.ts            # Position/rank computations for Report
|   |   +-- useLiveRefresh.ts          # Visibility-aware polling hook
|   |   +-- ratesData.ts               # Static rates data (fallback)
|   +-- page.tsx                       # Home (SSR data fetch)
|   +-- summary/page.tsx               # Summary page route
|   +-- report/page.tsx                # Weekly Report route
|   +-- settings/page.tsx              # Settings route
|   +-- alerts/page.tsx                # Redirects to /settings
|   +-- layout.tsx                     # Root layout with fonts
|   +-- globals.css                    # Tailwind CSS styling
+-- scraper/
|   +-- lib/
|   |   +-- browser.js                 # Shared helpers (extractNumber, getRunHour, withRetry, trySelectors)
|   |   +-- supabase.js                # Supabase client, saveRates (with outlier validation), logFailure
|   |   +-- fees.js                    # loadFees, applyFeeOverrides, seedFees
|   |   +-- alerts.js                  # checkAlerts + email logic
|   |   +-- email.js                   # Gmail SMTP transport
|   +-- scrapers/                      # Operator scraper modules
|   |   +-- gme.js, gmoneytrans.js, hanpass.js, utransfer.js, sbi.js,
|   |   +-- cross.js, coinshot.js, jrf.js, e9pay.js, wirebarley.js
|   +-- run-{idr,thb,vnd,mnt,npr,cny}.js          # Indonesia, Thailand, Vietnam, Mongolia, Nepal, China
|   +-- run-{khm,mmk,pkr,lak,lak-usd,lkr,inr}.js  # Cambodia, Myanmar, Pakistan, Laos (LAK & USD), Sri Lanka, India
|   +-- run-{tls,php,bdt,rub}.js                  # Timor Leste, Philippines, Bangladesh, Russia
|   +-- run-{uzb,uzb-card,kzt,kgs,kgs-card}.js    # Uzbekistan (Cash & Card), Kazakhstan, Kyrgyzstan (Cash & Card)
|   +-- run-{ghs,zar,cad,ngn}.js                  # Ghana, South Africa, Canada, Nigeria
|   +-- package.json
+-- supabase/
|   +-- migrations/                    # 001..021 (init, alerts, fees, summary/report, outlier_log, …)
+-- data/
|   +-- rates.csv                      # Historical rates data (backup/seed)
+-- .github/
|   +-- workflows/
|       +-- scrape.yml                 # GitHub Actions -- matrix scrape (26 corridors)
|       +-- backup.yml                 # Weekly database backup
+-- vercel.json                        # Vercel deployment config
+-- README.md
```

---

## Running scrapers locally

```bash
cd scraper
npm install
npx playwright install chromium --with-deps

# Create .env with your Supabase credentials
echo "SUPABASE_URL=https://xxxx.supabase.co" >> .env
echo "SUPABASE_SERVICE_KEY=your_service_key" >> .env

# Run a specific corridor
node --env-file=.env run-idr.js      # Indonesia
node --env-file=.env run-thb.js      # Thailand
node --env-file=.env run-vnd.js      # Vietnam
node --env-file=.env run-mnt.js      # Mongolia
node --env-file=.env run-npr.js      # Nepal
node --env-file=.env run-cny.js      # China (Alipay)
node --env-file=.env run-khm.js      # Cambodia (Bank Deposit + Cash Pickup)
node --env-file=.env run-mmk.js      # Myanmar
node --env-file=.env run-pkr.js      # Pakistan
node --env-file=.env run-lak.js      # Laos LAK
node --env-file=.env run-lak-usd.js  # Laos USD
node --env-file=.env run-lkr.js      # Sri Lanka
node --env-file=.env run-inr.js      # India
node --env-file=.env run-tls.js      # Timor Leste (Bank Deposit + MoneyGram Cash Pickup)
node --env-file=.env run-php.js      # Philippines (Bank Deposit + Cash Pickup)
node --env-file=.env run-bdt.js      # Bangladesh
node --env-file=.env run-rub.js      # Russia (Cash Payment + Card Payment)
node --env-file=.env run-uzb.js      # Uzbekistan (Cash Pickup USD)
node --env-file=.env run-uzb-card.js # Uzbekistan (Card Payment UZS)
node --env-file=.env run-kzt.js      # Kazakhstan
node --env-file=.env run-kgs.js      # Kyrgyzstan (Cash Pickup USD)
node --env-file=.env run-kgs-card.js # Kyrgyzstan (Card Payment KGS)
node --env-file=.env run-ghs.js      # Ghana (Bank Deposit + Mobile Wallet)
node --env-file=.env run-zar.js      # South Africa
node --env-file=.env run-cad.js      # Canada
node --env-file=.env run-ngn.js      # Nigeria
```

---

## Running the dashboard locally

```bash
# In the root directory
npm install
npm run dev
# Open http://localhost:3000
```

---

## Environment variables

| Variable | Where used | Description |
|---|---|---|
| `SUPABASE_URL` | Scraper + Dashboard | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Scraper (write) | Service role key for inserting records |
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard (read) | Same URL, exposed to browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard (read) | Anon key for read-only queries |
| `NOTIFY_EMAIL` | GitHub Actions | Email address for failure notifications |
| `GMAIL_APP_PASSWORD` | GitHub Actions | Gmail app password for sending notifications |

---

## Scraping schedule

An external cron service (cron-job.org) triggers the GitHub Actions workflow via `workflow_dispatch` every 30 minutes (at :00 and :30 UTC). Each corridor runs as a separate parallel job in a matrix strategy, so all 26 corridor scripts are scraped simultaneously within the same workflow run. Timestamps are rounded to the nearest 30-minute mark in KST (UTC+9).

---

## Key engineering notes

- **CSS module hash instability** --Some sites (e.g. Hanpass) use hashed CSS class names that change on redeploy. Selectors use partial attribute matching (`[class*="recipientAmountField"]`) for resilience.
- **`networkidle` timeouts** --Several sites never fully settle. Scrapers use `domcontentloaded` + explicit `waitForTimeout` instead.
- **Fee vs. exchange amount** --Some sites (e.g. E9Pay) show only the exchange amount in the "send" field; the service fee must be added separately to compute the true total.
- **Parallel scraping** --All operators per corridor run via `Promise.allSettled()` so a single failure does not block the rest.
- **Retry with backoff** --`withRetry()` wrapper retries failed scrapes with exponential backoff (3s, 6s delays).
- **Selector fallbacks** --`trySelectors()` attempts multiple CSS selectors per field, handling sites that change their DOM structure.
- **Soft deletes (legacy)** --The `deleted_at` column on `rate_records` and the corresponding GET-handler filter remain so previously soft-deleted rows stay hidden. The UI delete button was removed once outlier detection in `saveRates()` made manual cleanup unnecessary.
- **Hardcoded fees** --Where sites show fees inconsistently or not at all, fees are hardcoded per corridor based on verified values from the live site.
- **Failure notifications** --GitHub Actions sends email alerts when scrapers partially fail, identifying which operators encountered errors.
