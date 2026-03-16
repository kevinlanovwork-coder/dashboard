# GME Exchange Rate Comparison Dashboard

A real-time remittance rate monitoring dashboard for **Global Money Express (GME)**, tracking how GME's KRW → foreign currency rates compare against competitors across multiple corridors — updated every 30 minutes, 24/7.

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
        │
        ▼  (Playwright browser automation + fetch API, every 30 min)
  GitHub Actions  ──────────────────────────────────────────┐
  (matrix: one job per corridor, runs in parallel)          │
        │                                                   │
        ▼  (Supabase JS client)                             │
    Supabase (PostgreSQL)                                   │
        │                                                   │
        ▼  (Next.js API route reads on each request)        │
  Dashboard (Next.js + Recharts)  ◄── Vercel (auto-deploy) ─┘
        │
        ▼
    Browser (user)
```

---

## Corridors tracked

| Country      | Currency | Receive Baseline   | Operators |
|--------------|----------|--------------------|-----------|
| Indonesia    | IDR      | 13,000,000 IDR     | GME, GMoneyTrans, Sentbe, Hanpass, Utransfer, SBI, Cross, Coinshot, JRF, E9Pay |
| Thailand     | THB      | 26,000 THB         | GME, GMoneyTrans, Sentbe, Hanpass, Utransfer, SBI, Cross, Coinshot, JRF, E9Pay |
| Vietnam      | VND      | 20,000,000 VND     | GME, GMoneyTrans, Sentbe, Hanpass, Utransfer, SBI, Cross, Coinshot, JRF, E9Pay |
| Mongolia     | MNT      | 2,500,000 MNT      | GME, GMoneyTrans, Sentbe, Hanpass, Utransfer, SBI, Cross, Coinshot, JRF, E9Pay |
| Nepal        | NPR      | 100,000 NPR        | GME, GMoneyTrans, Sentbe, Hanpass, Utransfer, SBI, Cross, Coinshot, JRF, E9Pay |
| China        | CNY      | 10,000 CNY         | GME, GMoneyTrans*, Sentbe, Hanpass, SBI, Cross, WireBarley, Coinshot, E9Pay, Utransfer |
| Cambodia     | USD      | 1,000 USD          | GME, GMoneyTrans, Sentbe, Hanpass, SBI, E9Pay |
| Myanmar      | MMK      | 5,000,000 MMK      | GME, GMoneyTrans, Hanpass, SBI, E9Pay |
| Philippines  | PHP      | 40,000 PHP         | GME, GMoneyTrans, SBI, Coinshot, Cross, E9Pay, JRF, Utransfer, Hanpass |
| Cameroon     | XAF      | 200,000 XAF        | GME, GMoneyTrans |
| Liberia      | USD      | 500 USD            | GME, GMoneyTrans |

> \* GMoneyTrans uses **Alipay** for China; all other operators use Bank Account transfer.

---

## Dashboard features

- **Snapshot bar chart** — total send amount per operator at the latest scrape, with exchange rate labels
- **Avg. Price Difference chart** — daily average gap vs GME per operator, with a date picker
- **GME Baseline Trend** — GME send amount over time (line chart), filterable by start date
- **Operator Trend** — per-operator send amount over time, with operator and date dropdowns
- **KPI cards** — Receive Baseline, Latest GME Baseline, Cheaper Competitors, More Expensive Competitors
- **Detailed data table** — full record history with search, status filter, and pagination
- **Soft delete** — incorrect scrape results can be removed via the API without losing audit trail
- **Dark / Light mode** — toggled in the header, persisted in `localStorage`
- **EN / 한국어** — full bilingual UI, persisted in `localStorage`
- **Country persistence** — selected corridor is remembered across page refreshes

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
| Vercel | — | Hosting, auto-deploy on push |

### Scraper (backend)
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20 | Runtime (ESM modules) |
| Playwright | 1.40+ | Browser automation (Chromium) |
| Supabase JS | 2 | Writing scraped data to database |
| fetch API | built-in | Direct API calls (e.g. GMoneyTrans, Hanpass) |

### Infrastructure
| Technology | Purpose |
|---|---|
| Supabase (PostgreSQL) | Stores all rate records with timestamps |
| GitHub Actions | Runs all scrapers every 30 min via `workflow_dispatch` |
| cron-job.org | External cron service that triggers GitHub Actions at :00 and :30 UTC |
| GitHub Secrets | Securely stores `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, notification credentials |

### AI
| Tool | Purpose |
|---|---|
| Claude (Anthropic) | Built and iterated the entire project — scrapers, dashboard UI, debugging, git workflow |

---

## Project structure

```
dashboard/
├── app/
│   ├── api/
│   │   └── rates/
│   │       └── route.ts               # GET rates + DELETE (soft-delete) API
│   ├── components/
│   │   └── Dashboard.tsx              # Main dashboard component (charts, table, KPIs)
│   ├── lib/
│   │   ├── parseRates.ts             # RateRecord type + data loader
│   │   └── ratesData.ts              # Static rates data (fallback)
│   ├── page.tsx                       # Next.js root page (server-side data fetch)
│   ├── layout.tsx                     # Root layout with fonts
│   └── globals.css                    # Tailwind CSS styling
├── scraper/
│   ├── lib/
│   │   ├── browser.js                 # Shared helpers (extractNumber, getRunHour, withRetry, trySelectors)
│   │   └── supabase.js                # Supabase client (write, upsert)
│   ├── scrapers/                      # Operator scraper modules
│   │   ├── gme.js                     # GME (Playwright)
│   │   ├── gmoneytrans.js             # GMoneyTrans (fetch API)
│   │   ├── sentbe.js                  # Sentbe (Playwright)
│   │   ├── hanpass.js                 # Hanpass (fetch API)
│   │   ├── utransfer.js               # Utransfer (Playwright)
│   │   ├── sbi.js                     # SBI (Playwright)
│   │   ├── cross.js                   # Cross (Playwright)
│   │   ├── coinshot.js                # Coinshot (Playwright)
│   │   ├── jrf.js                     # JRF (Playwright)
│   │   ├── e9pay.js                   # E9Pay (Playwright)
│   │   └── wirebarley.js             # WireBarley (Playwright)
│   ├── run-idr.js                     # Indonesia IDR scraper
│   ├── run-thb.js                     # Thailand THB scraper
│   ├── run-vnd.js                     # Vietnam VND scraper
│   ├── run-mnt.js                     # Mongolia MNT scraper
│   ├── run-npr.js                     # Nepal NPR scraper
│   ├── run-cny.js                     # China CNY scraper
│   ├── run-khm.js                     # Cambodia USD scraper
│   ├── run-mmk.js                     # Myanmar MMK scraper
│   ├── run-php.js                     # Philippines PHP scraper
│   ├── run-xaf.js                     # Cameroon XAF scraper
│   ├── run-lbr.js                     # Liberia USD scraper
│   └── package.json
├── data/
│   └── rates.csv                      # Historical rates data (backup/seed)
├── .github/
│   └── workflows/
│       └── scrape.yml                 # GitHub Actions — matrix scrape (11 corridors)
├── vercel.json                        # Vercel deployment config
└── README.md
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
node --env-file=.env run-cny.js      # China
node --env-file=.env run-khm.js      # Cambodia
node --env-file=.env run-mmk.js      # Myanmar
node --env-file=.env run-php.js      # Philippines
node --env-file=.env run-xaf.js      # Cameroon
node --env-file=.env run-lbr.js      # Liberia
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

An external cron service (cron-job.org) triggers the GitHub Actions workflow via `workflow_dispatch` every 30 minutes (at :00 and :30 UTC). Each corridor runs as a separate parallel job in a matrix strategy, so all 11 corridors are scraped simultaneously within the same workflow run. Timestamps are rounded to the nearest 30-minute mark in KST (UTC+9).

---

## Key engineering notes

- **CSS module hash instability** — Some sites (e.g. Hanpass) use hashed CSS class names that change on redeploy. Selectors use partial attribute matching (`[class*="recipientAmountField"]`) for resilience.
- **`networkidle` timeouts** — Several sites never fully settle. Scrapers use `domcontentloaded` + explicit `waitForTimeout` instead.
- **Fee vs. exchange amount** — Some sites (e.g. E9Pay) show only the exchange amount in the "send" field; the service fee must be added separately to compute the true total.
- **Parallel scraping** — All operators per corridor run via `Promise.allSettled()` so a single failure does not block the rest.
- **Retry with backoff** — `withRetry()` wrapper retries failed scrapes with exponential backoff (3s, 6s delays).
- **Selector fallbacks** — `trySelectors()` attempts multiple CSS selectors per field, handling sites that change their DOM structure.
- **Soft deletes** — Records are soft-deleted via `deleted_at` timestamp to preserve audit trail.
- **Hardcoded fees** — Where sites show fees inconsistently or not at all, fees are hardcoded per corridor based on verified values from the live site.
- **Failure notifications** — GitHub Actions sends email alerts when scrapers partially fail, identifying which operators encountered errors.
