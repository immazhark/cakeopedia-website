// Encrypted D1 backup and restore check (run with `node scripts/backup.ts <command>`; see docs/operations-runbook.md, section 6).
//   export <out.ckbak> [--local]   exports the database with Wrangler (remote needs `wrangler login`), encrypts it, removes the plain file
//   decrypt <in.ckbak> <out.sql>   writes the plain SQL (it contains customer data: keep it only as long as needed)
//   upload <in.ckbak> <object-key> sends an ALREADY ENCRYPTED backup to an S3-compatible bucket (env: BACKUP_S3_ENDPOINT, BACKUP_S3_REGION, BACKUP_S3_BUCKET, BACKUP_S3_KEY_ID, BACKUP_S3_SECRET). Refuses plain .sql files. Not run until the owner approves a destination.
//   check <in.ckbak|in.sql>        loads the dump into a scratch in-memory database and prints row counts and the integrity result
// The passphrase comes from the BACKUP_PASSPHRASE environment variable (at least 20 characters) and is never written anywhere.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPassphrase } from './backup-secret.ts';
import { putObject } from './backup-upload-lib.ts';
import { credsPath, loadCreds, s3 } from './b2-lib.ts';
import { REQUIRED_TABLES, checkRestore, decryptBackup, encryptBackup } from './backup-lib.ts';

const [command, a, b] = process.argv.slice(2);
// the passphrase comes from the Windows-DPAPI store (node scripts/backup-passphrase.ts set); BACKUP_PASSPHRASE is still honoured but discouraged (environment variables are visible to the account)
const passphrase = process.env.BACKUP_PASSPHRASE ?? ((command === 'upload' || command === 'download') ? '' : (readPassphrase() ?? ''));
const fail = (m: string): never => { console.error(m); process.exit(1); };
const needKey = () => { if (passphrase.length === 0) fail('No backup passphrase: run node scripts/backup-passphrase.ts set (or set BACKUP_PASSPHRASE, at least 20 characters).'); };

if (command === 'export' && a) {
  needKey();
  const local = process.argv.includes('--local');
  const dir = mkdtempSync(join(tmpdir(), 'ckbak-')), plain = join(dir, 'dump.sql');
  try {
    const args = ['node_modules/wrangler/bin/wrangler.js', 'd1', 'export', process.env.D1_BINDING ?? 'DB', '--output', plain, '--config', process.env.WRANGLER_CONFIG ?? (local ? 'wrangler.local.jsonc' : 'wrangler.jsonc'), local ? '--local' : '--remote'];
    execFileSync(process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    const sql = readFileSync(plain);
    checkRestore(sql.toString('utf8'), REQUIRED_TABLES); // never keep a backup that cannot be restored
    writeFileSync(a, encryptBackup(sql, passphrase));
    console.log(`Encrypted backup written to ${a} (${sql.length} bytes of SQL before encryption).`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
} else if (command === 'decrypt' && a && b) {
  needKey();
  writeFileSync(b, decryptBackup(readFileSync(a), passphrase));
  console.log(`Plain SQL written to ${b}. It contains customer data.`);
} else if (command === 'check' && a) {
  const raw = readFileSync(a);
  const sql = a.endsWith('.sql') ? raw.toString('utf8') : (needKey(), decryptBackup(raw, passphrase).toString('utf8'));
  const r = checkRestore(sql, REQUIRED_TABLES);
  console.log(JSON.stringify(r, null, 2));
  if (r.integrity !== 'ok') fail('Integrity check failed.');
  console.log('Restore check passed: every required table is present and the integrity check is ok.');
} else if (command === 'upload' && a && b) {
  const raw = readFileSync(a);
  if (a.endsWith('.sql') || /INSERT INTO|CREATE TABLE|PRAGMA/i.test(raw.subarray(0, 4096).toString('latin1'))) fail('Refusing to upload plain SQL: it contains customer data. Upload the encrypted .ckbak file.');
  // credentials: the environment (BACKUP_S3_*) if set, otherwise the writer key file saved by scripts/b2-keys.ts
  const t = process.env.BACKUP_S3_ENDPOINT ? { endpoint: process.env.BACKUP_S3_ENDPOINT, region: process.env.BACKUP_S3_REGION ?? fail('Set BACKUP_S3_REGION.'), bucket: process.env.BACKUP_S3_BUCKET ?? fail('Set BACKUP_S3_BUCKET.'), accessKeyId: process.env.BACKUP_S3_KEY_ID ?? fail('Set BACKUP_S3_KEY_ID.'), secretAccessKey: process.env.BACKUP_S3_SECRET ?? fail('Set BACKUP_S3_SECRET.'), prefix: '' } : loadCreds(credsPath('writer'));
  if (t.prefix && !b.startsWith(t.prefix)) fail('Object key must start with ' + t.prefix);
  const r = await putObject(t, b, raw, Date.now());
  console.log(`Uploaded ${raw.length} encrypted bytes as ${b} (etag ${r.etag ?? 'n/a'}).`);
} else if (command === 'download' && a && b) {
  // recovery: needs the READ-ONLY key file (keep it in your password manager and restore it to the secrets folder only for a restore)
  const t = loadCreds(credsPath('reader'));
  const r = await s3(t, 'GET', a);
  if (r.status !== 200) fail('Download failed: HTTP ' + r.status);
  writeFileSync(b, r.body);
  console.log('Downloaded ' + r.body.length + ' bytes to ' + b + ' (still encrypted: run decrypt/check next).');
} else {
  fail('Usage: node scripts/backup.ts export <out.ckbak> [--local] | decrypt <in.ckbak> <out.sql> | check <in.ckbak|in.sql> | upload <in.ckbak> <object-key> | download <object-key> <out.ckbak>');
}
