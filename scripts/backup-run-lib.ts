// Pure logic for the unattended backup run: when to run, what to record, capacity projection and a log line that cannot carry sensitive data.
export const RETENTION_DAYS = 70; // lifecycle: hidden after 35 days, deleted 35 days after hiding (versions are recoverable in between)
export const FREE_CAP_BYTES = 10_000_000_000; // Backblaze free storage; spending caps are $0 so going over fails uploads, never bills

export interface Status { lastAttemptAt: number | null; lastSuccessAt: number | null; lastObjectKey: string | null; consecutiveFailures: number; recent: { day: string; bytes: number }[] }
export const emptyStatus = (): Status => ({ lastAttemptAt: null, lastSuccessAt: null, lastObjectKey: null, consecutiveFailures: 0, recent: [] });

const HOUR = 3_600_000;
export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** A run is skipped if a backup succeeded recently (so a catch-up start after a missed schedule, or a double trigger, does not upload twice). */
export function shouldRun(s: Status, now: number, force: boolean, minHours = 20): { run: boolean; reason: string } {
  if (force) return { run: true, reason: 'forced' };
  if (s.lastSuccessAt === null) return { run: true, reason: 'no backup has ever succeeded' };
  const age = now - s.lastSuccessAt;
  return age >= minHours * HOUR ? { run: true, reason: `last success was ${Math.floor(age / HOUR)} h ago` } : { run: false, reason: `last success was ${Math.floor(age / HOUR)} h ago (under ${minHours} h)` };
}

export function recordSuccess(s: Status, now: number, key: string, bytes: number): Status {
  const day = dayOf(now), recent = [...s.recent.filter((r) => r.day !== day), { day, bytes }].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(-(RETENTION_DAYS + 10));
  return { lastAttemptAt: now, lastSuccessAt: now, lastObjectKey: key, consecutiveFailures: 0, recent };
}
export const recordFailure = (s: Status, now: number): Status => ({ ...s, lastAttemptAt: now, consecutiveFailures: s.consecutiveFailures + 1 });

export type Health = 'ok' | 'stale' | 'never';
/** 'stale' means no success within maxHours: the daily job missed at least one run and did not recover. */
export function freshness(s: Status, now: number, maxHours = 36): Health {
  if (s.lastSuccessAt === null) return 'never';
  return now - s.lastSuccessAt > maxHours * HOUR ? 'stale' : 'ok';
}

export interface Capacity { projectedBytes: number; capBytes: number; fraction: number; level: 'ok' | 'warn' | 'critical' }
/** Worst case: the largest recent backup, once per day, for the whole retention window. Warn at 50% of the free cap, critical at 80%. */
export function capacity(s: Status, retentionDays = RETENTION_DAYS, capBytes = FREE_CAP_BYTES): Capacity {
  const largest = s.recent.reduce((m, r) => Math.max(m, r.bytes), 0), projected = largest * retentionDays, fraction = projected / capBytes;
  return { projectedBytes: projected, capBytes, fraction, level: fraction >= 0.8 ? 'critical' : fraction >= 0.5 ? 'warn' : 'ok' };
}

export const objectKey = (now: number, source: string) => `backups/d1/${source}/${dayOf(now)}.ckbak`;

/** One JSON log line. Only whitelisted keys with scalar values are kept, strings are truncated and stripped of control characters: no free text from tools. */
const ALLOWED = new Set(['t', 'evt', 'source', 'stage', 'ok', 'bytes', 'key', 'code', 'reason', 'failures', 'level', 'projectedGB']);
export function logLine(fields: Record<string, string | number | boolean | null>): string {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(fields)) if (ALLOWED.has(k)) out[k] = typeof v === 'string' ? v.replace(/[^\x20-\x7e]/g, '').slice(0, 120) : v;
  return JSON.stringify(out);
}
