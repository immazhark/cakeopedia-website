// Pure logic for the incremental backup of private R2 customer pictures. Each picture is backed up when new and refreshed every REFRESH_DAYS while still attached, encrypted like the database
// backup, under backups/r2/<source>/<object key>.ckbak. Erased pictures are not touched: their backups expire with the 70-day lifecycle rule.
export interface UploadRow { k: string; b: number }
export const SAFE_KEY = /^[A-Za-z0-9._/-]{1,200}$/;
export const isSafeKey = (k: unknown): k is string => typeof k === 'string' && SAFE_KEY.test(k) && !k.includes('..') && !k.startsWith('/');

/** `wrangler d1 execute --json` prints a JSON array of result sets; anything before the first "[" (banners) is ignored. */
export function parseRows(stdout: string): UploadRow[] {
  const start = stdout.indexOf('[');
  if (start < 0) throw new Error('No JSON in the D1 output.');
  const sets = JSON.parse(stdout.slice(start)) as { results?: { k?: unknown; b?: unknown }[] }[];
  const rows = sets[0]?.results;
  if (!Array.isArray(rows)) throw new Error('Unexpected D1 output shape.');
  return rows.filter((r): r is UploadRow => isSafeKey(r.k) && typeof r.b === 'number' && Number.isSafeInteger(r.b) && r.b > 0);
}

export interface R2State { done: Record<string, { bytes: number; at: number }> }
export const emptyR2State = (): R2State => ({ done: {} });

export const REFRESH_DAYS = 28; // the bucket lifecycle hides a backup 35 days after upload and deletes it 35 days later, so a picture that is still attached is re-uploaded before that
/** New pictures first (rows arrive ordered by creation), then still-attached pictures whose newest backup is older than REFRESH_DAYS (oldest first), capped per run. Erased pictures are not in the list, so their last backup simply expires. */
export function planR2(rows: UploadRow[], state: R2State, now: number, max = 40, refreshDays = REFRESH_DAYS): UploadRow[] {
  const fresh = rows.filter((r) => !(r.k in state.done));
  const due = rows.filter((r) => r.k in state.done && now - state.done[r.k]!.at >= refreshDays * 86_400_000).sort((a, b) => state.done[a.k]!.at - state.done[b.k]!.at);
  return [...fresh, ...due].slice(0, max);
}

/** Only trust a downloaded object whose size equals what the database recorded at upload time. */
export const sizeMatches = (row: UploadRow, downloaded: number) => downloaded === row.b;

export const backupKey = (source: string, k: string) => `backups/r2/${source}/${k}.ckbak`;

/** JSON with // comments (wrangler configs): returns the parsed object. */
export function parseJsonc(text: string): Record<string, unknown> {
  let out = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!, n = text[i + 1];
    if (quoted) { out += c; if (c.charCodeAt(0) === 92) out += text[++i] ?? ''; else if (c === '"') quoted = false; }
    else if (c === '"') { quoted = true; out += c; }
    else if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; }
    else out += c;
  }
  return JSON.parse(out) as Record<string, unknown>;
}

/** Temp artefacts of an interrupted run (a plain dump or an encrypted blob) older than an hour are removed at the start of the next run. */
export const isStaleTemp = (name: string, mtimeMs: number, now: number) => /^(ckbak-|run-\d+\.ckbak|r2tmp-)/.test(name) && now - mtimeMs > 3_600_000;

/** Retention audit for one retained database snapshot: each attached picture it references is either recoverable, erased since (its backup is allowed to expire), or a FAILURE (still live in the database but without a picture backup). */
export function classifySnapshot(attached: { k: string }[], live: Map<string, number | null>, pictures: Set<string>) {
  const covered = attached.filter((r) => pictures.has(r.k));
  const erasedSince = attached.filter((r) => !live.has(r.k) || live.get(r.k) !== null);
  const missingLive = attached.filter((r) => live.has(r.k) && live.get(r.k) === null && !pictures.has(r.k));
  return { covered, erasedSince, missingLive };
}
