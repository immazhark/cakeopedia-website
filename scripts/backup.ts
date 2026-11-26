// Encrypted D1 backup and restore check (run with `node scripts/backup.ts <command>`; see docs/operations-runbook.md, section 6).
//   export <out.ckbak> [--local]   exports the database with Wrangler (remote needs `wrangler login`), encrypts it, removes the plain file
//   decrypt <in.ckbak> <out.sql>   writes the plain SQL (it contains customer data: keep it only as long as needed)
//   check <in.ckbak|in.sql>        loads the dump into a scratch in-memory database and prints row counts and the integrity result
// The passphrase comes from the BACKUP_PASSPHRASE environment variable (at least 20 characters) and is never written anywhere.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REQUIRED_TABLES, checkRestore, decryptBackup, encryptBackup } from './backup-lib.ts';

const [command, a, b] = process.argv.slice(2);
const passphrase = process.env.BACKUP_PASSPHRASE ?? '';
const fail = (m: string): never => { console.error(m); process.exit(1); };
const needKey = () => { if (passphrase.length === 0) fail('Set BACKUP_PASSPHRASE (at least 20 characters) in the environment.'); };

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
} else {
  fail('Usage: node scripts/backup.ts export <out.ckbak> [--local] | decrypt <in.ckbak> <out.sql> | check <in.ckbak|in.sql>');
}
