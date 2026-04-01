# QA Testing Checklist

## A. Dashboard (localhost:3000)

- [ ] Country dropdown shows all corridors (no Cameroon/Liberia)
- [ ] Collection Amount chart: zoomed X-axis, bars vary in length
- [ ] GME reference line visible, colors: red=GME, green=cheaper, orange=expensive
- [ ] Y-axis labels show `Operator (rate)` format with proper thousand separators
- [ ] Rate legend shows correct direction per corridor (IDR per 1 KRW vs KRW per 1 CNY)
- [ ] Operator checkboxes toggle bar visibility
- [ ] Run hour selector changes snapshot data
- [ ] Sort button toggles Most/Least Expensive
- [ ] Avg Price Difference chart: From/To date pickers filter correctly
- [ ] Trend chart: From/To date pickers, operator overlay dropdown works
- [ ] Detailed Data table: search, status filter, delivery method filter, pagination
- [ ] Language toggle EN/KO works across all sections
- [ ] Day range selector (7/14/30/60/90) reloads data
- [ ] Dark mode renders correctly
- [ ] Tooltip shows correct data on chart hover

## B. Settings - Alert Rules

- [ ] Add rule with multiple operators (checkboxes) creates one rule per operator
- [ ] "Any operator" checkbox clears all, creates single rule with null operator
- [ ] Rules table groups operators with same settings into one row
- [ ] Edit a grouped rule: checkboxes pre-populated correctly
- [ ] Toggle active/inactive on a group: all rules in group toggle
- [ ] Delete a group: all rules deleted with confirmation count
- [ ] Alert Type dropdown: Price/Rate changes threshold label and hint text
- [ ] Rate threshold accepts decimals (step 0.01)
- [ ] Direction dropdown: Cheaper than GME / Any direction
- [ ] Cooldown selector options work
- [ ] Recent Alerts: pagination (10 per page), individual delete (x), Clear All
- [ ] Email recipients: add valid email, reject invalid, remove existing

## C. Settings - Service Fees

- [ ] Fees grouped by country, correct values displayed
- [ ] Edit fee: save with new value, notes, effective_until datetime
- [ ] Effective Until column: shows date in blue, "Expired" in red when past
- [ ] Reset fee: reverts to scraped value, clears manually_edited flag
- [ ] Edit History section: shows old -> new value with Edit/Reset badge
- [ ] Edit History pagination and Clear All work
- [ ] Status column shows "Edited" (amber) or "Default" correctly

## D. Settings - Scraper Health

- [ ] Success rates displayed per corridor/operator
- [ ] Day selector (1/3/7 days) reloads data
- [ ] Recent Failures section with pagination (10 per page)
- [ ] Outliers Skipped section: shows value vs median + deviation %
- [ ] Outliers Skipped pagination works

## E. Scrapers (Local Testing)

Run each corridor: `cd scraper && node --env-file=.env run-{code}.js`

- [ ] Indonesia (run-idr.js) - all operators succeed
- [ ] Thailand (run-thb.js) - all operators succeed
- [ ] Vietnam (run-vnd.js) - all operators succeed
- [ ] Nepal (run-npr.js) - all operators succeed
- [ ] China (run-cny.js) - all operators Alipay, no Bank Deposit
- [ ] Cambodia (run-khm.js) - all operators succeed
- [ ] Myanmar (run-mmk.js) - all operators succeed
- [ ] Philippines (run-php.js) - all operators succeed
- [ ] Mongolia (run-mnt.js) - all operators succeed
- [ ] Pakistan (run-pkr.js) - all operators succeed
- [ ] Laos (run-lak.js) - GMoneyTrans correctly skipped
- [ ] Sri Lanka (run-lkr.js) - all operators succeed
- [ ] India (run-inr.js) - all operators succeed
- [ ] Outlier validation: abnormal value (>50% deviation) is skipped and logged
- [ ] Fee override: edit fee in Settings, run scraper, verify override applied
- [ ] Effective_until expiry: set past date, run scraper, verify fee reverts

## F. Alert Emails

- [ ] Price alert: create rule with low threshold, verify email sent on next scrape
- [ ] Rate alert: verify email shows Operator / Method / Competitor Rate / GME Rate / Rate Gap
- [ ] "Cheaper than GME" direction only includes cheaper operators (both Price and Rate)
- [ ] Cooldown prevents duplicate emails within the cooldown period
- [ ] Email format: Receive Amount shows currency code (e.g. "13,000,000 IDR")
- [ ] Rate format: correct direction (IDR per 1 KRW for Indonesia, KRW per 1 CNY for China)

## G. Deployment

- [ ] Vercel build succeeds (no TypeScript errors)
- [ ] GitHub Actions scrape workflow runs without errors
- [ ] Node.js 22 + FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 set in CI
- [ ] All Supabase tables exist: rate_records, service_fees, alert_rules, alert_config, alert_log, fee_edit_log, outlier_log
