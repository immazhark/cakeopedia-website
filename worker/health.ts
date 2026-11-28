import type { AdminDb } from './admin-common.ts';

// Privacy-safe operational health: counts, ages and table names only, never a row of customer data. Every query is bounded
// (aggregate over an index, or LIMIT 1 on the primary key).
export const EXPECTED_TABLES = ['enquiries', 'enquiry_references', 'notification_outbox', 'uploads', 'enquiry_events', 'quotes', 'payments', 'busy_dates',
  'notification_snapshots', 'request_rate_windows', 'menu_items', 'menu_history', 'catalogue_draft', 'catalogue_published', 'upload_sessions', 'communications', 'catalogue_rebuilds', 'maintenance_runs', 'erasure_ledger'];

export interface Health {
  oldestPendingOutboxAgeMs: number | null;
  oldestQueuedCommunicationAgeMs: number | null;
  failedCommunications: number;
  pendingUploadSessions: number;
  lastCatalogueRebuild: { version: number; status: string; attempts: number } | null;
  maintenance: { job: string; state: string; ageMs: number; failures: number; sinceOkMs: number | null }[];
  tablesPresent: number;
  missingTables: string[];
}

const age = (now: number, t: number | null | undefined) => (t == null ? null : Math.max(0, now - t));

export async function collectHealth(db: AdminDb, now: number): Promise<Health> {
  const one = async <T>(sql: string) => (await db.prepare(sql).first<T>()) ?? ({} as T);
  const outbox = await one<{ t: number | null }>("SELECT MIN(next_attempt_at) AS t FROM notification_outbox WHERE state = 'pending'"); // outbox_due(state, next_attempt_at)
  // shortcut: no index on communications(state); the table holds only owner-sent messages, add (state, created_at) if it grows large
  const q = await one<{ t: number | null }>("SELECT MIN(created_at) AS t FROM communications WHERE state = 'queued'");
  const failed = await one<{ n: number }>("SELECT COUNT(*) AS n FROM communications WHERE state = 'failed'");
  const sessions = await one<{ n: number }>('SELECT COUNT(*) AS n FROM upload_sessions'); // purged daily, so small
  const rebuild = await one<{ version: number; status: string; attempts: number } | undefined>('SELECT version, status, attempts FROM catalogue_rebuilds ORDER BY version DESC LIMIT 1');
  const jobs = (await db.prepare('SELECT job, last_state AS state, last_run_at AS at, last_ok_at AS ok, failures FROM maintenance_runs ORDER BY job LIMIT 12').all<{ job: string; state: string; at: number; ok: number | null; failures: number }>()).results;
  const names = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>()).results.map((r) => r.name);
  const missingTables = EXPECTED_TABLES.filter((t) => !names.includes(t));
  return {
    oldestPendingOutboxAgeMs: age(now, outbox.t), oldestQueuedCommunicationAgeMs: age(now, q.t),
    failedCommunications: Number(failed.n ?? 0), pendingUploadSessions: Number(sessions.n ?? 0),
    lastCatalogueRebuild: rebuild?.version == null ? null : { version: rebuild.version, status: rebuild.status, attempts: rebuild.attempts },
    maintenance: jobs.map((j) => ({ job: j.job, state: j.state, ageMs: Math.max(0, now - j.at), failures: j.failures, sinceOkMs: j.ok == null ? null : Math.max(0, now - j.ok) })),
    tablesPresent: EXPECTED_TABLES.length - missingTables.length, missingTables,
  };
}

export interface StorageBucket { list(o: { cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }> }
export interface StorageReport { ok: boolean; bucketObjects: number; trackedRows: number; missingInBucket: number; tombstonedStillInBucket: number; untrackedInBucket: number; sample: { missing: string[]; tombstoned: string[]; untracked: string[] } }

/** Compares the private bucket with the uploads table. Keys are random object names, never customer data; at most 5 per category are returned.
 *  Bounded: 20 pages of 1000 objects and 50,000 rows; if either bound is hit the report throws rather than claiming a clean result. */
export async function reconcileStorage(db: AdminDb, bucket: StorageBucket, maxPages = 20): Promise<StorageReport> {
  const keys = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; ; page++) {
    if (page >= maxPages) throw new Error('storage_listing_incomplete');
    const r = await bucket.list(cursor === undefined ? { limit: 1000 } : { limit: 1000, cursor });
    for (const o of r.objects) keys.add(o.key);
    if (!r.truncated || !r.cursor) break;
    cursor = r.cursor;
  }
  const { results } = await db.prepare('SELECT object_key AS k, deleted_at IS NOT NULL AS gone, ready_at IS NOT NULL AS ready FROM uploads LIMIT 50001').all<{ k: string; gone: number; ready: number }>();
  if (results.length > 50_000) throw new Error('storage_rows_incomplete');
  const rows = new Map(results.map((r) => [r.k, r]));
  const missing = results.filter((r) => !r.gone && r.ready && !keys.has(r.k)).map((r) => r.k);
  const tombstoned = results.filter((r) => r.gone && keys.has(r.k)).map((r) => r.k);
  const untracked = [...keys].filter((k) => !rows.has(k));
  return { ok: !missing.length && !tombstoned.length && !untracked.length, bucketObjects: keys.size, trackedRows: results.length,
    missingInBucket: missing.length, tombstonedStillInBucket: tombstoned.length, untrackedInBucket: untracked.length,
    sample: { missing: missing.slice(0, 5), tombstoned: tombstoned.slice(0, 5), untracked: untracked.slice(0, 5) } };
}

export type JobState = 'completed' | 'partial' | 'failed';
/** Stores the latest outcome of a scheduled job. A failure also writes one structured, privacy-safe log line (job name only). */
export async function recordMaintenance(db: AdminDb, job: string, state: JobState, now: number): Promise<void> {
  if (state === 'failed') console.error(JSON.stringify({ evt: 'maintenance_failed', job }));
  try {
    await db.prepare(`INSERT INTO maintenance_runs (job, last_run_at, last_state, last_ok_at, failures) VALUES (?1, ?2, ?3, CASE WHEN ?3 = 'completed' THEN ?2 END, CASE WHEN ?3 = 'completed' THEN 0 ELSE 1 END)
      ON CONFLICT(job) DO UPDATE SET last_run_at = ?2, last_state = ?3, last_ok_at = CASE WHEN ?3 = 'completed' THEN ?2 ELSE last_ok_at END, failures = CASE WHEN ?3 = 'completed' THEN 0 ELSE failures + 1 END`).bind(job, now, state).run();
  } catch { console.error(JSON.stringify({ evt: 'maintenance_record_failed', job })); }
}
