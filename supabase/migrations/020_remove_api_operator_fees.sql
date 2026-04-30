-- API-scraped operators (GME, GMoneyTrans, Hanpass) read their service fees directly
-- from their own APIs every scrape. The Service Fees override layer no longer applies
-- to them; the existing rows are dead weight and would mask stale overrides if any
-- code path bypassed the new filters in scraper/lib/fees.js. Drop them.
DELETE FROM service_fees
WHERE operator IN ('GME', 'GMoneyTrans', 'Hanpass');
