import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorize, type AccessConfig } from '../worker/auth.ts';

// 401 = sign in again, 403 = signed in but not an operator, 503 = our side (signing keys unreachable). They must not be confused.
const ISS = 'https://t.cloudflareaccess.invalid', AUD = 'aud', NOW = 1_800_000_000;
const b64u = (b: ArrayBuffer | string) => Buffer.from(typeof b === 'string' ? b : new Uint8Array(b)).toString('base64url');
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' };
const sign = async (claims: object) => {
  const d = `${b64u(JSON.stringify({ alg: 'RS256', kid: 'k1' }))}.${b64u(JSON.stringify({ iss: ISS, aud: [AUD], exp: NOW + 600, email: 'a@example.invalid', ...claims }))}`;
  return `${d}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(d)))}`;
};
const cfg = (getKeys: AccessConfig['getKeys']): AccessConfig => ({ issuer: ISS, audience: AUD, operators: new Set(['a@example.invalid']), getKeys, now: () => NOW, origin: 'https://x.invalid' });
const status = async (jwt: string | null, c: AccessConfig) => {
  const r = await authorize(new Request('https://x.invalid/admin/api/x', { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} }), c);
  return r.ok ? 200 : r.response.status;
};

test('auth failures are told apart', async () => {
  const ok = cfg(async () => [jwk]);
  assert.equal(await status(await sign({}), ok), 200);
  assert.equal(await status(null, ok), 401);
  assert.equal(await status(await sign({ exp: NOW - 1 }), ok), 401, 'expired');
  assert.equal(await status(await sign({ email: 'b@example.invalid' }), ok), 403, 'valid identity, not an operator');
  const down = cfg(async () => { throw Error('keys down'); });
  assert.equal(await status(await sign({}), down), 503, 'signing keys unreachable');
  assert.equal(await status('not-a-jwt', down), 401, 'malformed token never reaches the key fetch');
});
