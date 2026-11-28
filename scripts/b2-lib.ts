import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { signV4, type UploadTarget } from './backup-upload-lib.ts';

// Least-privilege Backblaze B2 keys for the encrypted backups. Pure definitions + local credential files; no network, no secrets here.
export const B2 = { bucketName: 'cakeopedia-austin-backups', bucketId: '48d2dd8d325d1cbeaa210217', endpoint: 'https://s3.us-east-005.backblazeb2.com', region: 'us-east-005', prefix: 'backups/' } as const;

export interface KeyRequest { keyName: string; capabilities: string[]; bucketIds: string[]; namePrefix?: string }
/** Writer: upload only, one bucket, one prefix. No read, list, delete, bucket, encryption, lifecycle or key capabilities. Reader: read and list only, one bucket. */
export function keyRequests(bucketId: string = B2.bucketId): { writer: KeyRequest; reader: KeyRequest } {
  return {
    writer: { keyName: 'cakeopedia-backup-writer', capabilities: ['writeFiles'], bucketIds: [bucketId], namePrefix: B2.prefix },
    reader: { keyName: 'cakeopedia-backup-reader', capabilities: ['listBuckets', 'listFiles', 'readFiles'], bucketIds: [bucketId] },
  };
}

export interface Creds extends UploadTarget { prefix: string }
const FIELDS = ['endpoint', 'region', 'bucket', 'accessKeyId', 'secretAccessKey'] as const;
export const secretsDir = () => join(process.env.LOCALAPPDATA ?? process.env.HOME ?? '.', 'cakeopedia-secrets');
export const credsPath = (role: 'writer' | 'reader') => join(secretsDir(), `b2-${role}.json`);

/** Writes a credential file readable only by the current user, outside the repository. Never logs the secret. */
export function saveCreds(path: string, c: Creds): void {
  mkdirSync(dirname(path), { recursive: true });
  try {
    if (process.platform === 'win32') execFileSync('icacls', [dirname(path), '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(OI)(CI)F`], { stdio: 'ignore' });
    else chmodSync(dirname(path), 0o700);
  } catch { throw new Error('Could not restrict the secrets folder to the current user; nothing was written.'); }
  writeFileSync(path, JSON.stringify(c), { mode: 0o600 });
}
export function loadCreds(path: string): Creds {
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>; } catch { throw new Error(`Credential file missing or unreadable: ${path}`); }
  for (const f of FIELDS) if (typeof raw[f] !== 'string' || raw[f] === '') throw new Error(`Credential file is missing "${f}".`);
  if (!(raw.endpoint as string).startsWith('https://')) throw new Error('Endpoint must be https.');
  return { endpoint: raw.endpoint as string, region: raw.region as string, bucket: raw.bucket as string, accessKeyId: raw.accessKeyId as string, secretAccessKey: raw.secretAccessKey as string, prefix: typeof raw.prefix === 'string' ? raw.prefix : '' };
}

/** One signed S3 request; returns the status and body, never throws on HTTP errors (the permission test needs the 403s). */
export async function s3(t: UploadTarget, method: 'GET' | 'PUT' | 'DELETE', key: string, opts: { body?: Uint8Array; query?: string } = {}, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<{ status: number; body: Uint8Array }> {
  const url = `${t.endpoint.replace(/\/$/, '')}/${t.bucket}${key ? '/' + key : ''}${opts.query ? '?' + opts.query : ''}`;
  const payload = opts.body ?? new Uint8Array(0);
  const headers = signV4({ method, url, headers: opts.body ? { 'content-type': 'application/octet-stream' } : {}, payloadSha256: createHash('sha256').update(payload).digest('hex'), region: t.region, accessKeyId: t.accessKeyId, secretAccessKey: t.secretAccessKey, amzDate: new Date(now).toISOString().replace(/[-:]|\.\d{3}/g, '') });
  const res = await fetchImpl(url, { method, headers, ...(opts.body ? { body: new Blob([opts.body as BlobPart]) } : {}), redirect: 'manual', signal: AbortSignal.timeout(60_000) });
  return { status: res.status, body: new Uint8Array(await res.arrayBuffer()) };
}
