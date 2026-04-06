# GME Competitor Price Comparison Dashboard — Architecture

## Directory Structure

```
dashboard/
├── app/
│   ├── api/
│   │   ├── alerts/
│   │   │   ├── route.ts              # CRUD alert rules
│   │   │   ├── auth/route.ts         # Login validation
│   │   │   ├── config/route.ts       # Global email config
│   │   │   └── history/route.ts      # Alert log history
│   │   ├── rates/route.ts            # Rate data + soft-delete
│   │   └── settings/fees/route.ts    # Service fee management
│   ├── components/
│   │   ├── Dashboard.tsx             # Main dashboard (charts, KPIs, table)
│   │   └── Settings.tsx              # Alert rules + service fees (tabbed)
│   ├── lib/
│   │   ├── parseRates.ts             # RateRecord type
│   │   └── ratesData.ts              # Static fallback data
│   ├── alerts/page.tsx               # Redirects to /settings
│   ├── settings/page.tsx             # Settings page
│   ├── page.tsx                      # Home (SSR data fetch)
│   ├── layout.tsx                    # Root layout
│   └── globals.css                   # Tailwind styles
├── scraper/
│   ├── lib/
│   │   ├── browser.js                # extractNumber, getRunHour, withRetry
│   │   ├── supabase.js               # Supabase client + saveRates
│   │   ├── fees.js                   # loadFees, applyFeeOverrides, seedFees
│   │   ├── alerts.js                 # checkAlerts + email logic
│   │   └── email.js                  # Gmail SMTP transport
│   ├── scrapers/*.js                 # Individual operator modules
│   ├── run-{idr,thb,vnd,cny,...}.js  # 20 corridor runners
│   └── package.json
├── supabase/migrations/
│   ├── 001_init.sql                  # rate_records + RLS
│   ├── 002_delete_policy.sql
│   ├── 003_soft_delete.sql           # deleted_at + trigger
│   ├── 004_add_delivery_method.sql   # delivery_method + unique constraint
│   ├── 005_alert_rules.sql           # alert_config, alert_rules, alert_log
│   ├── 006_service_fees.sql          # service_fees table
│   └── 007_service_fees_edit_tracking.sql
├── .github/workflows/scrape.yml      # GitHub Actions (20 parallel jobs)
├── .github/workflows/backup.yml      # Weekly database backup
├── public/GME_swirl_icon.png         # Logo
└── .env.local                        # Local env vars
```

## Database Schema (Supabase PostgreSQL)

### `rate_records` — Main scraped data

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| run_hour | TEXT NOT NULL | "2026-03-27 15:00" (KST, 30-min intervals) |
| operator | TEXT NOT NULL | GME, Sentbe, Hanpass, etc. |
| receiving_country | TEXT NOT NULL | Indonesia, China, etc. |
| receive_amount | NUMERIC NOT NULL | Fixed amount per corridor |
| send_amount_krw | NUMERIC | Exchange amount only |
| service_fee | NUMERIC DEFAULT 0 | Service fee in KRW |
| total_sending_amount | NUMERIC NOT NULL | send_amount + fee |
| gme_baseline | NUMERIC | GME's total for same run_hour |
| price_gap | NUMERIC | competitor total - GME total |
| status | TEXT | GME / Cheaper than GME / Expensive than GME |
| delivery_method | TEXT NOT NULL DEFAULT 'Bank Account' | Bank Account, Alipay, etc. |
| deleted_at | TIMESTAMPTZ | Soft-delete marker |
| scraped_at | TIMESTAMPTZ DEFAULT NOW() | |

**Unique:** `(run_hour, operator, receiving_country, delivery_method)`

### `alert_config` — Global email recipients

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | Single row |
| notify_emails | TEXT[] NOT NULL | Array of email addresses |
| updated_at | TIMESTAMPTZ | |

### `alert_rules` — Configurable alert thresholds

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| receiving_country | TEXT NOT NULL | |
| operator | TEXT | NULL = any operator |
| delivery_method | TEXT DEFAULT 'Bank Account' | |
| direction | TEXT DEFAULT 'cheaper' | 'cheaper' or 'any' |
| threshold_krw | NUMERIC NOT NULL | e.g. -2000 (negative = competitor cheaper) |
| cooldown_minutes | INTEGER DEFAULT 120 | Min time between repeat alerts |
| is_active | BOOLEAN DEFAULT TRUE | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `alert_log` — Alert history and cooldown tracking

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| alert_rule_id | BIGINT FK -> alert_rules | ON DELETE CASCADE |
| run_hour | TEXT NOT NULL | |
| operator | TEXT NOT NULL | |
| receiving_country | TEXT NOT NULL | |
| price_gap | NUMERIC NOT NULL | |
| total_sending_amount | NUMERIC | |
| gme_baseline | NUMERIC | |
| notified_at | TIMESTAMPTZ DEFAULT NOW() | |
| email_sent_to | TEXT[] | |

**Index:** `(alert_rule_id, notified_at DESC)`

### `service_fees` — Fee reference with admin overrides

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| receiving_country | TEXT NOT NULL | |
| operator | TEXT NOT NULL | |
| delivery_method | TEXT NOT NULL DEFAULT 'Bank Account' | |
| fee_krw | NUMERIC NOT NULL DEFAULT 0 | |
| notes | TEXT | Admin notes |
| manually_edited | BOOLEAN DEFAULT FALSE | True when admin has overridden |
| edited_at | TIMESTAMPTZ | Set only on admin edit |
| updated_at | TIMESTAMPTZ | |

**Unique:** `(receiving_country, operator, delivery_method)`

## API Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/rates?country=X | Fetch 30 days of rate data (batched) |
| DELETE | /api/rates | Soft-delete a record |
| GET | /api/alerts | List all alert rules with last triggered time |
| POST | /api/alerts | Create new alert rule |
| PUT | /api/alerts | Update alert rule |
| DELETE | /api/alerts | Delete alert rule |
| POST | /api/alerts/auth | Validate login credentials |
| GET | /api/alerts/config | Get global email config |
| PUT | /api/alerts/config | Update email recipients |
| GET | /api/alerts/history | Fetch alert log (last 500) |
| DELETE | /api/alerts/history | Delete log entry or clear all |
| GET | /api/settings/fees?country=X | List service fees |
| PUT | /api/settings/fees | Update fee (admin edit) |
| POST | /api/settings/fees | Get latest scraped fee (for reset) |
| GET | /api/settings/fees/history | Fee edit history |
| GET | /api/settings/health?days=N | Scraper health + outliers |

## Data Flow

```
cron-job.org (every 30 min)
  |
  v
GitHub Actions workflow_dispatch
  |
  v
20 parallel matrix jobs (one per corridor/method)
  |
  v
run-*.js
  |-- Scrape all operators (Playwright / API)
  |-- loadFees() -> read fee overrides from service_fees
  |-- applyFeeOverrides() -> recalculate totals
  |-- Calculate GME baseline + price_gap
  |-- saveRates() -> upsert to rate_records
  |-- checkAlerts() -> send email if thresholds crossed
  |-- seedFees() -> insert new fee entries only
  |
  v
Supabase (rate_records, alert_log, service_fees)
  |
  v
Next.js Dashboard (Vercel)
  |-- page.tsx (SSR) -> fetch rate_records
  |-- Dashboard.tsx -> KPIs, charts, detailed table, XLS export
  |-- Settings.tsx -> Alert Rules tab + Service Fees tab
```

## Corridors and Operators

| Corridor | Currency | Receive Amount | Deposit Method | Operators |
|----------|----------|---------------|----------------|-----------|
| Indonesia | IDR | 13,000,000 | Bank Deposit | GME, GMoneyTrans, Hanpass, Utransfer, SBI, Cross, Coinshot, JRF, E9Pay |
| Thailand | THB | 26,000 | Bank Deposit | GME, GMoneyTrans, WireBarley, Hanpass, SBI, Cross, Coinshot, JRF, E9Pay |
| Vietnam | VND | 20,000,000 | Bank Deposit | GME, SBI, GMoneyTrans, E9Pay, Hanpass, Cross, JRF |
| China | CNY | 10,000 | Alipay | GME, GMoneyTrans, Hanpass, SBI, Cross, WireBarley, Coinshot, E9Pay, Utransfer, Moin, Debunk |
| Nepal | NPR | 100,000 | Bank Deposit | GME, GMoneyTrans, Hanpass, JRF, E9Pay, Coinshot |
| Philippines | PHP | 40,000 | Bank Deposit + Cash Pickup | GME, GMoneyTrans, SBI, Coinshot, Cross, E9Pay, JRF, Utransfer, Hanpass |
| Mongolia | MNT | 2,500,000 | Bank Deposit | GME, GMoneyTrans, Utransfer, Cross, E9Pay, Coinshot, Hanpass |
| Myanmar | MMK | 5,000,000 | Bank Deposit | GME, GMoneyTrans, Hanpass, SBI, E9Pay |
| Pakistan | PKR | 100,000 | Bank Deposit | GME, GMoneyTrans, Hanpass, JRF |
| Laos | LAK | 15,000,000 | Bank Deposit | GME, GMoneyTrans, E9Pay, Hanpass |
| Sri Lanka | LKR | 230,000 | Bank Deposit | GME, E9Pay, GMoneyTrans, Coinshot, JRF, Hanpass |
| India | INR | 100,000 | Bank Deposit | GMoneyTrans, GME, Hanpass |
| Cambodia | USD | 1,000 | Bank Deposit + Cash Pickup | GME, GMoneyTrans, Hanpass, SBI, E9Pay |
| Timor Leste | USD | 1,000 | Bank Deposit + Cash Pickup (MoneyGram) | GMoneyTrans, Hanpass |
| Bangladesh | BDT | 100,000 | Bank Deposit | GME, GMoneyTrans, E9Pay, Utransfer, Hanpass, JRF, Cross |
| Russia | RUB | 10,000 | Cash Payment + Card Payment | GME, GMoneyTrans, E9Pay |
| Uzbekistan | USD | 1,000 | Cash Pickup | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass |
| Uzbekistan | UZS | 1,000,000 | Card Payment | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass |
| Kazakhstan | USD | 1,000 | Cash Pickup | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass, Cross |
| Kyrgyzstan | USD | 1,000 | Cash Pickup | GME, GMoneyTrans, E9Pay, Coinshot, Hanpass, Cross |

> Sentbe disabled across all corridors since Apr 2026 (website redirected to corporate.sentbe.com).

## Scraper Libraries

| File | Purpose |
|------|---------|
| `lib/browser.js` | extractNumber, getRunHour (KST), withRetry (exponential backoff) |
| `lib/supabase.js` | Supabase client, saveRates (upsert) |
| `lib/fees.js` | loadFees (read overrides), applyFeeOverrides (recalculate totals), seedFees (insert new only) |
| `lib/alerts.js` | checkAlerts (match rules, check cooldown, build email, send, log) |
| `lib/email.js` | Gmail SMTP via nodemailer |

## Key Engineering Patterns

**Soft Deletes:** Records marked with `deleted_at` instead of hard-deleted. RLS trigger preserves flag on upsert.

**Fee Overrides:** Admin edits in Settings persist across scraper runs. `seedFees()` only inserts new entries, never overwrites. `manually_edited` flag tracks admin changes. Reset button reverts to latest non-zero scraped value.

**Delivery Methods:** Most corridors use Bank Deposit. China uses Alipay. CIS corridors (Uzbekistan, Kazakhstan, Kyrgyzstan) use Cash Pickup (USD). Uzbekistan also has Card Payment (UZS). Russia has Cash Payment + Card Payment. Philippines and Cambodia have both Bank Deposit and Cash Pickup with per-method GME baselines.

**Outlier Detection:** Validates scraped values before saving. Round multiples of 1,000 KRW with >10% deviation from median are flagged as suspicious defaults. Any value with >50% deviation from median is flagged as an outlier. Coinshot is exempt from the round-number check (legitimately returns round values). All flagged values are logged to `outlier_log` and visible in Settings.

**Alert Cooldown:** Per-rule cooldown checked against `alert_log`. Prevents email spam when same condition persists across multiple scrape cycles.

**Price Gap:** `price_gap = competitor.total - GME.total`. Negative = competitor cheaper (GME losing). Positive = GME cheaper (GME winning).

**Suggested Rate (in alert emails):** `suggested_rate = (competitor_total - GME_fee) / receive_amount`. Tells team what rate to set to match competitor.

## Infrastructure

| Component | Provider |
|-----------|----------|
| Database | Supabase (PostgreSQL + RLS) |
| Frontend | Vercel (Next.js 16 auto-deploy on push) |
| Scrapers | GitHub Actions (Node.js 20 + Playwright, 20 parallel jobs) |
| Cron | cron-job.org (every 30 min) |
| Email | Gmail SMTP (nodemailer) |

## Environment Variables

**Dashboard (.env.local + Vercel):**
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Public read-only key
- `ALERTS_USERNAME` — Login username for Settings
- `ALERTS_PASSWORD` — Login password for Settings

**Scrapers (GitHub Actions secrets):**
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Service role key (write access)
- `NOTIFY_EMAIL` — Gmail address for sending alerts
- `GMAIL_APP_PASSWORD` — Gmail app password
