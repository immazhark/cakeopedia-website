import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// The production config template must stay closed by default, free of secrets and in step with the settings the Worker reads.
const raw = readFileSync(new URL('../wrangler.production.example.jsonc', import.meta.url), 'utf8');
function stripComments(src: string): string { // JSONC comments outside strings only (URLs inside strings contain //)
  let out = '', inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!, n = src[i + 1];
    if (inStr) { out += c; if (c === '\\') { out += n ?? ''; i++; } else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
    out += c;
  }
  return out;
}
const cfg = JSON.parse(stripComments(raw)) as { vars: Record<string, string>; assets: { run_worker_first: string[] }; d1_databases: { database_id: string }[]; r2_buckets: { bucket_name: string }[]; triggers: { crons: string[] }; workers_dev: boolean };

test('template is closed by default and carries no secrets or real identifiers', () => {
  assert.equal(cfg.vars.LIVE_ENABLED, '0');
  assert.equal(cfg.vars.NOTIFICATIONS_ENABLED, '0');
  assert.equal(cfg.vars.RATE_CLEANUP_ENABLED, '1'); assert.equal(cfg.vars.UPLOAD_CLEANUP_ENABLED, '1'); // mandatory at launch (runbook)
  assert.ok(!('RETENTION_DAYS' in cfg.vars)); // off until the owner chooses a period
  for (const secret of ['TURNSTILE_SECRET', 'RATE_SECRET', 'RESEND_API_KEY', 'CATALOGUE_REBUILD_HOOK']) assert.ok(!(secret in cfg.vars), `${secret} is a secret and must not be a plain variable`);
  assert.match(cfg.d1_databases[0]!.database_id, /^REPLACE_/);
  assert.match(cfg.r2_buckets[0]!.bucket_name, /^replace-/);
  assert.equal(cfg.workers_dev, false);
  assert.ok(!/[0-9a-f]{32}/i.test(raw), 'no 32-hex account or resource identifiers');
});

test('only the API paths run the Worker first and a schedule exists for the maintenance jobs', () => {
  assert.deepEqual([...cfg.assets.run_worker_first].sort(), ['/admin/api/*', '/api/*', '/health']);
  assert.equal(cfg.triggers.crons.length, 1);
});

test('every setting the Worker reads is mentioned in the template', () => {
  const live = readFileSync(new URL('../worker/live.ts', import.meta.url), 'utf8');
  const env = live.slice(live.indexOf('export type Env'), live.indexOf('}>;', live.indexOf('export type Env')));
  const names = [...env.matchAll(/\b([A-Z][A-Z_]{2,})\??:/g)].map((m) => m[1]!);
  assert.ok(names.length >= 14, `found ${names.length} settings`);
  for (const name of names) assert.ok(raw.includes(name), `${name} is read by worker/live.ts but missing from wrangler.production.example.jsonc`);
});
