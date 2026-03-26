import supabase from './supabase.js';

/**
 * Upsert service fees from the latest scrape results into service_fees table.
 * Non-fatal — errors are logged but never thrown.
 */
export async function updateFees(records) {
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
      .upsert(rows, { onConflict: 'receiving_country,operator,delivery_method' });

    if (error) throw error;
  } catch (err) {
    console.warn(`  ⚠️ Fee upsert failed (non-fatal): ${err.message}`);
  }
}
