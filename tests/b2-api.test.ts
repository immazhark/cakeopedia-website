import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAuthorize, parseCreatedKey, parseKeyList, setupKeys } from '../scripts/b2-api.ts';
import { B2, keyRequests, type Creds } from '../scripts/b2-lib.ts';

// Response shapes copied from the official Backblaze v4 documentation (b2_authorize_account, b2_list_keys, b2_create_key).
const MASTER_CAPS = ['deleteFiles', 'deleteKeys', 'readBucketEncryption', 'writeKeys', 'writeBuckets', 'deleteBuckets', 'readBuckets', 'readFiles', 'listAllBucketNames', 'shareFiles', 'writeFiles', 'listKeys', 'listBuckets', 'listFiles'];
const authDoc = (over: Record<string, unknown> = {}) => ({ accountId: 'ACCT', apiInfo: { storageApi: { absoluteMinimumPartSize: 5000000, apiUrl: 'https://api001.backblazeb2.com',
  allowed: { buckets: [{ id: 'bucketId1', name: 'bucketIdName1' }], capabilities: MASTER_CAPS, namePrefix: null }, downloadUrl: 'https://f001.backblazeb2.com', recommendedPartSize: 100000000, s3ApiUrl: B2.endpoint }, groupsApi: { capabilities: ['all'], infoType: 'groupsApi' } }, applicationKeyExpirationTimestamp: null, authorizationToken: 'TOKEN', ...over });
const listDoc = { keys: [{ accountId: '12f634bf3cby', applicationKeyId: '00512f95cf4dcf0000000004y', bucketIds: ['BUCKET_ID_1'], capabilities: ['listKeys', 'writeKeys'], expirationTimestamp: null, keyName: 'all-bucket-key', namePrefix: null, options: ['s3'] },
  { accountId: '12f634bf3cbz', applicationKeyId: '00512f95cf4dcf0000000004z', bucketIds: null, capabilities: ['listFiles'], expirationTimestamp: null, keyName: 'backup-bucket-key', namePrefix: null, options: ['s3'] }], nextApplicationKeyId: null };

test('authorize: reads capabilities from apiInfo.storageApi.allowed (v4); the old direct location is rejected with a clear message', () => {
  const a = parseAuthorize(authDoc()); assert.deepEqual([a.accountId, a.token, a.apiUrl, a.s3ApiUrl], ['ACCT', 'TOKEN', 'https://api001.backblazeb2.com', B2.endpoint]); assert.ok(a.capabilities.includes('writeKeys'));
  const v3 = authDoc(); (v3.apiInfo.storageApi as Record<string, unknown>).capabilities = MASTER_CAPS; delete (v3.apiInfo.storageApi as Record<string, unknown>).allowed;
  assert.throws(() => parseAuthorize(v3), /apiInfo\.storageApi\.allowed" is missing/);
  assert.throws(() => parseAuthorize({ ...authDoc(), authorizationToken: undefined }), /authorizationToken/);
  assert.throws(() => parseAuthorize(null), /response/);
});

test('key list parses the documented shape, including bucketIds null, and created keys must match what was asked for', () => {
  const l = parseKeyList(listDoc); assert.equal(l.keys.length, 2); assert.deepEqual(l.keys[1]!.bucketIds, []); assert.equal(l.next, null);
  assert.throws(() => parseKeyList({}), /keys/);
  const { writer } = keyRequests();
  const ok = { accountId: 'ACCT', applicationKeyId: 'KID', applicationKey: 'SECRET', bucketIds: writer.bucketIds, capabilities: ['writeFiles'], expirationTimestamp: null, keyName: writer.keyName, namePrefix: 'backups/', options: ['s3'] };
  assert.equal(parseCreatedKey(ok, writer).applicationKeyId, 'KID');
  assert.throws(() => parseCreatedKey({ ...ok, capabilities: ['writeFiles', 'deleteFiles'] }, writer), /different capabilities/);
  assert.throws(() => parseCreatedKey({ ...ok, bucketIds: [] }, writer), /bucket restrictions/);
  assert.throws(() => parseCreatedKey({ ...ok, namePrefix: null }, writer), /name prefix/);
  assert.throws(() => parseCreatedKey({ ...ok, applicationKey: undefined }, writer), /applicationKey/);
});

// A fake Backblaze implementing the documented v4 endpoints; records every request so request shapes can be asserted.
function fakeB2(opts: { existing?: Record<string, unknown>[]; auth?: Record<string, unknown>; failCreate?: string } = {}) {
  const calls: { method: string; path: string; query: string; auth: string | null; body: Record<string, unknown> | null }[] = []; let n = 0;
  const existing = [...(opts.existing ?? [])];
  const f = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url), h = new Headers(init.headers), body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method: init.method ?? 'GET', path: u.pathname, query: u.search, auth: h.get('Authorization'), body });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (u.pathname.endsWith('b2_authorize_account')) return json(opts.auth ?? authDoc());
    if (u.pathname.endsWith('b2_list_keys')) return json({ keys: existing, nextApplicationKeyId: null });
    if (u.pathname.endsWith('b2_delete_key')) { const i = existing.findIndex((k) => k.applicationKeyId === body!.applicationKeyId); existing.splice(i, 1); return json({}); }
    if (u.pathname.endsWith('b2_create_key')) {
      if (opts.failCreate === body!.keyName) return json({ status: 400, code: 'bad_request', message: 'nope' }, 400);
      n++; return json({ accountId: body!.accountId, applicationKeyId: `KID${n}`, applicationKey: `SECRET${n}`, bucketIds: body!.bucketIds, capabilities: body!.capabilities, expirationTimestamp: null, keyName: body!.keyName, namePrefix: body!.namePrefix ?? null, options: ['s3'] });
    }
    return json({}, 404);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const run = async (fake: ReturnType<typeof fakeB2>, replaceStale = false) => {
  const saved: Record<string, Creds> = {}, said: string[] = [];
  await setupKeys({ accountId: 'ACCT', authKeyId: 'MASTERID', authKey: 'MASTERSECRET', replaceStale }, { fetchImpl: fake.f, save: (r, c) => { saved[r] = c; }, say: (l) => said.push(l) });
  return { saved, said };
};

test('setup: clean account creates exactly a write-only writer and a read-only reader with the documented request shapes; no secret is printed', async () => {
  const fake = fakeB2(); const { saved, said } = await run(fake);
  assert.deepEqual(fake.calls.map((c) => `${c.method} ${c.path.split('/').pop()}`), ['GET b2_authorize_account', 'GET b2_list_keys', 'POST b2_create_key', 'POST b2_create_key']);
  assert.match(fake.calls[1]!.query, /accountId=ACCT&maxKeyCount=1000/); assert.equal(fake.calls[1]!.auth, 'TOKEN');
  const [w, r] = [fake.calls[2]!.body!, fake.calls[3]!.body!];
  assert.deepEqual([w.capabilities, w.bucketIds, w.namePrefix, w.keyName], [['writeFiles'], [B2.bucketId], 'backups/', 'cakeopedia-backup-writer']);
  assert.deepEqual([[...(r.capabilities as string[])].sort(), r.bucketIds, r.namePrefix], [['listBuckets', 'listFiles', 'readFiles'], [B2.bucketId], undefined]);
  assert.deepEqual([saved.writer!.accessKeyId, saved.writer!.secretAccessKey, saved.writer!.prefix, saved.reader!.accessKeyId, saved.reader!.prefix], ['KID1', 'SECRET1', 'backups/', 'KID2', '']);
  assert.ok(!said.join('\n').includes('SECRET') && !JSON.stringify(fake.calls).includes('MASTERSECRET'), 'secrets never echoed; the master key only appears in the Basic auth header');
});

test('setup: refuses a key without writeKeys, a mismatched account ID and a foreign S3 endpoint, before creating anything', async () => {
  const weak = authDoc(); (weak.apiInfo.storageApi.allowed as Record<string, unknown>).capabilities = ['listFiles'];
  let f = fakeB2({ auth: weak }); await assert.rejects(run(f), /lacks the "writeKeys"/); assert.ok(!f.calls.some((c) => c.path.endsWith('b2_create_key')));
  await assert.rejects(setupKeys({ accountId: 'OTHER', authKeyId: 'a', authKey: 'b', replaceStale: false }, { fetchImpl: fakeB2().f, save() {}, say() {} }), /does not match/);
  const foreign = authDoc(); (foreign.apiInfo.storageApi as Record<string, unknown>).s3ApiUrl = 'https://s3.us-west-001.backblazeb2.com';
  f = fakeB2({ auth: foreign }); await assert.rejects(run(f), /S3 endpoint/); assert.ok(!f.calls.some((c) => c.path.endsWith('b2_create_key')));
});

test('setup: a same-named key from an earlier run is detected first; --replace-stale deletes only an exact match; a different one is never deleted', async () => {
  const { writer } = keyRequests();
  const stale = { applicationKeyId: 'OLD1', keyName: writer.keyName, capabilities: ['writeFiles'], bucketIds: [B2.bucketId], namePrefix: 'backups/' };
  let f = fakeB2({ existing: [stale] }); await assert.rejects(run(f), /already exists \(OLD1\).*--replace-stale/); assert.ok(!f.calls.some((c) => /create_key|delete_key/.test(c.path)));
  f = fakeB2({ existing: [stale] }); const r = await run(f, true);
  assert.deepEqual(f.calls.map((c) => c.path.split('/').pop()).filter((p) => /delete|create/.test(p!)), ['b2_delete_key', 'b2_create_key', 'b2_create_key']); assert.equal(f.calls.find((c) => c.path.endsWith('b2_delete_key'))!.body!.applicationKeyId, 'OLD1'); assert.ok(r.said[0]!.includes('Deleted stale'));
  f = fakeB2({ existing: [{ ...stale, capabilities: ['writeFiles', 'deleteFiles'] }] }); await assert.rejects(run(f, true), /DIFFERENT permissions/); assert.ok(!f.calls.some((c) => /delete_key|create_key/.test(c.path)));
});

test('setup: if the reader fails after the writer was created, the writer secret is already saved and the error says what happened', async () => {
  const saved: string[] = []; const fake = fakeB2({ failCreate: 'cakeopedia-backup-reader' });
  await assert.rejects(setupKeys({ accountId: 'ACCT', authKeyId: 'M', authKey: 'S', replaceStale: false }, { fetchImpl: fake.f, save: (r) => { saved.push(r); }, say() {} }), /refused b2_create_key: HTTP 400 bad_request nope/);
  assert.deepEqual(saved, ['writer']);
});
