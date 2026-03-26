import supabase from './supabase.js';

/**
 * Load fee overrides from service_fees table for a given country.
 * Returns a Map keyed by "operator||delivery_method" → fee_krw.
 */
export async function loadFees(country) {
  try {
    const { data, error } = await supabase
      .from('service_fees')
      .select('operator, delivery_method, fee_krw')
      .eq('receiving_country', country);

    if (error || !data) return new Map();

    const map = new Map();
    data.forEach(r => {
      map.set(`${r.operator}||${r.delivery_method}`, r.fee_krw);
    });
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Apply fee overrides from service_fees table to scraped records.
 * Recalculates total_sending_amount = send_amount_krw + overridden fee.
 * Returns the modified records array.
 */
export function applyFeeOverrides(records, feeMap) {
  return records.map(r => {
    const key = `${r.operator}||${r.delivery_method ?? 'Bank Account'}`;
    const overrideFee = feeMap.get(key);
    if (overrideFee != null && overrideFee !== r.service_fee) {
      return {
        ...r,
        service_fee: overrideFee,
        total_sending_amount: r.send_amount_krw + overrideFee,
      };
    }
    return r;
  });
}

/**
 * Seed service fees for new operator/corridor combinations only.
 * Does NOT overwrite existing entries (preserving admin edits).
 * Non-fatal — errors are logged but never thrown.
 */
export async function seedFees(records) {
  try {
    const rows = records
      .filter(r => r.operator && r.receiving_country)
      .map(r => ({
        receiving_country: r.receiving_country,
        operator: r.operator,
        delivery_method: r.delivery_method ?? 'Bank Account',
        fee_krw: r.service_fee ?? 0,
        updated_at: new Date().toISOString(),
      }));

    if (rows.length === 0) return;

    const { error } = await supabase
      .from('service_fees')
      .upsert(rows, {
        onConflict: 'receiving_country,operator,delivery_method',
        ignoreDuplicates: true,  // only insert new, never overwrite existing
      });

    if (error) throw error;
  } catch (err) {
    console.warn(`  ⚠️ Fee seed failed (non-fatal): ${err.message}`);
  }
}
