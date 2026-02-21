# GME Exchange Rate Comparison Dashboard

A real-time remittance rate monitoring dashboard for **Global Money Express (GME)**, tracking how GME's KRW → foreign currency rates compare against competitors across multiple corridors — updated every hour, 24/7.

---

## What it does

Every hour, automated scrapers visit competitor remittance websites, extract their send amounts and fees for a fixed receive amount, and store the results in a database. The dashboard visualises this data so GME can instantly see:

- Who is cheaper or more expensive right now
- How the gap has changed over time
- Which operators are consistently competitive per corridor

---

## Architecture

```
Competitor websites
        │
        ▼  (Playwright browser automation, hourly)
  GitHub Actions  ──────────────────────────────────────────┐
  (matrix: one job per corridor, runs in parallel)          │
        │                                                   │
        ▼  (Supabase JS client)                             │
    Supabase (PostgreSQL)                                   │
        │                                                   │
        ▼  (Next.js server reads on each request)           │
  Dashboard (Next.js + Recharts)  ◄── Vercel (auto-deploy) ─┘
        │
        ▼
    Browser (user)
```

---

## Corridors tracked

| Country    | Currency | Receive Baseline | Operators                                                        |
|------------|----------|-----------------|------------------------------------------------------------------|
| Indonesia  | IDR      | 1,000,000 IDR   | GME, GMoneyTrans, Sentbe, Hanpass, E9Pay, JRF, Coinshot          |
| Thailand   | THB      | 10,000 THB      | GME, GMoneyTrans, Sentbe, Hanpass, E9Pay, JRF, Coinshot          |
| Vietnam    | VND      | 5,000,000 VND   | GME, GMoneyTrans, Sentbe, Hanpass, E9Pay, JRF, Coinshot          |
| Mongolia   | MNT      | 100,000 MNT     | GME, GMoneyTrans, Sentbe, Hanpass, E9Pay, JRF, Coinshot          |
| Nepal      | NPR      | 100,000 NPR     | GME, GMoneyTrans, Sentbe, Hanpass, JRF, E9Pay, Coinshot          |
| China      | CNY      | 10,000 CNY      | GME, GMoneyTrans*, Sentbe, Hanpass, SBI, Cross, WireBarley, Coinshot, E9Pay, Utransfer |

> \* GMoneyTrans uses **Alipay** for China; all other operators use Bank Account transfer.

---

## Dashboard features

- **Snapshot bar chart** — total send amount per operator at the latest scrape, with exchange rate labels
- **Avg. Price Difference chart** — daily average gap vs GME per operator, with a date picker
- **GME Baseline Trend** — GME send amount over time (line chart), filterable by start date
- **Operator Trend** — per-operator send amount over time, with operator and date dropdowns
- **KPI cards** — Receive Baseline, Latest GME Baseline, Cheaper Competitors, More Expensive Competitors
- **Detailed data table** — full record history with search, status filter, and pagination
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
| fetch API | built-in | Direct API calls (e.g. GMoneyTrans) |

### Infrastructure
| Technology | Purpose |
|---|---|
| Supabase (PostgreSQL) | Stores all rate records with timestamps |
| GitHub Actions | Cron scheduler — runs all scrapers every hour |
| GitHub Secrets | Securely stores `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` |

### AI
| Tool | Purpose |
|---|---|
| Claude (Anthropic) | Built and iterated the entire project — scrapers, dashboard UI, debugging, git workflow |

---

## Project structure

```
dashboard/
├── app/
│   ├── components/
│   │   └── Dashboard.tsx       # Main dashboard component (charts, table, KPIs)
│   ├── lib/
│   │   ├── parseRates.ts       # RateRecord type + data loader
│   │   └── supabase.ts         # Supabase client (read)
│   └── page.tsx                # Next.js root page
├── scraper/
│   ├── lib/
│   │   ├── browser.js          # Shared helpers (extractNumber, getRunHour)
│   │   └── supabase.js         # Supabase client (write)
│   ├── scrapers/               # Shared scraper modules (Indonesia corridor)
│   ├── index.js                # Indonesia IDR scraper
│   ├── run-thb.js              # Thailand THB scraper
│   ├── run-vnd.js              # Vietnam VND scraper
│   ├── run-mnt.js              # Mongolia MNT scraper
│   ├── run-npr.js              # Nepal NPR scraper
│   ├── run-cny.js              # China CNY scraper
│   └── package.json
├── .github/
│   └── workflows/
│       └── scrape.yml          # GitHub Actions — hourly matrix scrape
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
node --env-file=.env index.js        # Indonesia
node --env-file=.env run-thb.js      # Thailand
node --env-file=.env run-vnd.js      # Vietnam
node --env-file=.env run-mnt.js      # Mongolia
node --env-file=.env run-npr.js      # Nepal
node --env-file=.env run-cny.js      # China
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

---

## Scraping schedule

GitHub Actions runs the scrape workflow on a `cron: '0 * * * *'` schedule (every hour at :00 UTC). Each corridor runs as a separate parallel job in a matrix strategy, so all six corridors are scraped simultaneously within the same workflow run.

---

## Key engineering notes

- **CSS module hash instability** — Some sites (e.g. Hanpass) use hashed CSS class names that change on redeploy. Selectors use partial attribute matching (`[class*="recipientAmountField"]`) for resilience.
- **`networkidle` timeouts** — Several sites never fully settle. Scrapers use `domcontentloaded` + explicit `waitForTimeout` instead.
- **Fee vs. exchange amount** — Some sites (e.g. E9Pay) show only the exchange amount in the "send" field; the service fee must be added separately to compute the true total.
- **Parallel scraping** — All operators per corridor run via `Promise.allSettled()` so a single failure does not block the rest.
- **Hardcoded fees** — Where sites show fees inconsistently or not at all, fees are hardcoded per corridor based on verified values from the live site.
