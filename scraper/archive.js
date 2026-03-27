/**
 * Archive old rate_records (older than 90 days) to rate_records_archive.
 * Run: node --env-file=.env archive.js
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const RETENTION_DAYS = 90;
const BATCH = 1000;

async function main() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  console.log(`Archiving records older than ${RETENTION_DAYS} days (before ${cutoffStr})...\n`);

  let totalArchived = 0;

  while (true) {
    // Fetch a batch of old records
    const { data: batch, error: fetchErr } = await supabase
      .from('rate_records')
      .select('*')
      .lt('run_hour', cutoffStr)
      .limit(BATCH);

    if (fetchErr) {
      console.error('Fetch error:', fetchErr.message);
      break;
    }

    if (!batch || batch.length === 0) break;

    // Insert into archive
    const archiveRows = batch.map(r => {
      const { id, ...rest } = r;
      return rest;
    });

    const { error: insertErr } = await supabase
      .from('rate_records_archive')
      .insert(archiveRows);

    if (insertErr) {
      console.error('Archive insert error:', insertErr.message);
      break;
    }

    // Delete originals
    const ids = batch.map(r => r.id);
    const { error: deleteErr } = await supabase
      .from('rate_records')
      .delete()
      .in('id', ids);

    if (deleteErr) {
      console.error('Delete error:', deleteErr.message);
      break;
    }

    totalArchived += batch.length;
    console.log(`  Archived ${batch.length} records (total: ${totalArchived.toLocaleString()})`);

    if (batch.length < BATCH) break;
  }

  if (totalArchived > 0) {
    console.log(`\n✅ Archived ${totalArchived.toLocaleString()} records to rate_records_archive`);
  } else {
    console.log('\nNo records to archive.');
  }
}

main().catch(err => {
  console.error('Archive failed:', err);
  process.exit(1);
});
