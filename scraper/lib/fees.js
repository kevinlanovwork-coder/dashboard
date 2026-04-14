import supabase from './supabase.js';

/**
 * Load fee overrides from service_fees table for a given country.
 * Returns a Map keyed by "operator||delivery_method" → fee_krw.
 */
export async function loadFees(country) {
  try {
    const { data, error } = await supabase
      .from('service_fees')
      .select('id, operator, delivery_method, fee_krw, manually_edited, effective_until, original_fee')
      .eq('receiving_country', country);

    if (error || !data) return new Map();

    const now = new Date();
    const map = new Map();

    for (const r of data) {
      // Auto-revert expired fee overrides back to default scraped value
      if (r.manually_edited && r.effective_until && new Date(r.effective_until) < now) {
        // Restore from original_fee (saved when the edit was made)
        const restoredFee = r.original_fee ?? r.fee_krw;
        const oldFee = r.fee_krw;
        await supabase.from('service_fees').update({
          fee_krw: restoredFee, original_fee: null,
          manually_edited: false, edited_at: null, effective_until: null, notes: null,
          updated_at: now.toISOString(),
        }).eq('id', r.id);
        // Log the expiry to fee_edit_log
        try {
          await supabase.from('fee_edit_log').insert({
            service_fee_id: r.id, receiving_country: country, operator: r.operator,
            delivery_method: r.delivery_method, old_fee: oldFee, new_fee: restoredFee,
            action: 'expired', notes: 'Auto-reverted after effective_until expired',
            edited_at: now.toISOString(),
          });
        } catch { /* non-fatal */ }
        console.log(`  ⏰ Fee expired for ${r.operator}||${r.delivery_method} — reverted ${oldFee} → ${restoredFee}`);
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
    // GME's fee always comes from its own API — skip override to prevent circular sync via seedFees()
    if (r.operator === 'GME') return r;
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

    const now = new Date().toISOString();

    // GME: always sync fee from API to keep it up to date
    const gmeRecords = records.filter(r => r.operator === 'GME' && r.receiving_country);
    for (const r of gmeRecords) {
      const key = `${r.operator}||${r.delivery_method ?? 'Bank Deposit'}`;
      if (existingKeys.has(key)) {
        await supabase.from('service_fees')
          .update({ fee_krw: r.service_fee ?? 0, updated_at: now })
          .eq('receiving_country', country)
          .eq('operator', 'GME')
          .eq('delivery_method', r.delivery_method ?? 'Bank Deposit');
      }
    }

    // Only insert rows that don't already exist
    const newRows = records
      .filter(r => r.operator && r.receiving_country)
      .filter(r => !existingKeys.has(`${r.operator}||${r.delivery_method ?? 'Bank Deposit'}`))
      .map(r => ({
        receiving_country: r.receiving_country,
        operator: r.operator,
        delivery_method: r.delivery_method ?? 'Bank Deposit',
        fee_krw: r.service_fee ?? 0,
        updated_at: now,
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
