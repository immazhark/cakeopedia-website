import { defaultCatalogue, parseCatalogue } from '../src/data/catalogue.ts';
import { changed, out, readBounded, type AdminDb } from './admin-common.ts';

// Owner catalogue: edit draft -> publish (append-only snapshot) -> optional rollback. Every transition is one conditional statement,
// so concurrent owners or retries cannot publish a half-edited or stale draft.
const MAX_BODY = 65_536;
async function read(request: Request): Promise<Record<string, unknown> | null | 'too_large'> {
  try {
    const raw = await readBounded(request, MAX_BODY); if (raw === null) return 'too_large';
    const b = JSON.parse(raw); return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
  } catch { return null; }
}
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;
const latest = (db: AdminDb) => db.prepare('SELECT version, published_at AS publishedAt, source FROM catalogue_published ORDER BY version DESC LIMIT 1').first<{ version: number; publishedAt: string; source: string }>();

export async function routeCatalogue(request: Request, db: AdminDb, actor: string, now: () => number, url: URL, rebuild?: () => Promise<boolean>): Promise<Response | null> {
  const p = url.pathname, m = request.method;
  if (p === '/admin/api/catalogue' && m === 'GET') {
    const d = await db.prepare('SELECT revision, updated_at AS updatedAt, data_json AS d FROM catalogue_draft WHERE id = 1').first<{ revision: number; updatedAt: string; d: string }>();
    return out(200, { draft: d ? { revision: d.revision, updatedAt: d.updatedAt, catalogue: JSON.parse(d.d) } : { revision: 0, updatedAt: null, catalogue: defaultCatalogue }, published: await latest(db) });
  }
  if (p === '/admin/api/catalogue' && m === 'PUT') {
    const b = await read(request); if (b === 'too_large') return out(413, { error: 'too_large' });
    if (!b || !Number.isInteger(b.expectedRevision) || (b.expectedRevision as number) < 0) return out(400, { error: 'invalid_input' });
    let data: string; try { data = JSON.stringify(parseCatalogue(b.catalogue)); } catch { return out(400, { error: 'invalid_input' }); }
    const expected = b.expectedRevision as number, at = new Date(now()).toISOString();
    const res = expected === 0
      ? await db.prepare('INSERT INTO catalogue_draft (id, revision, updated_at, data_json) VALUES (1, 1, ?, ?) ON CONFLICT(id) DO NOTHING').bind(at, data).run()
      : await db.prepare('UPDATE catalogue_draft SET revision = revision + 1, updated_at = ?, data_json = ? WHERE id = 1 AND revision = ?').bind(at, data, expected).run();
    return changed(res) ? out(200, { revision: expected + 1 }) : out(409, { error: 'catalogue_changed' });
  }
  const publish = p === '/admin/api/catalogue/publish', rollback = p === '/admin/api/catalogue/rollback';
  if ((publish || rollback) && m === 'POST') {
    const b = await read(request); if (b === 'too_large') return out(413, { error: 'too_large' }); if (!b) return out(400, { error: 'invalid_input' });
    const at = new Date(now()).toISOString();
    let res: unknown;
    if (publish) { // only the exact draft revision the owner previewed; re-validated here so a corrupt draft can never go public
      if (!positive(b.expectedRevision)) return out(400, { error: 'invalid_input' });
      const d = await db.prepare('SELECT data_json AS d FROM catalogue_draft WHERE id = 1 AND revision = ?').bind(b.expectedRevision).first<{ d: string }>();
      if (!d) return out(409, { error: 'catalogue_changed' });
      try { parseCatalogue(JSON.parse(d.d)); } catch { return out(422, { error: 'draft_invalid' }); }
      res = await db.prepare(`INSERT INTO catalogue_published (version, published_at, actor, source, from_version, data_json)
        SELECT COALESCE((SELECT max(version) FROM catalogue_published), 0) + 1, ?1, ?2, 'publish', NULL, data_json FROM catalogue_draft WHERE id = 1 AND revision = ?3`).bind(at, actor, b.expectedRevision).run().catch(() => null);
    } else {
      if (!positive(b.version) || !positive(b.expectedCurrent)) return out(400, { error: 'invalid_input' });
      res = await db.prepare(`INSERT INTO catalogue_published (version, published_at, actor, source, from_version, data_json)
        SELECT ?4 + 1, ?1, ?2, 'rollback', version, data_json FROM catalogue_published WHERE version = ?3
          AND (SELECT max(version) FROM catalogue_published) = ?4 AND version <> ?4`).bind(at, actor, b.version, b.expectedCurrent).run().catch(() => null);
    }
    if (!changed(res)) return out(409, { error: 'catalogue_changed' }); // stale revision, version race (PK) or unknown version
    const current = await latest(db);
    return out(200, { version: current?.version, rebuild: rebuild ? ((await rebuild().catch(() => false)) ? 'requested' : 'failed') : 'not_configured' });
  }
  if (p === '/admin/api/catalogue/history' && m === 'GET') {
    const { results } = await db.prepare('SELECT version, published_at AS publishedAt, actor, source, from_version AS fromVersion FROM catalogue_published ORDER BY version DESC LIMIT 50').all();
    return out(200, { versions: results });
  }
  return null;
}

/** GET /api/catalogue: the latest published snapshot only. Public by design; the draft is never reachable from here. */
export async function handlePublicCatalogue(request: Request, db: AdminDb): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const row = await db.prepare('SELECT version, published_at AS publishedAt, data_json AS d FROM catalogue_published ORDER BY version DESC LIMIT 1').first<{ version: number; publishedAt: string; d: string }>();
  if (!row) return Response.json({ error: 'not_published' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return Response.json({ version: row.version, publishedAt: row.publishedAt, catalogue: JSON.parse(row.d) }, { headers: { 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' } });
}
