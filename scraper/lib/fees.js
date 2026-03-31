import supabase from './supabase.js';

/**
 * Load fee overrides from service_fees table for a given country.
 * Returns a Map keyed by "operator||delivery_method" → fee_krw.
 */
export async function loadFees(country) {
  try {
    const { data, error } = await supabase
      .from('service_fees')
      .select('id, operator, delivery_method, fee_krw, manually_edited, effective_until')
      .eq('receiving_country', country);

    if (error || !data) return new Map();

    const now = new Date();
    const map = new Map();

    for (const r of data) {
      // Auto-revert expired fee overrides back to default
      if (r.manually_edited && r.effective_until && new Date(r.effective_until) < now) {
        await supabase.from('service_fees').update({
          manually_edited: false, edited_at: null, effective_until: null, notes: null,
          updated_at: now.toISOString(),
        }).eq('id', r.id);
        console.log(`  ⏰ Fee expired for ${r.operator}||${r.delivery_method} — reverted to default`);
        // Skip this override — scraper will use its own scraped fee
        continue;
      }
      map.set(`${r.operator}||${r.delivery_method}`, r.fee_krw);
    }
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
    const key = `${r.operator}||${r.delivery_method ?? 'Bank Deposit'}`;
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
 * Checks which entries already exist and only inserts truly new ones.
 * Non-fatal — errors are logged but never thrown.
 */
export async function seedFees(records) {
  try {
    const country = records[0]?.receiving_country;
    if (!country) return;

    // Fetch existing entries for this country
    const { data: existing } = await supabase
      .from('service_fees')
      .select('operator, delivery_method')
      .eq('receiving_country', country);

    const existingKeys = new Set(
      (existing ?? []).map(e => `${e.operator}||${e.delivery_method}`)
    );

    // Only insert rows that don't already exist
    const newRows = records
      .filter(r => r.operator && r.receiving_country)
      .filter(r => !existingKeys.has(`${r.operator}||${r.delivery_method ?? 'Bank Deposit'}`))
      .map(r => ({
        receiving_country: r.receiving_country,
        operator: r.operator,
        delivery_method: r.delivery_method ?? 'Bank Deposit',
        fee_krw: r.service_fee ?? 0,
        updated_at: new Date().toISOString(),
      }));

    if (newRows.length === 0) return;

    const { error } = await supabase
      .from('service_fees')
      .insert(newRows);

    if (error) throw error;
    console.log(`  📋 Seeded ${newRows.length} new fee entries`);
  } catch (err) {
    console.warn(`  ⚠️ Fee seed failed (non-fatal): ${err.message}`);
  }
}
