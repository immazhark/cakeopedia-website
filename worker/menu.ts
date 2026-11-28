import { approvedMenuExport, editMenuItem } from '../src/data/menu-editor.ts';
import { parseMenu, type MenuItem } from '../src/data/menu.ts';
import { out, readBounded, type AdminDb } from './admin-common.ts';

// Owner menu persistence. Validation and revision rules live in src/data/menu-editor.ts; this adds the atomic write.
const idRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const strip = ({ revision: _r, updatedAt: _u, ...rest }: MenuItem) => JSON.stringify(rest);

export async function routeMenu(request: Request, db: AdminDb, now: () => number, url: URL): Promise<Response | null> {
  const p = url.pathname, m = request.method;
  if (p === '/admin/api/menu' && m === 'GET') {
    const { results } = await db.prepare('SELECT data_json AS d FROM menu_items ORDER BY id LIMIT 1000').all<{ d: string }>();
    return out(200, { items: results.map((r) => JSON.parse(r.d)) });
  }
  if (p === '/admin/api/menu/export' && m === 'GET') { // what may be committed to the public site: published and available only
    const { results } = await db.prepare('SELECT data_json AS d FROM menu_items ORDER BY id LIMIT 1000').all<{ d: string }>();
    return out(200, { items: approvedMenuExport(results.map((r) => JSON.parse(r.d))) });
  }
  const h = p.match(/^\/admin\/api\/menu\/([^/]+)\/history$/);
  if (h && m === 'GET') { // newest first; includes the current revision once it has been saved at least once
    if (!idRe.test(h[1]!) || h[1]!.length > 80) return out(404, { error: 'not_found' });
    const { results } = await db.prepare('SELECT data_json AS d FROM menu_history WHERE id = ? ORDER BY revision DESC LIMIT 50').bind(h[1]!).all<{ d: string }>();
    return out(200, { versions: results.map((r) => JSON.parse(r.d)) });
  }
  const r = p.match(/^\/admin\/api\/menu\/([^/]+)$/);
  if (!r) return null;
  const id = r[1]!;
  if (!idRe.test(id) || id.length > 80) return out(404, { error: 'not_found' });
  if (m !== 'PUT') return new Response(null, { status: 405 });
  let b: unknown;
  try { const raw = await readBounded(request, 65_536); if (raw === null) return out(413, { error: 'too_large' }); b = JSON.parse(raw); } catch { return out(400, { error: 'invalid_input' }); }
  const body = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
  const expected = body.expectedRevision ?? null;
  if (expected !== null && (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 1)) return out(400, { error: 'invalid_input' });
  const row = await db.prepare('SELECT data_json AS d FROM menu_items WHERE id = ?').bind(id).first<{ d: string }>();
  const current = row ? parseMenu([JSON.parse(row.d)])[0]! : null;
  let next: MenuItem;
  try {
    if (!body.item || typeof body.item !== 'object' || (body.item as { id?: unknown }).id !== id) throw Error('Invalid menu edit');
    next = editMenuItem(current, expected as number | null, body.item, new Date(now()).toISOString());
  } catch (e) {
    if (e instanceof Error && e.message === 'Menu revision conflict') {
      // Lost response: the same edit already applied one revision ago, so answer success instead of a confusing conflict.
      try {
        if (current && expected === current.revision - 1 && strip(editMenuItem({ ...current, revision: current.revision - 1 }, expected, body.item, current.updatedAt)) === strip(current)) return out(200, { revision: current.revision, replay: true });
      } catch { /* not a replay */ }
      return out(409, { error: 'menu_changed', currentRevision: current?.revision ?? null });
    }
    return out(400, { error: 'invalid_input' });
  }
  const data = JSON.stringify(next);
  // Compare-and-set in the statement itself: only the expected revision can be replaced; a new id can only be created once.
  const sql = current
    ? 'UPDATE menu_items SET revision = ?, updated_at = ?, data_json = ? WHERE id = ? AND revision = ? RETURNING revision'
    : 'INSERT INTO menu_items (revision, updated_at, data_json, id) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING revision';
  const args = current ? [next.revision, next.updatedAt, data, id, current.revision] : [next.revision, next.updatedAt, data, id];
  const [res] = await db.batch([
    db.prepare(sql).bind(...args),
    db.prepare('INSERT OR IGNORE INTO menu_history (id, revision, at, data_json) SELECT id, revision, updated_at, data_json FROM menu_items WHERE id = ? AND revision = ?').bind(id, next.revision),
  ]) as { results: { revision: number }[] }[];
  const won = res?.results[0];
  return won ? out(current ? 200 : 201, { revision: next.revision }) : out(409, { error: 'menu_changed' });
}
