import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendResendEmail } from '../worker/resend-transport.ts';

const message = JSON.stringify({ from: 'sender@example.invalid', to: ['receiver@example.invalid'], subject: 'Synthetic test', text: 'Synthetic only' });
const key = 'cakeopedia/synthetic-event';
const response = (status: number, body: unknown, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, ...(headers === undefined ? {} : { headers }) });

test('transmits the frozen bytes and same idempotency key on retries', async () => {
  const requests: RequestInit[] = [];
  const transport: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    requests.push(init!);
    return response(200, { id: 'synthetic-provider-id' });
  };
  for (let i = 0; i < 2; i++) assert.deepEqual(await sendResendEmail('test-secret', key, message, transport), { kind: 'accepted', providerId: 'synthetic-provider-id' });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    const headers = new Headers(request.headers);
    assert.equal(headers.get('Idempotency-Key'), key);
    assert.equal(headers.get('Authorization'), 'Bearer test-secret');
    assert.equal(request.body, message);
    assert.equal(request.redirect, 'error');
  }
});

test('quota responses preserve retry delay; concurrent requests retry the same key', async () => {
  assert.deepEqual(await sendResendEmail('test-secret', key, message, async () => response(429, {}, { 'Retry-After': '120' })), { kind: 'retry', reason: 'quota', retryAfterMs: 120000 });
  assert.deepEqual(await sendResendEmail('test-secret', key, message, async () => response(409, { name: 'concurrent_idempotent_requests' })), { kind: 'retry', reason: 'temporary' });
});

test('ambiguous outcomes never claim acceptance or expose private provider errors', async () => {
  for (const status of [200, 409, 500, 503]) {
    const result = await sendResendEmail('test-secret', key, message, async () => response(status, { name: 'invalid_idempotent_request', message: 'PRIVATE' }));
    assert.deepEqual(result, { kind: 'unknown' });
  }
  assert.deepEqual(await sendResendEmail('test-secret', key, message, async () => { throw Error('PRIVATE'); }), { kind: 'unknown' });
  assert.deepEqual(await sendResendEmail('test-secret', key, message, async () => response(200, { id: 'x'.repeat(257) })), { kind: 'unknown' });
});

test('definitive client rejection is permanent, invalid configuration never sends', async () => {
  assert.deepEqual(await sendResendEmail('test-secret', key, message, async () => response(422, {})), { kind: 'permanent' });
  let calls = 0;
  const transport: typeof fetch = async () => { calls++; return response(200, { id: 'bad' }); };
  assert.deepEqual(await sendResendEmail('', key, message, transport), { kind: 'permanent' });
  assert.deepEqual(await sendResendEmail('test-secret', '', message, transport), { kind: 'permanent' });
  assert.equal(calls, 0);
});

test('timeouts cover the transport and streaming response; oversize responses fail safely', async () => {
  const hanging: typeof fetch = async () => new Promise<Response>(() => {});
  assert.deepEqual(await sendResendEmail('test-secret', key, message, hanging, 15), { kind: 'unknown' });
  const streaming: typeof fetch = async () => new Response(new ReadableStream({ start() {} }));
  assert.deepEqual(await sendResendEmail('test-secret', key, message, streaming, 15), { kind: 'unknown' });
  assert.deepEqual(await sendResendEmail('test-secret', key, message, async () => response(200, { id: 'a', padding: 'x'.repeat(20_000) })), { kind: 'unknown' });
});
