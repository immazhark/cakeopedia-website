import { B2, keyRequests, type Creds, type KeyRequest } from './b2-lib.ts';

// Backblaze B2 Native API v4: strict response parsing and the key-setup flow, separated from the prompts so it can be tested against the documented
// response shapes. Schema sources: b2_authorize_account, b2_create_key, b2_list_keys, b2_delete_key (v4). Nothing here prints or stores a secret.
export const API = 'https://api.backblazeb2.com';

const obj = (v: unknown, path: string): Record<string, unknown> => { if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>; throw new Error(`Unexpected Backblaze response: "${path}" is missing or not an object.`); };
const str = (v: unknown, path: string): string => { if (typeof v === 'string' && v !== '') return v; throw new Error(`Unexpected Backblaze response: "${path}" is missing or not a string.`); };
const strs = (v: unknown, path: string): string[] => { if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[]; throw new Error(`Unexpected Backblaze response: "${path}" is missing or not a list of strings.`); };
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export interface Auth { accountId: string; token: string; apiUrl: string; s3ApiUrl: string; capabilities: string[] }
/** b2_authorize_account v4: capabilities are at apiInfo.storageApi.allowed.capabilities (NOT directly under storageApi). */
export function parseAuthorize(json: unknown): Auth {
  const root = obj(json, 'response');
  const storage = obj(obj(root.apiInfo, 'apiInfo').storageApi, 'apiInfo.storageApi');
  const allowed = obj(storage.allowed, 'apiInfo.storageApi.allowed');
  return { accountId: str(root.accountId, 'accountId'), token: str(root.authorizationToken, 'authorizationToken'), apiUrl: str(storage.apiUrl, 'apiInfo.storageApi.apiUrl'),
    s3ApiUrl: str(storage.s3ApiUrl, 'apiInfo.storageApi.s3ApiUrl'), capabilities: strs(allowed.capabilities, 'apiInfo.storageApi.allowed.capabilities') };
}

export interface KeyInfo { applicationKeyId: string; keyName: string; capabilities: string[]; bucketIds: string[]; namePrefix: string | null }
function keyInfo(v: unknown, path: string): KeyInfo {
  const k = obj(v, path);
  const buckets = k.bucketIds == null ? [] : strs(k.bucketIds, `${path}.bucketIds`);
  const prefix = k.namePrefix == null ? null : str(k.namePrefix, `${path}.namePrefix`);
  return { applicationKeyId: str(k.applicationKeyId, `${path}.applicationKeyId`), keyName: str(k.keyName, `${path}.keyName`), capabilities: strs(k.capabilities, `${path}.capabilities`), bucketIds: buckets, namePrefix: prefix };
}
export function parseKeyList(json: unknown): { keys: KeyInfo[]; next: string | null } {
  const root = obj(json, 'response');
  if (!Array.isArray(root.keys)) throw new Error('Unexpected Backblaze response: "keys" is missing or not a list.');
  return { keys: root.keys.map((k, i) => keyInfo(k, `keys[${i}]`)), next: typeof root.nextApplicationKeyId === 'string' ? root.nextApplicationKeyId : null };
}
/** b2_create_key v4 response, checked against what we asked for: any extra capability, bucket or prefix difference is an error. */
export function parseCreatedKey(json: unknown, want: KeyRequest): KeyInfo & { applicationKey: string } {
  const k = keyInfo(json, 'created key');
  const secret = str(obj(json, 'response').applicationKey, 'applicationKey');
  if (!same(k.capabilities, want.capabilities)) throw new Error(`Backblaze created "${want.keyName}" with different capabilities (${k.capabilities.join(', ')}). Delete that key in the dashboard and stop.`);
  if (!same(k.bucketIds, want.bucketIds)) throw new Error(`Backblaze created "${want.keyName}" with different bucket restrictions. Delete that key in the dashboard and stop.`);
  if ((k.namePrefix ?? null) !== (want.namePrefix ?? null)) throw new Error(`Backblaze created "${want.keyName}" with a different name prefix. Delete that key in the dashboard and stop.`);
  return { ...k, applicationKey: secret };
}

async function call(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const res = await fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new Error(`Backblaze refused ${new URL(url).pathname.split('/').pop()}: HTTP ${res.status} ${typeof body?.code === 'string' ? body.code : ''} ${typeof body?.message === 'string' ? body.message : ''}`.trim());
  return body;
}

export interface SetupInput { accountId: string; authKeyId: string; authKey: string; replaceStale: boolean }
export interface SetupDeps { fetchImpl: typeof fetch; save(role: 'writer' | 'reader', c: Creds): void; say(line: string): void }
/** Authorises, checks for existing same-named keys, creates the writer then the reader, saves each secret the moment it exists. */
export async function setupKeys(i: SetupInput, d: SetupDeps): Promise<void> {
  const auth = parseAuthorize(await call(d.fetchImpl, `${API}/b2api/v4/b2_authorize_account`, { headers: { Authorization: 'Basic ' + Buffer.from(`${i.authKeyId}:${i.authKey}`).toString('base64') } }));
  if (auth.accountId !== i.accountId) throw new Error('The account ID you typed does not match the authorising key.');
  for (const c of ['writeKeys', 'listKeys']) if (!auth.capabilities.includes(c)) throw new Error(`The authorising key lacks the "${c}" capability. Use the master application key.`);
  if (new URL(auth.s3ApiUrl).origin !== B2.endpoint) throw new Error(`The account's S3 endpoint is ${auth.s3ApiUrl}, not ${B2.endpoint}. Stop and tell the developer.`);
  const header = { Authorization: auth.token };

  const existing: KeyInfo[] = [];
  for (let start = ''; ;) {
    const page = parseKeyList(await call(d.fetchImpl, `${auth.apiUrl}/b2api/v4/b2_list_keys?accountId=${encodeURIComponent(auth.accountId)}&maxKeyCount=1000${start ? '&startApplicationKeyId=' + encodeURIComponent(start) : ''}`, { headers: header }));
    existing.push(...page.keys); if (!page.next) break; start = page.next;
  }
  const { writer, reader } = keyRequests();
  for (const want of [writer, reader]) {
    for (const k of existing.filter((e) => e.keyName === want.keyName)) {
      const exact = same(k.capabilities, want.capabilities) && same(k.bucketIds, want.bucketIds) && (k.namePrefix ?? null) === (want.namePrefix ?? null);
      if (!i.replaceStale) throw new Error(`A key named "${want.keyName}" already exists (${k.applicationKeyId}). Its secret cannot be shown again. If you created it in an earlier run of this script, run again with --replace-stale to delete and recreate it; otherwise delete it in the dashboard first.`);
      if (!exact) throw new Error(`"${want.keyName}" (${k.applicationKeyId}) exists with DIFFERENT permissions than this script creates, so it was not deleted. Review it in the dashboard.`);
      if (!auth.capabilities.includes('deleteKeys')) throw new Error('The authorising key lacks the "deleteKeys" capability needed to replace a stale key.');
      await call(d.fetchImpl, `${auth.apiUrl}/b2api/v4/b2_delete_key`, { method: 'POST', headers: { ...header, 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationKeyId: k.applicationKeyId }) });
      d.say(`Deleted stale key ${k.keyName} (${k.applicationKeyId}).`);
    }
  }
  for (const [role, want] of [['writer', writer], ['reader', reader]] as const) {
    const made = parseCreatedKey(await call(d.fetchImpl, `${auth.apiUrl}/b2api/v4/b2_create_key`, { method: 'POST', headers: { ...header, 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: auth.accountId, ...want }) }), want);
    d.save(role, { endpoint: B2.endpoint, region: B2.region, bucket: B2.bucketName, accessKeyId: made.applicationKeyId, secretAccessKey: made.applicationKey, prefix: role === 'writer' ? B2.prefix : '' });
    d.say(`${role} key created: ${made.applicationKeyId}  capabilities: ${made.capabilities.join(', ')}  bucket-restricted: ${made.bucketIds.length === 1}  prefix: ${made.namePrefix ?? 'none'}`);
  }
}
