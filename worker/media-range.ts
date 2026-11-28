// Static assets on Workers answer Range requests with the whole file and no Accept-Ranges header. iOS Safari will not play an MP4 without
// byte-range support, so /media/video/* is served through this helper: single-range 206 responses, 416 for unsatisfiable ranges.
// shortcut: reads the whole clip into memory (check-media caps clips at 1.5 MB); switch to streaming slices if clips ever grow past a few MB.
export interface AssetFetcher { fetch(request: Request): Promise<Response> }

export async function serveWithRanges(request: Request, assets: AssetFetcher): Promise<Response> {
  const res = await assets.fetch(new Request(request.url, { method: 'GET' })); // drop Range and conditional headers: slicing happens here
  if (res.status !== 200) return res;
  const bytes = new Uint8Array(await res.arrayBuffer()), size = bytes.byteLength;
  const headers = new Headers(res.headers); headers.set('Accept-Ranges', 'bytes'); headers.delete('Content-Encoding');
  const head = request.method === 'HEAD';
  const full = () => { headers.set('Content-Length', String(size)); return new Response(head ? null : bytes, { status: 200, headers }); };
  const m = /^bytes=(\d*)-(\d*)$/.exec((request.headers.get('Range') ?? '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return full(); // no Range, or one we do not understand (multi-range): the whole file is a valid answer
  let start: number, end: number;
  if (m[1] === '') { const n = Number(m[2]); start = Math.max(0, size - n); end = size - 1; if (n === 0) start = size; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`); headers.set('Content-Length', String(end - start + 1));
  return new Response(head ? null : bytes.slice(start, end + 1), { status: 206, headers });
}
