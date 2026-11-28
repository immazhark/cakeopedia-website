import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { FREE_CAP_BYTES, capacity, dayOf, emptyStatus, freshness, logLine, objectKey, recordFailure, recordSuccess, shouldRun } from '../scripts/backup-run-lib.ts';
import { readPassphrase, storePassphrase, validatePassphrase } from '../scripts/backup-secret.ts';

const H = 3_600_000, T0 = Date.UTC(2026, 10, 27, 3, 0, 0);

test('scheduling: first run goes, a recent success skips, an old one runs, force always runs (catch-up never uploads twice)', () => {
  assert.equal(shouldRun(emptyStatus(), T0, false).run, true);
  const s = recordSuccess(emptyStatus(), T0, 'k', 100);
  assert.equal(shouldRun(s, T0 + 2 * H, false).run, false);
  assert.equal(shouldRun(s, T0 + 21 * H, false).run, true);
  assert.equal(shouldRun(s, T0 + 1, true).run, true);
});

test('status: success resets failures and keeps one entry per day; failure counts up without touching the last success; freshness detects a missed run', () => {
  let s = recordFailure(recordFailure(emptyStatus(), T0), T0 + 1);
  assert.deepEqual([s.consecutiveFailures, s.lastSuccessAt, freshness(s, T0)], [2, null, 'never']);
  s = recordSuccess(s, T0, 'backups/d1/production/2026-11-27.ckbak', 500); s = recordSuccess(s, T0 + H, 'k2', 700);
  assert.deepEqual([s.consecutiveFailures, s.recent.length, s.recent[0]!.bytes, s.lastObjectKey], [0, 1, 700, 'k2']);
  s = recordFailure(s, T0 + 30 * H);
  assert.deepEqual([s.lastSuccessAt, s.consecutiveFailures, freshness(s, T0 + 30 * H), freshness(s, T0 + 40 * H)], [T0 + H, 1, 'ok', 'stale']);
  let many = emptyStatus(); for (let d = 0; d < 120; d++) many = recordSuccess(many, T0 + d * 24 * H, 'k', 1);
  assert.equal(many.recent.length, 80); assert.equal(many.recent.at(-1)!.day, dayOf(T0 + 119 * 24 * H));
});

test('capacity: projects the largest backup over the 70-day retention window; warns at 50% and goes critical at 80% of the free 10 GB', () => {
  const at = (bytes: number) => capacity(recordSuccess(emptyStatus(), T0, 'k', bytes));
  assert.deepEqual([at(2_000_000).level, at(2_000_000).projectedBytes], ['ok', 140_000_000]);
  assert.equal(at(Math.ceil(FREE_CAP_BYTES * 0.5 / 70)).level, 'warn');
  assert.equal(at(Math.ceil(FREE_CAP_BYTES * 0.8 / 70)).level, 'critical');
  assert.equal(capacity(emptyStatus()).level, 'ok');
});

test('object keys are dated per source (no same-name overwrite) and always under the writer prefix', () => {
  assert.equal(objectKey(T0, 'production'), 'backups/d1/production/2026-11-27.ckbak');
  assert.ok(objectKey(T0, 'local').startsWith('backups/'));
});

test('log lines keep only whitelisted scalar fields, truncated and stripped of control characters, so tool output and secrets cannot leak into the log', () => {
  const line = logLine({ t: 'x', evt: 'backup', ok: false, stage: 'upload', code: 1, passphrase: 'hunter2hunter2hunter2', error: 'ECONNRESET secret', key: 'a'.repeat(300) + '\u0000\nINJECT' });
  const o = JSON.parse(line) as Record<string, unknown>;
  assert.ok(!('passphrase' in o) && !('error' in o) && !line.includes('hunter2')); assert.ok(!line.includes('\n')); assert.equal((o.key as string).length, 120);
});

test('passphrase rules: at least 20 characters, no edge spaces', () => {
  assert.throws(() => validatePassphrase('short'), /at least 20/); assert.throws(() => validatePassphrase(' ' + 'x'.repeat(24)), /space/); validatePassphrase('x'.repeat(24));
});

test('passphrase storage with injected PowerShell: the value goes in on stdin only, never in the script text, and a read failure leaks nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ckpass-')), file = join(dir, 'p.dpapi'); const secret = 'correct horse battery staple 99';
  const seen: { script: string; stdin: string | undefined }[] = [];
  storePassphrase(secret, file, (script, stdin) => { seen.push({ script, stdin }); return ''; });
  assert.equal(seen[0]!.stdin, secret); assert.ok(!seen[0]!.script.includes(secret));
  writeFileSync(file, 'not-a-real-blob'); // the file must exist for a read to be attempted
  assert.throws(() => readPassphrase(file, () => { throw new Error('boom ' + secret); }), (e: Error) => !e.message.includes(secret) && /could not be decrypted/.test(e.message));
  assert.equal(readPassphrase(join(dir, 'none.dpapi'), () => 'x'), null);
  rmSync(dir, { recursive: true, force: true });
});

test('Windows DPAPI round trip (real): the stored file is not plain text and only reads back with the same value', { skip: process.platform !== 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'ckpass-')), file = join(dir, 'p.dpapi'); const secret = 'synthetic-dpapi-test-passphrase-123';
  storePassphrase(secret, file);
  assert.ok(!readFileSync(file, 'ascii').includes(secret) && !readFileSync(file, 'ascii').includes('synthetic'));
  assert.equal(readPassphrase(file), secret);
  rmSync(dir, { recursive: true, force: true });
});
