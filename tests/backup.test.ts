import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIN_PASSPHRASE, REQUIRED_TABLES, checkRestore, decryptBackup, encryptBackup } from '../scripts/backup-lib.ts';

const pass = 'a-long-synthetic-passphrase-for-tests';
const plain = Buffer.from('CREATE TABLE t (x TEXT); INSERT INTO t VALUES (\'SYNTHETIC-PRIVATE-NAME\');');

test('backup: round trip works, the file never contains the plain text, and each encryption is different', () => {
  const a = encryptBackup(plain, pass), b = encryptBackup(plain, pass);
  assert.deepEqual(decryptBackup(a, pass), plain);
  assert.ok(!a.includes('SYNTHETIC-PRIVATE-NAME'));
  assert.ok(!a.equals(b)); // fresh salt and iv every time
});

test('backup: a wrong passphrase, a flipped byte, truncation and a foreign file all fail to decrypt', () => {
  const blob = encryptBackup(plain, pass);
  assert.throws(() => decryptBackup(blob, pass + 'x'), /Wrong passphrase or damaged/);
  const flipped = Buffer.from(blob); flipped[flipped.length - 3] = flipped[flipped.length - 3]! ^ 1;
  assert.throws(() => decryptBackup(flipped, pass), /Wrong passphrase or damaged/);
  assert.throws(() => decryptBackup(blob.subarray(0, blob.length - 4), pass), /Wrong passphrase or damaged/);
  assert.throws(() => decryptBackup(Buffer.from('not a backup at all, just some text'), pass), /Not a Cakeopedia backup/);
});

test('backup: a short passphrase is refused for both encryption and decryption', () => {
  const short = 'x'.repeat(MIN_PASSPHRASE - 1);
  assert.throws(() => encryptBackup(plain, short), /at least/);
  assert.throws(() => decryptBackup(encryptBackup(plain, pass), short), /at least/);
});

test('restore check: counts rows, runs the integrity check and refuses a backup missing a required table', () => {
  const sql = 'CREATE TABLE enquiries (id TEXT PRIMARY KEY); INSERT INTO enquiries VALUES (\'a\'), (\'b\'); CREATE TABLE quotes (id TEXT);';
  const r = checkRestore(sql, ['enquiries', 'quotes']);
  assert.deepEqual(r.tables, { enquiries: 2, quotes: 0 });
  assert.equal(r.integrity, 'ok');
  assert.throws(() => checkRestore(sql, ['enquiries', 'payments']), /table "payments" is missing/);
  assert.throws(() => checkRestore('CREATE TABLE broken (', ['enquiries']));
});

test('the required table list covers the money, enquiry and upload records', () => {
  for (const t of ['enquiries', 'quotes', 'payments', 'uploads']) assert.ok(REQUIRED_TABLES.includes(t), t);
});
