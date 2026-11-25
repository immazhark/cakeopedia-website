import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { inspectImage, LIMITS, RejectedImage } from '../worker/image.ts';

const exif = { IFD0: { Copyright: 'SYNTHETIC-PRIVATE-MARKER' } };
const make = async (fmt: 'jpeg' | 'png' | 'webp', withMeta = true) => {
  let s = sharp({ create: { width: 64, height: 48, channels: 3, background: '#cc8899' } });
  if (withMeta) s = s.withExif(exif);
  return new Uint8Array(await s[fmt]().toBuffer());
};
const rejects = (bytes: Uint8Array, reason: string) =>
  assert.throws(() => inspectImage(bytes), (e) => e instanceof RejectedImage && e.reason === reason, reason);
const contains = (b: Uint8Array, text: string) => Buffer.from(b).includes(Buffer.from(text));

for (const fmt of ['jpeg', 'png', 'webp'] as const) {
  test(`${fmt}: valid image keeps pixels and loses metadata`, async () => {
    const input = await make(fmt);
    assert.ok(contains(input, 'SYNTHETIC-PRIVATE-MARKER'), 'fixture must carry metadata');
    const out = inspectImage(input);
    assert.equal(out.type, `image/${fmt}`);
    assert.deepEqual([out.width, out.height], [64, 48]);
    assert.ok(!contains(out.bytes, 'SYNTHETIC-PRIVATE-MARKER'));
    const meta = await sharp(out.bytes).metadata(); // an independent decoder still accepts the rewritten file
    assert.deepEqual([meta.width, meta.height, meta.format], [64, 48, fmt]);
    assert.equal(meta.exif, undefined);
  });
}

test('active, unsupported and disguised content is rejected by actual bytes', async () => {
  const enc = (s: string) => new TextEncoder().encode(s.padEnd(64, ' '));
  rejects(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'unsupported');
  rejects(enc('<!doctype html><script>alert(1)</script>'), 'unsupported');
  rejects(enc('GIF89a\x01\x00\x01\x00'), 'unsupported');
  rejects(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]), 'unsupported'); // HEIC
  rejects(new Uint8Array(4), 'unsupported');
});

test('truncated files and appended payloads are malformed', async () => {
  const jpg = await make('jpeg', false), png = await make('png', false), webp = await make('webp', false);
  rejects(jpg.slice(0, jpg.length - 10), 'malformed');
  rejects(new Uint8Array([...jpg, ...new TextEncoder().encode('<script>x</script>')]), 'malformed');
  rejects(png.slice(0, png.length - 5), 'malformed');
  rejects(new Uint8Array([...png, 1, 2, 3]), 'malformed');
  rejects(webp.slice(0, webp.length - 3), 'malformed');
});

test('size, dimension and pixel-count bombs are rejected before any decoding', async () => {
  rejects(new Uint8Array(LIMITS.bytes + 1), 'too_large');
  const png = await make('png', false);
  const forged = (w: number, h: number) => { const c = png.slice(); const v = new DataView(c.buffer); v.setUint32(16, w); v.setUint32(20, h); return c; };
  rejects(forged(60_000, 10), 'dimensions');
  rejects(forged(9_000, 9_000), 'dimensions'); // 81 MP > 40 MP
  rejects(forged(0, 10), 'malformed');
  assert.equal(inspectImage(forged(6_000, 6_000)).width, 6_000); // 36 MP is allowed
  const jpg = await make('jpeg', false);
  const sof = jpg.findIndex((v, i) => v === 0xff && v !== undefined && jpg[i + 1] === 0xc0);
  const jf = jpg.slice(); jf[sof + 5] = 0xff; jf[sof + 6] = 0xff; jf[sof + 7] = 0xff; jf[sof + 8] = 0xff;
  rejects(jf, 'dimensions');
});
