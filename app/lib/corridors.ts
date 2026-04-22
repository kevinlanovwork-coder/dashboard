/**
 * Single source of truth for corridor configuration.
 *
 * When adding a new corridor or operator, update OPERATOR_MAP below.
 * DELIVERY_METHOD_MAP and COUNTRIES are derived automatically.
 *
 * Used by:
 *   - app/components/Settings.tsx  (alert rules & fee management UI)
 *   - app/api/settings/health/route.ts  (scraper health monitoring)
 */

/** Operators expected per corridor (key = "Country||DeliveryMethod") */
export const OPERATOR_MAP: Record<string, string[]> = {
  'Indonesia||Bank Deposit':   ['GME', 'GMoneyTrans', 'Hanpass', 'Utransfer', 'SBI', 'Cross', 'Coinshot', 'JRF', 'E9Pay'],
  'Thailand||Bank Deposit':    ['GME', 'GMoneyTrans', 'WireBarley', 'Hanpass', 'SBI', 'Cross', 'Coinshot', 'JRF', 'E9Pay'],
  'Vietnam||Bank Deposit':     ['GME', 'SBI', 'GMoneyTrans', 'E9Pay', 'Hanpass', 'Cross', 'JRF'],
  'Nepal||Bank Deposit':       ['GME', 'GMoneyTrans', 'Hanpass', 'JRF', 'E9Pay', 'Coinshot'],
  'Philippines||Bank Deposit': ['GME', 'GMoneyTrans', 'SBI', 'Coinshot', 'Cross', 'E9Pay', 'JRF', 'Utransfer', 'Hanpass'],
  'Philippines||Cash Pickup':  ['GME', 'GMoneyTrans', 'Hanpass', 'E9Pay', 'JRF'],
  'Cambodia||Bank Deposit':    ['GME', 'GMoneyTrans', 'Hanpass', 'SBI', 'E9Pay'],
  'Ghana||Bank Deposit':       ['GME', 'GMoneyTrans'],
  'Ghana||Mobile Wallet':      ['GME', 'GMoneyTrans'],
  'South Africa||Bank Deposit': ['GME', 'GMoneyTrans', 'Hanpass'],
  'Canada||Bank Deposit':      ['GME', 'GMoneyTrans'],
  'Nigeria||Bank Deposit':     ['GME', 'GMoneyTrans'],
  'Cambodia||Cash Pickup':     ['GME', 'GMoneyTrans', 'Hanpass', 'SBI', 'E9Pay'],
  'China||Alipay':             ['GME', 'GMoneyTrans', 'Hanpass', 'SBI', 'Cross', 'WireBarley', 'Coinshot', 'E9Pay', 'Utransfer', 'Moin', 'Debunk'],
  'Mongolia||Bank Deposit':    ['GME', 'GMoneyTrans', 'Utransfer', 'Cross', 'E9Pay', 'Coinshot', 'Hanpass'],
  'Myanmar||Bank Deposit':     ['GME', 'GMoneyTrans', 'Hanpass', 'SBI', 'E9Pay'],
  'Pakistan||Bank Deposit':    ['GME', 'GMoneyTrans', 'Hanpass', 'JRF'],
  'Bangladesh||Bank Deposit':  ['GME', 'GMoneyTrans', 'E9Pay', 'Utransfer', 'Hanpass', 'JRF', 'Cross'],
  'Laos||Bank Deposit (LAK)':  ['GME', 'GMoneyTrans', 'E9Pay', 'Hanpass'],
  'Laos||Bank Deposit (USD)':  ['GME', 'Hanpass', 'Cross'],
  'Sri Lanka||Bank Deposit':   ['GME', 'E9Pay', 'GMoneyTrans', 'Coinshot', 'JRF', 'Hanpass'],
  'India||Bank Deposit':       ['WireBarley', 'GMoneyTrans', 'GME', 'Hanpass'],
  'Kazakhstan||Cash Pickup':   ['GME', 'GMoneyTrans', 'E9Pay', 'Coinshot', 'Hanpass', 'Cross'],
  'Kyrgyzstan||Cash Pickup':   ['GME', 'GMoneyTrans', 'E9Pay', 'Coinshot', 'Hanpass', 'Cross'],
  'Kyrgyzstan||Card Payment':  ['GME', 'GMoneyTrans', 'E9Pay'],
  'Uzbekistan||Cash Pickup':   ['GME', 'GMoneyTrans', 'E9Pay', 'Coinshot', 'Hanpass'],
  'Uzbekistan||Card Payment':  ['GME', 'GMoneyTrans', 'E9Pay', 'Coinshot', 'Hanpass'],
  'Russia||Cash Payment':      ['GME', 'GMoneyTrans', 'E9Pay'],
  'Russia||Card Payment':      ['GME', 'E9Pay'],
  'Timor Leste||Bank Deposit':          ['GME', 'GMoneyTrans', 'Hanpass'],
  'Timor Leste||Cash Pickup (MoneyGram)': ['GME', 'GMoneyTrans', 'Hanpass'],
};

/** Delivery methods per country (derived from OPERATOR_MAP keys) */
export const DELIVERY_METHOD_MAP: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const key of Object.keys(OPERATOR_MAP)) {
    const [country, method] = key.split('||');
    if (!map[country]) map[country] = [];
    map[country].push(method);
  }
  return map;
})();

/** All countries sorted alphabetically (derived from DELIVERY_METHOD_MAP) */
export const COUNTRIES: string[] = Object.keys(DELIVERY_METHOD_MAP).sort();

/**
 * Currency by country, with `Country||Method` overrides for corridors where
 * different delivery methods use different currencies (e.g. Uzbekistan Card
 * Payment is quoted in UZS while Cash Pickup is USD).
 */
export const CURRENCY_MAP: Record<string, string> = {
  Indonesia: 'IDR', Thailand: 'THB', Vietnam: 'VND', Nepal: 'NPR',
  Philippines: 'PHP', Cambodia: 'USD',
  China: 'CNY', Mongolia: 'MNT', Myanmar: 'MMK',
  Pakistan: 'PKR', Laos: 'LAK', 'Sri Lanka': 'LKR', India: 'INR',
  'Timor Leste': 'USD', Uzbekistan: 'USD', 'Uzbekistan||Card Payment': 'UZS',
  Bangladesh: 'BDT', Russia: 'RUB', Kazakhstan: 'USD', Kyrgyzstan: 'USD',
  'Kyrgyzstan||Card Payment': 'KGS',
  'Laos||Bank Deposit (USD)': 'USD',
  Ghana: 'GHS', 'South Africa': 'ZAR', Canada: 'CAD', Nigeria: 'NGN',
};
