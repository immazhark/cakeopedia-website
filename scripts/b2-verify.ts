// Permission-boundary, integrity and isolated-recovery test for the Backblaze B2 backup keys, using ONLY synthetic data (the database schema with no rows).
//   node scripts/b2-verify.ts
// Needs both credential files from b2-keys.ts. Prints statuses only, never keys. Synthetic objects stay in the bucket (the keys cannot permanently delete
// them): remove them in the dashboard or let the 35-day lifecycle rule expire them; they are a few KB of schema.
// Backblaze semantics this test encodes: a key with writeFiles (needed to upload) can HIDE a file (S3 DELETE adds a delete marker, 204) but the original
// version stays recoverable; permanently deleting a specific version needs deleteFiles, which neither key has.
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { REQUIRED_TABLES, checkRestore, decryptBackup, encryptBackup } from './backup-lib.ts';
import { credsPath, loadCreds, s3 } from './b2-lib.ts';

const writer = loadCreds(credsPath('writer')), reader = loadCreds(credsPath('reader'));
let bad = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) bad++; };
const finish = (): never => { console.log(bad ? `\n${bad} check(s) FAILED` : '\nB2 backup keys verified with synthetic data: upload-only writer, read-only reader, no permanent deletion, integrity and recovery proven'); process.exit(bad ? 1 : 0); };
const denied = (s: number) => s === 401 || s === 403;
const text = (b: Uint8Array) => Buffer.from(b).toString('utf8');

// Synthetic payload: the schema only (migrations), encrypted exactly like a real backup.
const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
const passphrase = randomBytes(24).toString('hex');
const blob = encryptBackup(Buffer.from(sql, 'utf8'), passphrase);
const sha = createHash('sha256').update(blob).digest('hex');
const key = `${writer.prefix}synthetic/verify-${new Date().toISOString().replace(/[:.]/g, '-')}.ckbak`;

check((await s3(writer, 'PUT', key, { body: new Uint8Array(blob) })).status === 200, `writer can upload under ${writer.prefix}`);
check(denied((await s3(writer, 'PUT', 'outside-prefix/blocked.bin', { body: new Uint8Array([1]) })).status), 'writer cannot upload outside its prefix');
check(denied((await s3(writer, 'GET', key)).status), 'writer cannot read back');
check(denied((await s3(writer, 'GET', '', { query: 'list-type=2' })).status), 'writer cannot list the bucket');

// The reader finds the version id, then downloads that exact version.
const vlist = await s3(reader, 'GET', '', { query: `versions&prefix=${encodeURIComponent(key)}` });
const versionId = /<Version>[\s\S]*?<VersionId>([^<]+)<\/VersionId>/.exec(text(vlist.body))?.[1];
check(vlist.status === 200 && !!versionId, `reader can list versions under the backups prefix (${vlist.status})`);
if (!versionId) finish();
const q = `versionId=${encodeURIComponent(versionId!)}`;
const got = await s3(reader, 'GET', key, { query: q });
const intact = got.status === 200 && createHash('sha256').update(got.body).digest('hex') === sha;
check(intact, `reader downloads identical bytes: sha256 matches (${got.status})`);
if (!intact) finish();

// Isolated recovery: decrypt with the passphrase and load into a scratch in-memory database.
const r = checkRestore(decryptBackup(Buffer.from(got.body), passphrase).toString('utf8'), REQUIRED_TABLES);
check(r.integrity === 'ok', 'downloaded backup decrypts and restores into a scratch database (integrity ok, required tables present)');

check(denied((await s3(reader, 'PUT', `${writer.prefix}synthetic/reader-should-fail.bin`, { body: new Uint8Array([1]) })).status), 'reader cannot upload');
check(denied((await s3(reader, 'DELETE', key)).status), 'reader cannot delete or hide');
check(denied((await s3(reader, 'DELETE', key, { query: q })).status), 'reader cannot permanently delete a version');
check(denied((await s3(writer, 'DELETE', key, { query: q })).status), 'writer cannot permanently delete a version (no deleteFiles)');

// Last, because it changes what the reader sees: a plain delete by the writer only hides the file; the original version must stay recoverable.
const hide = await s3(writer, 'DELETE', key);
console.log(`INFO  writer plain delete answered ${hide.status}: with writeFiles this only adds a delete marker (hide), it does not destroy data`);
const after = await s3(reader, 'GET', key, { query: q });
check(after.status === 200 && createHash('sha256').update(after.body).digest('hex') === sha, 'after a hide, the original version is still readable and identical (recoverable by version id)');
finish();
