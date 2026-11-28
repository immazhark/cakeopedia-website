// Retention-consistency audit: every picture referenced by a RETAINED database backup must be recoverable (or be one that was erased since).
//   node scripts/backup-audit.ts --source staging|production        (needs the reader key: b2-reader-import.ts, and the DPAPI passphrase)
// Version-aware: it lists ALL versions (including hidden ones, which stay recoverable by version id until the lifecycle rule deletes them). For each retained
// snapshot under backups/d1/<source>/ it restores into a scratch in-memory database, lists the attached pictures and checks that a picture backup exists
// under backups/r2/<source>/. A picture that is still live and has NO backup is a FAILURE; one erased since (gone or deleted live) is expected to lose its
// backup to the lifecycle rule and is reported as info. Prints counts and short ids only, never keys or content.
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { credsPath, loadCreds, s3 } from './b2-lib.ts';
import { decryptBackup } from './backup-lib.ts';
import { classifySnapshot } from './backup-r2-run-lib.ts';
import { readPassphrase } from './backup-secret.ts';

const source = process.argv[process.argv.indexOf('--source') + 1] ?? '';
const CONFIG: Record<string, string> = { production: 'wrangler.production.jsonc', staging: 'wrangler.staging.jsonc' };
if (!CONFIG[source]) { console.error('Usage: node scripts/backup-audit.ts --source staging|production'); process.exit(2); }
const reader = loadCreds(credsPath('reader')), passphrase = readPassphrase() ?? (console.error('No backup passphrase stored.'), process.exit(1));
const text = (b: Uint8Array) => Buffer.from(b).toString('utf8');

interface Ver { versionId: string; hidden: boolean }
/** Newest real (non-marker) version of every key under the prefix; `hidden` when the newest entry is a delete marker (still recoverable by version id). */
async function listVersions(prefix: string): Promise<Map<string, Ver>> {
  const out = new Map<string, Ver>(), hiddenNow = new Set<string>(); let keyMarker = '', versionMarker = '';
  for (let page = 0; page < 100; page++) {
    const r = await s3(reader, 'GET', '', { query: `versions&prefix=${encodeURIComponent(prefix)}${keyMarker ? '&key-marker=' + encodeURIComponent(keyMarker) + '&version-id-marker=' + encodeURIComponent(versionMarker) : ''}` });
    if (r.status !== 200) throw new Error(`version listing failed (HTTP ${r.status})`);
    const xml = text(r.body);
    for (const block of xml.match(/<(Version|DeleteMarker)>[\s\S]*?<\/\1>/g) ?? []) {
      const key = /<Key>([^<]+)<\/Key>/.exec(block)?.[1], id = /<VersionId>([^<]+)<\/VersionId>/.exec(block)?.[1];
      if (!key || !id) continue;
      if (block.startsWith('<DeleteMarker>')) { if (/<IsLatest>true<\/IsLatest>/.test(block)) hiddenNow.add(key); }
      else if (!out.has(key)) out.set(key, { versionId: id, hidden: false });
    }
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) break;
    keyMarker = /<NextKeyMarker>([^<]*)<\/NextKeyMarker>/.exec(xml)?.[1] ?? ''; versionMarker = /<NextVersionIdMarker>([^<]*)<\/NextVersionIdMarker>/.exec(xml)?.[1] ?? '';
    if (!keyMarker) break;
  }
  for (const k of hiddenNow) { const v = out.get(k); if (v) v.hidden = true; }
  return out;
}

const live = new Map<string, number | null>(); // object key -> deleted_at (null = still attached and live)
{
  const o = execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--remote', '--json', '--config', CONFIG[source]!, '--command', 'SELECT object_key AS k, deleted_at AS d FROM uploads WHERE enquiry_id IS NOT NULL'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 20_000_000 });
  for (const r of (JSON.parse(o.slice(o.indexOf('['))) as { results: { k: string; d: number | null }[] }[])[0]!.results) live.set(r.k, r.d);
}
let bad = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) bad++; };

const snapshots = await listVersions(`backups/d1/${source}/`);
const pictureVersions = await listVersions(`backups/r2/${source}/`);
const pictures = new Set([...pictureVersions.keys()].map((k) => k.slice(`backups/r2/${source}/`.length).replace(/\.ckbak$/, '')));
const hiddenPics = [...pictureVersions.values()].filter((v) => v.hidden).length, hiddenSnaps = [...snapshots.values()].filter((v) => v.hidden).length;
console.log(`${snapshots.size} retained database snapshot(s) (${hiddenSnaps} hidden, recoverable by version id); ${pictures.size} picture backup(s) (${hiddenPics} hidden)`);
for (const [snap, ver] of [...snapshots].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const got = await s3(reader, 'GET', snap, { query: `versionId=${encodeURIComponent(ver.versionId)}` });
  if (got.status !== 200) { check(false, `snapshot ${snap.slice(-16)} could not be downloaded (${got.status})`); continue; }
  const db = new DatabaseSync(':memory:'); db.exec(decryptBackup(Buffer.from(got.body), passphrase).toString('utf8'));
  const attached = (db.prepare('SELECT object_key AS k, deleted_at AS d FROM uploads WHERE enquiry_id IS NOT NULL AND ready_at IS NOT NULL').all() as { k: string; d: number | null }[]).filter((r) => r.d === null);
  const { covered, erasedSince, missingLive } = classifySnapshot(attached, live, pictures);
  check(missingLive.length === 0, `snapshot ${snap.slice(-16)}${ver.hidden ? ' (hidden)' : ''}: ${attached.length} attached picture(s): ${covered.length} recoverable, ${erasedSince.length} erased since (backup may expire: expected), ${missingLive.length} live picture(s) WITHOUT a backup`);
}
console.log(bad ? `\n${bad} inconsistency(ies) found` : '\nRetention consistent: every picture referenced by a retained snapshot that is still live has a backup (hidden versions included); erased ones are left to expire');
process.exitCode = bad ? 1 : 0;
