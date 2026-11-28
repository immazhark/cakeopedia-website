// Staging backup + restoration drill with SYNTHETIC data only (never production, never real customer data).
//   node scripts/backup-drill.ts setup     create one synthetic enquiry + attached picture in STAGING (D1 rows + private R2 object) and record its SHA-256
//   node scripts/backup-drill.ts verify    restore from Backblaze (needs the reader key: b2-reader-import.ts) and prove database and picture integrity
//   node scripts/backup-drill.ts cleanup   delete the synthetic staging records and local files again
// Run from the build mirror folder (it needs node_modules). Nothing here prints a key, passphrase or file content.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import sharp from 'sharp';
import { credsPath, loadCreds, s3 } from './b2-lib.ts';
import { decryptBackup } from './backup-lib.ts';
import { backupKey, parseJsonc } from './backup-r2-run-lib.ts';
import { readPassphrase } from './backup-secret.ts';

const command = process.argv[2], CONFIG = 'wrangler.staging.jsonc';
const stateDir = join(process.env.LOCALAPPDATA ?? '.', 'cakeopedia-backup-staging'), stateFile = join(stateDir, 'drill-state.json');
mkdirSync(stateDir, { recursive: true });
const bucket = ((parseJsonc(readFileSync(CONFIG, 'utf8')).r2_buckets as { bucket_name: string }[])[0]!).bucket_name;
const wrangler = (argv: string[]) => execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...argv, '--config', CONFIG], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5 * 60_000, maxBuffer: 20_000_000 });
const d1 = (sql: string): Record<string, unknown>[] => { const out = wrangler(['d1', 'execute', 'DB', '--remote', '--json', '--command', sql]); return (JSON.parse(out.slice(out.indexOf('['))) as { results: Record<string, unknown>[] }[])[0]!.results; };
let bad = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) bad++; };
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
interface Drill { ts: number; enquiryId: string; uploadId: string; ref: string; key: string; bytes: number; sha256: string }
const load = (): Drill => JSON.parse(readFileSync(stateFile, 'utf8')) as Drill;

if (command === 'setup') {
  const ts = Date.now(), enquiryId = `drill-${ts}`, uploadId = `drill-up-${ts}`, ref = `CK-drill-${ts}`, key = `uploads/drill-${ts}.jpg`;
  const jpeg = await sharp({ create: { width: 96, height: 64, channels: 3, background: { r: 214, g: 150, b: 120 } } }).jpeg({ quality: 80 }).toBuffer();
  const tmp = join(stateDir, `r2tmp-drill-${ts}.jpg`), sqlFile = join(stateDir, `r2tmp-drill-${ts}.sql`);
  try {
    writeFileSync(tmp, jpeg);
    wrangler(['r2', 'object', 'put', `${bucket}/${key}`, '--file', tmp, '--content-type', 'image/jpeg', '--remote']);
    writeFileSync(sqlFile, [
      `INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES ('${enquiryId}', 'drill-sub-${ts}', 'drillhash', '${ref}', ${ts}, '{"name":"Drill Synthetic","synthetic":true}');`,
      `INSERT INTO uploads (id, submission_id, object_key, content_type, bytes, created_at, enquiry_id, ready_at) VALUES ('${uploadId}', 'drill-sub-${ts}', '${key}', 'image/jpeg', ${jpeg.length}, ${ts}, '${enquiryId}', ${ts});`].join('\n'));
    wrangler(['d1', 'execute', 'DB', '--remote', '--file', sqlFile]);
    writeFileSync(stateFile, JSON.stringify({ ts, enquiryId, uploadId, ref, key, bytes: jpeg.length, sha256: sha(jpeg) } satisfies Drill));
    check(d1(`SELECT count(*) AS n FROM uploads WHERE id = '${uploadId}'`)[0]?.n === 1, `synthetic enquiry ${ref} and picture (${jpeg.length} bytes, sha256 ${sha(jpeg).slice(0, 12)}...) created in STAGING D1 + private R2`);
  } finally { rmSync(tmp, { force: true }); rmSync(sqlFile, { force: true }); }
} else if (command === 'verify') {
  const drill = load(), reader = loadCreds(credsPath('reader')), passphrase = readPassphrase() ?? (console.error('No backup passphrase stored.'), process.exit(1));
  // 1. the newest staging database backup (the dated names sort chronologically)
  const listing = await s3(reader, 'GET', '', { query: 'list-type=2&prefix=backups%2Fd1%2Fstaging%2F' });
  const keys = [...Buffer.from(listing.body).toString('utf8').matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!).sort();
  check(listing.status === 200 && keys.length > 0, `reader lists staging database backups (${keys.length})`);
  const dbObject = await s3(reader, 'GET', keys.at(-1)!);
  check(dbObject.status === 200, 'database backup downloaded with the read-only key');
  const sql = decryptBackup(Buffer.from(dbObject.body), passphrase).toString('utf8');
  const db = new DatabaseSync(':memory:'); db.exec(sql);
  check((db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check === 'ok', 'restored database passes integrity_check in an isolated scratch database');
  const row = db.prepare('SELECT public_reference AS r FROM enquiries WHERE id = ?').get(drill.enquiryId) as { r: string } | undefined;
  const up = db.prepare('SELECT object_key AS k, bytes AS b FROM uploads WHERE id = ?').get(drill.uploadId) as { k: string; b: number } | undefined;
  check(row?.r === drill.ref && up?.k === drill.key && up?.b === drill.bytes, 'the synthetic enquiry and its picture record are present in the restored database');
  for (const table of ['enquiries', 'uploads', 'quotes', 'payments']) { // the backup was taken moments ago: counts must equal the live staging counts
    const live = d1(`SELECT count(*) AS n FROM ${table}`)[0]?.n, restored = (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    check(live === restored, `row count for ${table}: live ${String(live)} = restored ${restored}`);
  }
  // 2. the picture backup, decrypted and compared with the SHA-256 recorded before it left staging
  const pic = await s3(reader, 'GET', backupKey('staging', drill.key));
  check(pic.status === 200, 'picture backup downloaded with the read-only key');
  const restored = decryptBackup(Buffer.from(pic.body), passphrase);
  check(restored.length === drill.bytes && sha(restored) === drill.sha256, `restored picture is byte-identical: size ${restored.length} = ${drill.bytes} and SHA-256 matches (${sha(restored).slice(0, 12)}...)`);
  check(restored.length === up?.b, 'restored picture size equals the size recorded in the restored database');
  console.log(bad ? `\n${bad} check(s) FAILED` : '\nStaging drill verified: database and attachment restored in isolation with matching integrity evidence');
  process.exitCode = bad ? 1 : 0;
} else if (command === 'cleanup') {
  const drill = load();
  wrangler(['r2', 'object', 'delete', `${bucket}/${drill.key}`, '--remote']);
  wrangler(['d1', 'execute', 'DB', '--remote', '--command', `DELETE FROM uploads WHERE id = '${drill.uploadId}'; DELETE FROM enquiries WHERE id = '${drill.enquiryId}';`]);
  check(d1(`SELECT (SELECT count(*) FROM uploads WHERE id = '${drill.uploadId}') + (SELECT count(*) FROM enquiries WHERE id = '${drill.enquiryId}') AS n`)[0]?.n === 0, 'synthetic staging records deleted (D1 rows gone)');
  let gone = false; try { wrangler(['r2', 'object', 'get', `${bucket}/${drill.key}`, '--file', join(stateDir, 'r2tmp-gone.bin'), '--remote']); } catch { gone = true; }
  rmSync(join(stateDir, 'r2tmp-gone.bin'), { force: true });
  check(gone, 'synthetic picture deleted from the private staging R2 bucket');
  if (existsSync(stateFile)) rmSync(stateFile);
  process.exitCode = bad ? 1 : 0;
} else { console.error('Usage: node scripts/backup-drill.ts setup | verify | cleanup'); process.exitCode = 2; }
