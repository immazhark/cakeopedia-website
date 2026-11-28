// Exports the erasure ledger with the backups: merges the live database's ledger into a local append-only file and uploads it encrypted as
// backups/ledger/<source>/erasure-ledger.ckbak (re-uploaded every run, so the newest version always lists every erasure made so far, even ones newer than the
// latest database backup you might restore). Run automatically by backup-run.ts. References only; no personal data.
//   node scripts/backup-ledger.ts --source production|staging
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { credsPath, loadCreds } from './b2-lib.ts';
import { encryptBackup } from './backup-lib.ts';
import { readPassphrase } from './backup-secret.ts';
import { putObject } from './backup-upload-lib.ts';
import { formatLedger, mergeLedgers, parseLedger, type LedgerEntry } from './erasure-ledger-lib.ts';

const source = process.argv[process.argv.indexOf('--source') + 1] ?? '';
const CONFIG: Record<string, string> = { production: 'wrangler.production.jsonc', staging: 'wrangler.staging.jsonc' };
if (!CONFIG[source]) { console.error('Usage: node scripts/backup-ledger.ts --source production|staging'); process.exit(2); }
const stateDir = join(process.env.LOCALAPPDATA ?? '.', source === 'production' ? 'cakeopedia-backup' : `cakeopedia-backup-${source}`), file = join(stateDir, 'erasure-ledger.tsv');
mkdirSync(stateDir, { recursive: true });

let live: Map<string, LedgerEntry>;
try {
  const out = execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--remote', '--json', '--config', CONFIG[source]!, '--command', 'SELECT reference AS r, erased_at AS t, source AS s FROM erasure_ledger ORDER BY erased_at LIMIT 100000'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 50_000_000, timeout: 5 * 60_000 });
  const rows = (JSON.parse(out.slice(out.indexOf('['))) as { results: { r: string; t: number; s: LedgerEntry['source'] }[] }[])[0]!.results;
  live = parseLedger(rows.map((r) => `${r.r}\t${r.t}\t${r.s}`).join('\n'));
} catch { console.error(`Could not read the erasure ledger from the ${source} database (schema applied? Wrangler logged in?).`); process.exit(2); }
const local = existsSync(file) ? parseLedger(readFileSync(file, 'utf8')) : new Map<string, LedgerEntry>();
const merged = mergeLedgers(local, live);
writeFileSync(file, formatLedger(merged));
const passphrase = readPassphrase() ?? (console.error('No backup passphrase: run node scripts/backup-passphrase.ts set'), process.exit(1));
await putObject(loadCreds(credsPath('writer')), `backups/ledger/${source}/erasure-ledger.ckbak`, new Uint8Array(encryptBackup(Buffer.from(formatLedger(merged), 'utf8'), passphrase)), Date.now());
console.log(`Erasure ledger: ${merged.size} reference(s) (${live.size} in the live database, ${merged.size - live.size} only in earlier copies) uploaded encrypted.`);
