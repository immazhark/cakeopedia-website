// Incremental encrypted backup of private R2 customer pictures (new ones, and a refresh every 28 days while still attached so the lifecycle rule cannot expire the only copy) to Backblaze (the database backup alone does NOT contain them).
//   node scripts/backup-r2.ts --source production|staging [--dry-run]
// Reads the list of attached pictures from D1 (read-only query), downloads each NEW picture through Wrangler, checks its size against the database, encrypts it
// with the DPAPI-stored passphrase and uploads it with the write-only B2 key. Temp files live in the user's state folder (not OneDrive, not Git) and are removed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { credsPath, loadCreds } from './b2-lib.ts';
import { encryptBackup } from './backup-lib.ts';
import { backupKey, emptyR2State, isSafeKey, parseJsonc, parseRows, planR2, sizeMatches, type R2State } from './backup-r2-run-lib.ts';
import { readPassphrase } from './backup-secret.ts';
import { putObject } from './backup-upload-lib.ts';

const args = process.argv.slice(2), source = args[args.indexOf('--source') + 1] ?? '', dry = args.includes('--dry-run');
const CONFIG: Record<string, string> = { production: 'wrangler.production.jsonc', staging: 'wrangler.staging.jsonc' };
const config = CONFIG[source];
if (!config) { console.error('Usage: node scripts/backup-r2.ts --source production|staging [--dry-run]'); process.exit(2); }
const stateDir = join(process.env.LOCALAPPDATA ?? '.', source === 'production' ? 'cakeopedia-backup' : `cakeopedia-backup-${source}`), stateFile = join(stateDir, 'r2-done.json');
mkdirSync(stateDir, { recursive: true });
const wrangler = (argv: string[]) => execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...argv, '--config', config], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5 * 60_000, maxBuffer: 20_000_000 });

const bucket = ((parseJsonc(readFileSync(config, 'utf8')).r2_buckets as { bucket_name: string }[] | undefined)?.[0]?.bucket_name) ?? '';
if (!/^[a-z0-9-]{3,63}$/.test(bucket)) { console.error('Could not identify the R2 bucket from the Wrangler config.'); process.exit(2); }
let state: R2State = emptyR2State();
try { state = JSON.parse(readFileSync(stateFile, 'utf8')) as R2State; } catch { /* first run */ }

let rows;
try { rows = parseRows(wrangler(['d1', 'execute', 'DB', '--remote', '--json', '--command', 'SELECT object_key AS k, bytes AS b FROM uploads WHERE enquiry_id IS NOT NULL AND deleted_at IS NULL AND ready_at IS NOT NULL ORDER BY created_at LIMIT 2000'])); }
catch { console.error(`Could not read the attached-pictures list from the ${source} database. Is the schema applied (migrations) and Wrangler logged in?`); process.exit(2); }
const todo = planR2(rows, state, Date.now());
console.log(`${rows.length} attached pictures in ${source}; ${todo.length} due for backup (new or older than 28 days)${dry ? ' (dry run: nothing downloaded or uploaded)' : ''}.`);
if (dry || todo.length === 0) process.exit(0);

const passphrase = readPassphrase() ?? (console.error('No backup passphrase: run node scripts/backup-passphrase.ts set'), process.exit(1));
const writer = loadCreds(credsPath('writer'));
let ok = 0, failed = 0;
for (const row of todo) {
  const tmp = join(stateDir, `r2tmp-${process.pid}-${ok + failed}.bin`);
  try {
    if (!isSafeKey(row.k)) throw new Error('unsafe key');
    execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'r2', 'object', 'get', `${bucket}/${row.k}`, '--file', tmp, '--remote', '--config', config], { stdio: 'ignore', timeout: 5 * 60_000 });
    const size = statSync(tmp).size;
    if (!sizeMatches(row, size)) throw new Error('size mismatch');
    await putObject(writer, backupKey(source, row.k), new Uint8Array(encryptBackup(readFileSync(tmp), passphrase)), Date.now());
    state.done[row.k] = { bytes: size, at: Date.now() };
    writeFileSync(stateFile, JSON.stringify(state)); // saved after every picture: an interrupted run resumes where it stopped
    ok++;
  } catch (e) { failed++; console.error(`picture ${ok + failed} failed: ${e instanceof Error ? e.message.slice(0, 60) : 'error'}`); } // never prints keys or content
  finally { if (existsSync(tmp)) rmSync(tmp, { force: true }); }
}
console.log(`R2 backup: ${ok} uploaded, ${failed} failed.`);
process.exit(failed ? 1 : 0);
