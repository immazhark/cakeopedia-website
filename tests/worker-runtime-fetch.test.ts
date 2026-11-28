import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createAccessKeySource } from '../worker/access-keys.ts';
import { sendResendEmail } from '../worker/resend-transport.ts';
import { createTurnstileVerifier } from '../worker/turnstile.ts';

// Cloudflare Workers reject fetch(..., { redirect: 'error' }) with a TypeError at runtime (found on the first live staging run:
// every owner request got 401 because the Access key fetch always failed). Node accepts it, so unit tests with fake transports
// could not see it. Use 'manual' and never accept a 3xx as success.
test('no Worker source asks fetch for redirect: "error" (unsupported at the edge)', () => {
  const dir = new URL('../worker/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts')))
    assert.ok(!/redirect\s*:\s*['"]error['"]/.test(readFileSync(new URL(f, dir), 'utf8')), `${f} uses redirect: 'error'`);
});

const redirected = (body: unknown) => new Response(JSON.stringify(body), { status: 302, headers: { Location: 'https://elsewhere.invalid/' } });

test('a redirect is never accepted by the Access key fetch, the Turnstile check or the email transport', async () => {
  const key = { kty: 'RSA', alg: 'RS256', use: 'sig', kid: 'k', n: 'A'.repeat(342), e: 'AQAB' };
  await assert.rejects(createAccessKeySource('https://team.cloudflareaccess.com', async () => redirected({ keys: [key] }))());
  const verify = createTurnstileVerifier({ secret: 's', hostname: 'cakeopedia.com', action: 'enquiry' }, async () => redirected({ success: true, hostname: 'cakeopedia.com', action: 'enquiry' }));
  await assert.rejects(verify('token'));
  const sent = await sendResendEmail('key', 'idem', JSON.stringify({ to: ['a@example.invalid'] }), async () => redirected({ id: 'x' }));
  assert.notEqual(sent.kind, 'accepted');
});
