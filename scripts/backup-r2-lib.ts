import { createHash } from 'node:crypto';
import { decryptBackup, encryptBackup } from './backup-lib.ts';

// Encrypted manifest of the private uploads bucket (key, size, etag; no object bytes) and a reconciliation against D1. Pure: the bucket
// is an injected client, nothing here touches the network. Object keys can name customers' uploads, so the manifest is encrypted too.
export interface R2Entry { key: string; size: number; etag: string }
export interface R2ListClient { list(opts: { cursor?: string | undefined }): Promise<{ objects: R2Entry[]; cursor?: string | undefined }> }
export interface Manifest { version: 1; createdAt: number; entries: R2Entry[]; sha256: string }

const digest = (entries: R2Entry[]) => createHash('sha256').update(JSON.stringify(entries)).digest('hex');

export async function buildManifest(client: R2ListClient, now: number, maxPages = 1000): Promise<Manifest> {
  const all = new Map<string, R2Entry>();
  let cursor: string | undefined;
  for (let i = 0; ; i++) {
    if (i >= maxPages) throw new Error('R2 listing did not finish within the page limit.');
    const page = await client.list(cursor === undefined ? {} : { cursor });
    for (const o of page.objects) all.set(o.key, { key: o.key, size: o.size, etag: o.etag });
    if (!page.cursor) break;
    cursor = page.cursor;
  }
  const entries = [...all.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  return { version: 1, createdAt: now, entries, sha256: digest(entries) };
}

export const encryptManifest = (m: Manifest, passphrase: string): Buffer => encryptBackup(Buffer.from(JSON.stringify(m)), passphrase);

export function decryptManifest(blob: Uint8Array, passphrase: string): Manifest {
  const m = JSON.parse(decryptBackup(blob, passphrase).toString('utf8')) as Manifest;
  if (m.version !== 1 || !Array.isArray(m.entries) || m.sha256 !== digest(m.entries)) throw new Error('Manifest integrity check failed.');
  return m;
}

/** A row of D1 `uploads` (deleted_at/ready_at are epoch ms or null) with the owning enquiry's erased flag. */
export interface UploadRow { object_key: string; bytes: number; enquiry_id: string | null; deleted_at: number | null; ready_at: number | null }
export interface Reconciliation {
  erasedStillInBucket: string[]; // erased or deleted enquiry's object still listed: delete it (and again after any restore)
  missingInBucket: string[];     // live D1 row, no object: data loss or an incomplete restore
  sizeMismatch: string[];
  untracked: string[];           // object with no D1 row at all
  ok: boolean;
}

export function reconcile(m: Manifest, rows: UploadRow[], erasedEnquiryIds: ReadonlySet<string>): Reconciliation {
  const inBucket = new Map(m.entries.map((e) => [e.key, e]));
  const byKey = new Map(rows.map((r) => [r.object_key, r]));
  const isGone = (r: UploadRow) => r.deleted_at !== null || (r.enquiry_id !== null && erasedEnquiryIds.has(r.enquiry_id));
  const out: Reconciliation = { erasedStillInBucket: [], missingInBucket: [], sizeMismatch: [], untracked: [], ok: true };
  for (const e of m.entries) {
    const r = byKey.get(e.key);
    if (!r) out.untracked.push(e.key);
    else if (isGone(r)) out.erasedStillInBucket.push(e.key);
    else if (r.bytes !== e.size) out.sizeMismatch.push(e.key);
  }
  for (const r of rows) if (!isGone(r) && r.ready_at !== null && !inBucket.has(r.object_key)) out.missingInBucket.push(r.object_key);
  out.ok = !(out.erasedStillInBucket.length || out.missingInBucket.length || out.sizeMismatch.length || out.untracked.length);
  return out;
}
