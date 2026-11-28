import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildManifest, decryptManifest, encryptManifest, reconcile, type R2Entry, type UploadRow } from '../scripts/backup-r2-lib.ts';

const pass = 'a-long-synthetic-passphrase-for-tests';
const obj = (key: string, size = 10): R2Entry => ({ key, size, etag: `e-${key}` });
const row = (k: string, over: Partial<UploadRow> = {}): UploadRow => ({ object_key: k, bytes: 10, enquiry_id: 'q1', deleted_at: null, ready_at: 1, ...over });
const pages = (...p: R2Entry[][]) => { let i = 0; return { list: async (o: { cursor?: string }) => { assert.equal(o.cursor, i === 0 ? undefined : `c${i}`); const objects = p[i++] ?? []; return { objects, cursor: i < p.length ? `c${i}` : undefined }; } }; };

test('manifest: pages are followed, entries sorted and deduplicated, and the encrypted file round-trips without plain keys', async () => {
  const m = await buildManifest(pages([obj('b'), obj('a')], [obj('c'), obj('a')]), 5);
  assert.deepEqual(m.entries.map((e) => e.key), ['a', 'b', 'c']);
  const blob = encryptManifest(m, pass);
  assert.ok(!blob.includes('SECRET-KEY') && !blob.includes('"key"'));
  assert.deepEqual(decryptManifest(blob, pass), m);
  assert.throws(() => decryptManifest(blob, 'another-long-synthetic-passphrase'), /Wrong passphrase/);
});

test('manifest: an unfinished listing and a manifest whose hash does not match are rejected', async () => {
  await assert.rejects(buildManifest({ list: async () => ({ objects: [], cursor: 'x' }) }, 1, 3), /page limit/);
  const m = await buildManifest(pages([obj('a')]), 1);
  m.entries[0]!.size = 99; // edited after hashing, then re-encrypted
  assert.throws(() => decryptManifest(encryptManifest(m, pass), pass), /integrity/);
});

test('reconcile: clean when D1 and the bucket agree', async () => {
  const m = await buildManifest(pages([obj('a'), obj('b')]), 1);
  assert.equal(reconcile(m, [row('a'), row('b')], new Set()).ok, true);
});

test('reconcile: flags erased-but-present, missing, size mismatch and untracked objects; ignores not-yet-ready rows', async () => {
  const m = await buildManifest(pages([obj('erased'), obj('del'), obj('small', 5), obj('stray')]), 1);
  const r = reconcile(m, [row('erased', { enquiry_id: 'gone' }), row('del', { deleted_at: 3 }), row('small'), row('lost'), row('pending', { ready_at: null })], new Set(['gone']));
  assert.deepEqual(r.erasedStillInBucket, ['del', 'erased']);
  assert.deepEqual(r.sizeMismatch, ['small']);
  assert.deepEqual(r.untracked, ['stray']);
  assert.deepEqual(r.missingInBucket, ['lost']);
  assert.equal(r.ok, false);
});
