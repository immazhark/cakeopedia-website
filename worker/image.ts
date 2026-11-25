// Inspects customer-supplied inspiration images WITHOUT decoding pixels (no decompression-bomb surface):
// sniffs the real format from bytes, bounds declared dimensions, validates structure, and rewrites the
// container without metadata (EXIF/GPS/XMP/text). Anything else (SVG, HTML, GIF, HEIC, polyglots) is rejected.
export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';
export class RejectedImage extends Error {
  reason: 'too_large' | 'unsupported' | 'malformed' | 'dimensions';
  constructor(reason: RejectedImage['reason']) { super(reason); this.reason = reason; }
}
export const LIMITS = { bytes: 5 * 1024 * 1024, pixels: 40_000_000, side: 10_000 } as const;

export interface CleanImage { type: ImageType; width: number; height: number; bytes: Uint8Array }

const u16 = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const le32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
const bad = (): never => { throw new RejectedImage('malformed'); };

function checkDims(width: number, height: number) {
  if (width < 1 || height < 1) bad();
  if (width > LIMITS.side || height > LIMITS.side || width * height > LIMITS.pixels) throw new RejectedImage('dimensions');
}
function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function cleanJpeg(b: Uint8Array): CleanImage {
  if (b.length < 4 || b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) bad(); // truncated or trailing payload
  const kept: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2, dims: [number, number] | null = null;
  while (i < b.length) {
    if (b[i] !== 0xff) bad();
    let m = b[i + 1]!; // tolerate fill bytes
    while (m === 0xff && i + 2 < b.length) { i++; m = b[i + 1]!; }
    if (m === 0xd9) break;
    if (m === 0xda) { kept.push(b.subarray(i)); i = b.length; break; } // scan data copied verbatim through EOI
    const len = u16(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) bad();
    const sof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (sof) { if (len < 8) bad(); dims = [u16(b, i + 7), u16(b, i + 5)]; }
    const drop = m === 0xe1 || m === 0xed || m === 0xfe || (m >= 0xe3 && m <= 0xef); // EXIF/XMP, Photoshop, comments, other app data
    if (!drop) kept.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  if (!dims) bad();
  checkDims(dims![0], dims![1]);
  return { type: 'image/jpeg', width: dims![0], height: dims![1], bytes: concat(kept) };
}

function cleanPng(b: Uint8Array): CleanImage {
  const drop = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);
  const kept: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8, w = 0, h = 0, first = true, ended = false;
  while (i + 12 <= b.length) {
    const len = u32(b, i), type = ascii(b, i + 4, 4), end = i + 12 + len;
    if (end > b.length) bad();
    if (first) { if (type !== 'IHDR' || len !== 13) bad(); w = u32(b, i + 8); h = u32(b, i + 12); first = false; }
    if (!drop.has(type)) kept.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') { ended = true; break; }
  }
  if (!ended || i !== b.length) bad();
  checkDims(w, h);
  return { type: 'image/png', width: w, height: h, bytes: concat(kept) };
}

function cleanWebp(b: Uint8Array): CleanImage {
  if (b.length < 16 || le32(b, 4) + 8 !== b.length) bad();
  const kept: Uint8Array[] = [];
  let i = 12, w = 0, h = 0, seen = false;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4), len = le32(b, i + 4), end = i + 8 + len + (len & 1);
    if (end > b.length) bad();
    const data = b.subarray(i + 8, i + 8 + len);
    if (type === 'VP8X') { if (len < 10) bad(); w = (data[4]! | (data[5]! << 8) | (data[6]! << 16)) + 1; h = (data[7]! | (data[8]! << 8) | (data[9]! << 16)) + 1; seen = true; }
    else if (type === 'VP8 ' && !seen) { if (len < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) bad(); w = (data[6]! | (data[7]! << 8)) & 0x3fff; h = (data[8]! | (data[9]! << 8)) & 0x3fff; seen = true; }
    else if (type === 'VP8L' && !seen) { if (len < 5 || data[0] !== 0x2f) bad(); const bits = le32(data, 1); w = 1 + (bits & 0x3fff); h = 1 + ((bits >>> 14) & 0x3fff); seen = true; }
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = b.slice(i, end);
      if (type === 'VP8X') chunk[8] = chunk[8]! & ~0x0c; // clear EXIF and XMP flags
      kept.push(chunk);
    }
    i = end;
  }
  if (!seen || i !== b.length) bad();
  checkDims(w, h);
  const body = concat(kept);
  const head = new Uint8Array(12);
  head.set([0x52, 0x49, 0x46, 0x46]); new DataView(head.buffer).setUint32(4, body.length + 4, true); head.set([0x57, 0x45, 0x42, 0x50], 8);
  return { type: 'image/webp', width: w, height: h, bytes: concat([head, body]) };
}

export function inspectImage(bytes: Uint8Array): CleanImage {
  if (bytes.length > LIMITS.bytes) throw new RejectedImage('too_large');
  if (bytes.length < 12) throw new RejectedImage('unsupported');
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return cleanJpeg(bytes);
  if (u32(bytes, 0) === 0x89504e47 && u32(bytes, 4) === 0x0d0a1a0a) return cleanPng(bytes);
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return cleanWebp(bytes);
  throw new RejectedImage('unsupported');
}
