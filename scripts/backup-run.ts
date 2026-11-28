// Unattended encrypted backup: export -> restore check -> encrypt -> upload to Backblaze -> record. Safe to trigger repeatedly: it skips if a backup succeeded
// in the last 20 hours, so Windows Task Scheduler can run it daily AND at logon (missed-run catch-up) without duplicates.
//   node scripts/backup-run.ts --source production|staging|local [--force]
//   node scripts/backup-run.ts --status
// Needs: the DPAPI passphrase (backup-passphrase.ts set), the B2 writer file (b2-keys.ts), and for production/staging a logged-in Wrangler. The run state and a
// log with NO customer data, keys or passphrase live in %LOCALAPPDATA%\cakeopedia-backup\. Failure and capacity problems raise a Windows notification and a
// non-zero exit code (Task Scheduler shows it as the last run result).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { secretsDir } from './b2-lib.ts';
import { isStaleTemp } from './backup-r2-run-lib.ts';
import { capacity, emptyStatus, freshness, logLine, objectKey, recordFailure, recordSuccess, shouldRun, type Status } from './backup-run-lib.ts';
import { ask } from './prompt.ts';

const args = process.argv.slice(2), flag = (n: string) => args.includes(n), opt = (n: string) => args[args.indexOf(n) + 1];
const source = opt('--source') ?? (flag('--status') ? 'production' : '');
// state is kept per source so a staging or synthetic run can never make the production run skip itself
const stateDir = join(process.env.LOCALAPPDATA ?? '.', source === 'production' || source === '' ? 'cakeopedia-backup' : 'cakeopedia-backup-' + source), statusFile = join(stateDir, 'status.json'), logFile = join(stateDir, 'backup.log');
mkdirSync(stateDir, { recursive: true });

const load = (): Status => { try { return { ...emptyStatus(), ...(JSON.parse(readFileSync(statusFile, 'utf8')) as Status) }; } catch { return emptyStatus(); } };
const save = (s: Status) => writeFileSync(statusFile, JSON.stringify(s, null, 1));
function log(fields: Record<string, string | number | boolean | null>) {
  try { if (existsSync(logFile) && statSync(logFile).size > 1_000_000) renameSync(logFile, logFile + '.1'); appendFileSync(logFile, logLine({ t: new Date().toISOString(), ...fields }) + '\n'); } catch { /* logging must never break a backup */ }
}
function notify(title: string, text: string) { // best-effort Windows balloon; the message carries no sensitive data
  if (process.platform !== 'win32') return;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Warning; $n.Visible = $true; $n.ShowBalloonTip(15000, $env:CK_T, $env:CK_M, 'Warning'); Start-Sleep -Seconds 16; $n.Dispose()"],
      { stdio: 'ignore', timeout: 30_000, windowsHide: true, env: { ...process.env, CK_T: title, CK_M: text } });
  } catch { /* no notification available */ }
}

// Optional heartbeat: a secret ping URL (for example a free healthchecks.io check) that emails the owner when a ping is MISSED, which covers the case the local
// notification cannot: the PC was off or the task never ran. Only the ping itself is sent: no data. Set once with: node scripts/backup-run.ts --set-healthcheck
const healthFile = join(secretsDir(), 'healthcheck.url');
async function ping(suffix: '' | '/start' | '/fail') {
  try { if (!existsSync(healthFile)) return; await fetch(readFileSync(healthFile, 'utf8').trim() + suffix, { redirect: 'manual', signal: AbortSignal.timeout(10_000) }); } catch { /* a failed ping must never fail a backup */ }
}
if (flag('--set-healthcheck')) {
  try {
    const url = await ask('Healthcheck ping URL (hidden): ', true);
    if (!/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._~\/-]{6,200}$/.test(url.trim())) throw new Error('That does not look like an https ping URL.');
    mkdirSync(secretsDir(), { recursive: true }); writeFileSync(healthFile, url.trim(), { mode: 0o600 });
    console.log('Saved (user-only secrets folder). The next backup run will ping it.');
  } catch (e) { console.error('STOPPED: ' + (e instanceof Error ? e.message : String(e))); process.exitCode = 1; }
  process.exit(process.exitCode ?? 0);
}
// Leftovers of an interrupted run (a plain dump or an encrypted blob) are removed after an hour.
for (const dir of [tmpdir(), stateDir]) { try { for (const n of readdirSync(dir)) { const p = join(dir, n); if (isStaleTemp(n, statSync(p).mtimeMs, Date.now())) rmSync(p, { recursive: true, force: true }); } } catch { /* best effort */ } }

if (flag('--status')) {
  const s = load(), now = Date.now(), c = capacity(s);
  console.log(`last success: ${s.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : 'never'}   freshness: ${freshness(s, now)}   consecutive failures: ${s.consecutiveFailures}`);
  console.log(`last object: ${s.lastObjectKey ?? 'none'}   largest recent backup: ${Math.max(0, ...s.recent.map((r) => r.bytes))} bytes   projected ${(c.projectedBytes / 1e9).toFixed(3)} GB of ${(c.capBytes / 1e9).toFixed(0)} GB over the retention window (${c.level})`);
  process.exit(freshness(s, now) === 'ok' && c.level === 'ok' ? 0 : 1);
}

const SOURCES: Record<string, { config: string; local: boolean }> = { production: { config: 'wrangler.production.jsonc', local: false }, staging: { config: 'wrangler.staging.jsonc', local: false }, local: { config: 'wrangler.local.jsonc', local: true } };
if (!SOURCES[source]) { console.error('Usage: node scripts/backup-run.ts --source production|staging|local [--force] | --status'); process.exit(2); }
const src = SOURCES[source]!;
const now = Date.now();
let status = load();
const stale = freshness(status, now) === 'stale';
const decision = shouldRun(status, now, flag('--force'));
if (!decision.run) { log({ evt: 'skipped', source, reason: decision.reason }); console.log(`Skipped: ${decision.reason}.`); process.exit(0); }

const tmp = join(stateDir, `run-${now}.ckbak`);
const step = (stage: string, argv: string[], script = 'scripts/backup.ts') => {
  try { execFileSync(process.execPath, [script, ...argv], { stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, WRANGLER_CONFIG: src.config }, timeout: 20 * 60_000 }); }
  catch (e) { const code = (e as { status?: number }).status ?? -1; throw Object.assign(new Error(stage), { stage, code }); }
};
await ping('/start');
try {
  step('export', ['export', tmp, ...(src.local ? ['--local'] : [])]);
  step('check', ['check', tmp]); // decrypt the encrypted file and load it into a scratch database before it leaves this machine
  const bytes = statSync(tmp).size, key = objectKey(now, source);
  step('upload', ['upload', tmp, key]); // the signed payload hash makes Backblaze reject a corrupted upload
  status = recordSuccess(status, now, key, bytes);
  save(status);
  log({ evt: 'backup', ok: true, source, key, bytes });
  console.log(`Backup OK: ${key} (${bytes} encrypted bytes).`);
  const c = capacity(status);
  if (c.level !== 'ok') { log({ evt: 'capacity', level: c.level, projectedGB: +(c.projectedBytes / 1e9).toFixed(2) }); notify('Cakeopedia backup storage', `Projected backup storage is ${(c.fraction * 100).toFixed(0)}% of the free 10 GB over 70 days (${c.level}). Review it.`); }
  if (stale) log({ evt: 'recovered', reason: 'a missed run was caught up' });
  process.exitCode = c.level === 'critical' ? 1 : 0;
  if (!src.local) { // extras that are not in the database dump; each failure is reported on its own and the database backup above stands
    for (const [stage, script, what] of [['ledger', 'scripts/backup-ledger.ts', 'the erasure ledger (needed to re-apply erasures after a restore)'], ['r2', 'scripts/backup-r2.ts', 'customer pictures']] as const) {
      try { step(stage, ['--source', source], script); log({ evt: stage, ok: true, source }); }
      catch (e2) { log({ evt: stage, ok: false, source, stage, code: (e2 as { code?: number }).code ?? -1 }); notify(`Cakeopedia ${stage} backup failed`, `The database backup worked but backing up ${what} failed. Run: node ${script} --source ${source}`); process.exitCode = 1; }
    }
  }
  await ping(process.exitCode ? '/fail' : '');
} catch (e) {
  const { stage = 'unknown', code = -1 } = e as { stage?: string; code?: number };
  status = recordFailure(status, now); save(status);
  log({ evt: 'backup', ok: false, source, stage, code, failures: status.consecutiveFailures });
  console.error(`Backup FAILED at stage "${stage}" (exit ${code}). No details are printed here: run the stage by hand to see them.`);
  notify('Cakeopedia backup failed', `Stage "${stage}" failed (${status.consecutiveFailures} in a row). Open the backup log folder or run: node scripts/backup-run.ts --status`);
  process.exitCode = 1;
  await ping('/fail');
} finally { rmSync(tmp, { force: true }); }
