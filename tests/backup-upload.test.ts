import assert from 'node:assert/strict';
import { test } from 'node:test';
import { putObject, signV4 } from '../scripts/backup-upload-lib.ts';

// AWS's published SigV4 example (Amazon S3 "GET Object" with a Range header): the signature must match exactly.
test('SigV4 signer reproduces the AWS documentation example signature', () => {
  const h = signV4({ method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { Range: 'bytes=0-9' }, payloadSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    region: 'us-east-1', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', amzDate: '20130524T000000Z' });
  assert.match(h.Authorization!, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  assert.match(h.Authorization!, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date/);
});

const target = { endpoint: 'https://s3.example.invalid', region: 'us-west-004', bucket: 'b', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret-example' };
test('upload sends a signed PUT of the exact bytes and returns the etag', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(null, { status: 200, headers: { etag: '"abc"' } }); }) as unknown as typeof fetch;
  const body = new Uint8Array([1, 2, 3]);
  const r = await putObject(target, 'd1/2026-11-27.bak', body, Date.UTC(2026, 10, 27, 12, 0, 0), f);
  assert.equal(r.etag, '"abc"'); assert.equal(seen!.url, 'https://s3.example.invalid/b/d1/2026-11-27.bak'); assert.equal(seen!.init.method, 'PUT'); assert.equal(seen!.init.redirect, 'manual');
  const h = seen!.init.headers as Record<string, string>;
  assert.match(h.Authorization!, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261127\/us-west-004\/s3\/aws4_request/);
  assert.equal(h['x-amz-date'], '20261127T120000Z'); assert.ok(!JSON.stringify(h).includes('secret-example'));
});

test('a failed upload throws without leaking keys, and unsafe object keys are refused before any request', async () => {
  const f = (async () => new Response('denied secret-example', { status: 403 })) as unknown as typeof fetch;
  await assert.rejects(putObject(target, 'x.bak', new Uint8Array(1), 0, f), (e: Error) => /HTTP 403/.test(e.message) && !e.message.includes('secret'));
  let calls = 0; const g = (async () => { calls++; return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
  for (const bad of ['../x', 'a b', '', 'x'.repeat(201)]) await assert.rejects(putObject(target, bad, new Uint8Array(1), 0, g));
  assert.equal(calls, 0);
});
