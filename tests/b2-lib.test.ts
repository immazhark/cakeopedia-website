import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { B2, keyRequests, loadCreds, s3 } from '../scripts/b2-lib.ts';

test('writer key can only upload, to one bucket and one prefix; reader can only read and list', () => {
  const { writer, reader } = keyRequests();
  assert.deepEqual(writer.capabilities, ['writeFiles']); assert.deepEqual(writer.bucketIds, [B2.bucketId]); assert.equal(writer.namePrefix, 'backups/');
  assert.deepEqual([...reader.capabilities].sort(), ['listBuckets', 'listFiles', 'readFiles']); assert.deepEqual(reader.bucketIds, [B2.bucketId]);
  const forbidden = /delete|writeBucket|writeKeys|listKeys|bypass|Retention|LegalHold|shareFiles|Encryption|Notification/;
  for (const k of [writer, reader]) assert.ok(!k.capabilities.some((c) => forbidden.test(c)), k.keyName);
  assert.ok(!reader.capabilities.includes('writeFiles'));
});

test('credential files are validated and https-only', () => {
  const d = mkdtempSync(join(tmpdir(), 'b2test-'));
  const good = { endpoint: 'https://s3.example.invalid', region: 'r', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's', prefix: 'backups/' };
  writeFileSync(join(d, 'ok.json'), JSON.stringify(good)); assert.equal(loadCreds(join(d, 'ok.json')).bucket, 'b');
  writeFileSync(join(d, 'bad.json'), JSON.stringify({ ...good, secretAccessKey: '' })); assert.throws(() => loadCreds(join(d, 'bad.json')), /secretAccessKey/);
  writeFileSync(join(d, 'http.json'), JSON.stringify({ ...good, endpoint: 'http://x' })); assert.throws(() => loadCreds(join(d, 'http.json')), /https/);
  assert.throws(() => loadCreds(join(d, 'none.json')), /missing or unreadable/);
});

test('s3 helper signs GET and DELETE, keeps statuses (403 is data, not an exception) and never sends the secret', async () => {
  const seen: { method: string; url: string; auth: string }[] = [];
  const f = (async (url: string, init: RequestInit) => { seen.push({ method: init.method!, url, auth: (init.headers as Record<string, string>).Authorization! }); return new Response('denied', { status: 403 }); }) as unknown as typeof fetch;
  const t = { endpoint: 'https://s3.example.invalid', region: 'r', bucket: 'b', accessKeyId: 'AKID', secretAccessKey: 'topsecret' };
  assert.equal((await s3(t, 'GET', 'backups/x', {}, 0, f)).status, 403); assert.equal((await s3(t, 'DELETE', 'backups/x', {}, 0, f)).status, 403);
  await s3(t, 'GET', '', { query: 'list-type=2&prefix=backups%2F' }, 0, f);
  assert.deepEqual(seen.map((s) => s.method), ['GET', 'DELETE', 'GET']); assert.equal(seen[2]!.url, 'https://s3.example.invalid/b?list-type=2&prefix=backups%2F');
  assert.ok(seen.every((s) => /Credential=AKID\//.test(s.auth) && !s.auth.includes('topsecret')));
});
