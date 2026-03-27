/**
 * Database backup script — exports all Supabase tables to CSV files.
 * Run: node --env-file=.env backup.js
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUPS_DIR = join(__dirname, '..', 'backups');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

/**
 * Fetch all rows from a table in batches of 1000.
 */
async function fetchAll(table, options = {}) {
  const BATCH = 1000;
  let allData = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select('*').range(from, from + BATCH - 1);

    if (options.filter) {
      query = options.filter(query);
    }
    if (options.order) {
      query = query.order(options.order, { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < BATCH) break;
    from += BATCH;
  }

  return allData;
}

/**
 * Convert array of objects to CSV string.
 */
function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

async function main() {
  console.log('Starting database backup...\n');

  const tables = [
    {
      name: 'rate_records',
      options: {
        filter: (q) => q.is('deleted_at', null),
        order: 'run_hour',
      },
    },
    { name: 'alert_rules' },
    { name: 'alert_config' },
    { name: 'alert_log', options: { order: 'notified_at' } },
    { name: 'service_fees' },
  ];

  for (const { name, options } of tables) {
    try {
      const rows = await fetchAll(name, options ?? {});
      const csv = toCsv(rows);
      const path = join(BACKUPS_DIR, `${name}.csv`);
      writeFileSync(path, csv, 'utf8');
      console.log(`  ✓ ${name}: ${rows.length.toLocaleString()} rows → ${name}.csv`);
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
    }
  }

  // Write timestamp
  const timestamp = new Date().toISOString();
  writeFileSync(join(BACKUPS_DIR, 'last_backup.txt'), `Last backup: ${timestamp}\n`, 'utf8');

  console.log(`\nBackup complete at ${timestamp}`);
}

main().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
