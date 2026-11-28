// After restoring a backup, re-apply every erasure made since it was taken (and any the backup predates) BEFORE the restored data is used:
//   node scripts/reapply-erasures.ts --dump restore.sql --ledger erasure-ledger.txt --out restore-reerased.sql
// The dump is a decrypted database backup (node scripts/backup.ts decrypt ...); the ledger is the decrypted newest backups/ledger/<source>/erasure-ledger.ckbak.
// The output is the dump plus idempotent anonymising statements; it is loaded into a scratch database here and checked: every ledger reference present in the
// dump must come out erased. Import the OUTPUT file into the new database, never the original dump. Delete the plain files afterwards (they hold customer data).
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { reapplyErasureSql } from '../worker/erase.ts';
import { parseLedger } from './erasure-ledger-lib.ts';

const arg = (n: string) => process.argv[process.argv.indexOf(n) + 1];
const dumpFile = arg('--dump'), ledgerFile = arg('--ledger'), outFile = arg('--out');
if (!dumpFile || !ledgerFile || !outFile) { console.error('Usage: node scripts/reapply-erasures.ts --dump restore.sql --ledger erasure-ledger.txt --out restore-reerased.sql'); process.exit(2); }
try {
  const dump = readFileSync(dumpFile, 'utf8'), ledger = parseLedger(readFileSync(ledgerFile, 'utf8'));
  const statements = [...ledger.values()].flatMap((e) => reapplyErasureSql(e.reference, e.at, e.source));
  const result = `${dump.trimEnd()}\n\n-- Erasures re-applied after restore (${ledger.size})\n${statements.join('\n')}\n`;
  const db = new DatabaseSync(':memory:'); db.exec(result);
  const present = (db.prepare('SELECT public_reference AS r, json_extract(payload_json, \'$.erased\') AS e FROM enquiries').all() as { r: string; e: number | null }[]).filter((x) => ledger.has(x.r));
  const notErased = present.filter((x) => x.e !== 1);
  if (notErased.length) throw new Error(`${notErased.length} ledger enquiry(ies) are still not erased in the result; nothing was written.`);
  const integrity = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
  if (integrity !== 'ok') throw new Error('The result failed the integrity check; nothing was written.');
  writeFileSync(outFile, result);
  console.log(`Re-applied ${ledger.size} erasure(s): ${present.length} were present in this backup and are now erased, ${ledger.size - present.length} were not in it. Integrity ok. Import ${outFile}, not the original dump.`);
} catch (e) { console.error('STOPPED: ' + (e instanceof Error ? e.message : String(e))); process.exitCode = 1; }
