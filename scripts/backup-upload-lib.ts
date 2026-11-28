import { createHash, createHmac } from 'node:crypto';

// S3-compatible upload (AWS Signature V4) for already-ENCRYPTED backup blobs. Pure and injectable: nothing here reads credentials,
// touches the network on import, or knows which provider is used. The caller passes the endpoint, bucket and keys.
const sha256 = (d: string | Uint8Array) => createHash('sha256').update(d).digest('hex');
const hmac = (k: string | Buffer, d: string) => createHmac('sha256', k).update(d).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export interface SignInput { method: string; url: string; headers?: Record<string, string>; payloadSha256: string; region: string; accessKeyId: string; secretAccessKey: string; amzDate: string }

/** Returns the headers to send (including Authorization). amzDate is `YYYYMMDDTHHMMSSZ`. */
export function signV4(i: SignInput): Record<string, string> {
  const u = new URL(i.url), day = i.amzDate.slice(0, 8), scope = `${day}/${i.region}/s3/aws4_request`;
  const h: Record<string, string> = { ...Object.fromEntries(Object.entries(i.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])), host: u.host, 'x-amz-content-sha256': i.payloadSha256, 'x-amz-date': i.amzDate };
  const names = Object.keys(h).sort(), signed = names.join(';');
  const query = [...u.searchParams].map(([k, v]) => [enc(k), enc(v)] as const).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const path = u.pathname.split('/').map((s) => enc(decodeURIComponent(s))).join('/') || '/';
  const canonical = [i.method, path, query, names.map((n) => `${n}:${h[n]}\n`).join(''), signed, i.payloadSha256].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', i.amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + i.secretAccessKey, day), i.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...h, Authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}` };
}

export interface UploadTarget { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string }
const amz = (now: number) => new Date(now).toISOString().replace(/[-:]|\.\d{3}/g, '');

/** PUT one object (path-style URL). Throws on any non-2xx so a scheduler can never mistake a failed upload for a backup. Never logs the body or keys. */
export async function putObject(t: UploadTarget, key: string, body: Uint8Array, now: number, fetchImpl: typeof fetch = fetch): Promise<{ etag: string | null }> {
  if (!/^[A-Za-z0-9._\/-]{1,200}$/.test(key) || key.includes('..')) throw new Error('Unsafe object key.');
  const url = `${t.endpoint.replace(/\/$/, '')}/${t.bucket}/${key}`;
  const headers = signV4({ method: 'PUT', url, headers: { 'content-type': 'application/octet-stream' }, payloadSha256: sha256(body), region: t.region, accessKeyId: t.accessKeyId, secretAccessKey: t.secretAccessKey, amzDate: amz(now) });
  const res = await fetchImpl(url, { method: 'PUT', headers, body: new Blob([body as BlobPart]), redirect: 'manual', signal: AbortSignal.timeout(120_000) });
  if (res.status < 200 || res.status >= 300) throw new Error(`Backup upload failed with HTTP ${res.status}.`);
  return { etag: res.headers.get('etag') };
}
