// Regenerates the public-safe part of docs/media-inventory.md from private/media-inventory-ids.json
// (gitignored; written by the inventory pass, holds ids -> source filenames) plus the classification below.
// Reads nothing from the originals. Output carries neutral ids only: no filenames, paths or names.
// Usage: node scripts/media-inventory.mjs   (updates the table between the markers)
import { readFileSync, writeFileSync } from 'node:fs';

// id -> [subject, quality / note, status]. Judged from contact sheets (images) and a mid-clip frame (videos).
const P = 'published', N = 'held: name legible', L = 'held: licensed character', S = 'not media: screenshot';
const c = {
  'b1-01': ['floral', 'good; three tiers, red roses', P], 'b1-02': ['other (character)', 'good', L],
  'b1-03': ['other (castle)', 'good; names on cake and backdrop', N], 'b1-04': ['other (mini cakes)', 'good', P],
  'b1-05': ['other', 'clip; name legible; 4K 60 fps', N], 'b1-06': ['other (celebration set)', 'good', P],
  'b1-07': ['other', 'clip; out of focus, audio track; same scene as the blue and yellow set', 'held: poor quality'],
  'b1-08': ['floral', 'good', P], 'b1-09': ['floral', 'good', P], 'b1-10': ['floral', 'good', P], 'b1-11': ['floral', 'good', P],
  'b1-12': ['floral', 'good', P], 'b1-13': ['floral', 'good', P], 'b1-14': ['floral', 'good', P],
  'b1-15': ['floral', 'good; name on cake', N],
  'b1-16': ['vintage', 'clip; piping demonstration, trimmed to avoid names; audio stripped', P],
  'b1-17': ['other', 'minor JPEG data errors; name on backdrop', N], 'b1-18': ['floral', 'good', P],
  'b1-19': ['other (celebration)', 'clip', P], 'b1-20': ['minis', 'clip', P],
  'b1-21': ['other', 'clip; name on cake', N], 'b1-22': ['other', 'minor JPEG data errors; name on cake', N],
  'b1-23': ['other', 'minor JPEG data errors; names on cake', N], 'b1-24': ['celebration', 'good', P],
  'b1-25': ['minis', 'good', P],
  'b1-26': ['floral', 'soft focus; lettering on cake', 'held: lettering not cleared'],
  'b1-27': ['floral', 'good; studio-style backdrop', P], 'b1-28': ['other', 'name on stand and backdrop', N],
  'b1-29': ['celebration', 'good', P],
  'b1-30': ['floral', 'good; same cake family as b1-01, busy background', 'held: duplicate of a published cake'],
  'b1-31': ['other', 'good; outdoor background shows a residential area', 'held: location visible'],
  'b1-32': ['vintage', 'good; name on cake', N], 'b1-33': ['celebration', 'good', P], 'b1-34': ['celebration', 'good', P],
  'b1-35': ['other', 'name on cake', N], 'b1-36': ['vintage', 'good; name piped on the front', N],
  'b1-37': ['vintage / floral', 'good', P], 'b1-38': ['unknown', 'truncated HEIC, cannot be decoded', 'unusable: re-export needed'],
  'b1-39': ['other', 'good; name on cake', N], 'b1-40': ['palette reference', 'screenshot of the approved palette', S],
  'b1-41': ['other', 'clip; 478x850, burned-in social handle', L + ' and handle'],
  'b2-01': ['floral', 'good', P], 'b2-02': ['other', 'names on cake and backdrop; duplicate scene of b1-03', N],
  'b2-03': ['floral', 'good', P], 'b2-04': ['other', 'landscape; name on cake', N], 'b2-05': ['other', 'name on cake and topper', N],
  'b2-06': ['floral', 'good', P], 'b2-07': ['floral', 'good', P], 'b2-08': ['other', 'name and licensed character', L],
  'b2-09': ['vintage', 'good; name on cake', N], 'b2-10': ['other', 'name on cake', N], 'b2-11': ['celebration', 'good', P],
  'b2-12': ['other', 'name and licensed characters', L], 'b2-13': ['floral', 'good', P],
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`b3-0${n}`, ['n/a', 'Instagram menu or post screenshot; carries a handle, prices, status bars', S]])),
};
const rows = JSON.parse(readFileSync('private/media-inventory-ids.json', 'utf8')).map((r) => {
  const [subject, note, status] = c[r.id] ?? ['?', '?', '?'];
  const orient = r.w === r.h ? 'square' : r.w > r.h ? 'landscape' : 'portrait';
  const dim = r.type === 'video' ? `${r.w}x${r.h}, ${r.dur}s${r.audio ? ', audio' : ''}` : `${r.w ?? '?'}x${r.h ?? '?'}`;
  return `| ${r.id} | ${r.type} | ${dim} | ${r.w ? orient : '-'} | ${(r.size / 1048576).toFixed(1)} | ${subject} | ${note} | ${status} |`;
});
const unknown = rows.filter((x) => x.includes('| ? |'));
if (unknown.length) throw new Error('unclassified: ' + unknown.length);
const table = ['| id | type | size px / length | orientation | MB | subject | quality / note | status |', '|---|---|---|---|---|---|---|---|', ...rows].join('\n');
const doc = readFileSync('docs/media-inventory.md', 'utf8');
writeFileSync('docs/media-inventory.md', doc.replace(/<!-- table -->[\s\S]*<!-- \/table -->/, `<!-- table -->\n${table}\n<!-- /table -->`));
console.log(rows.length, 'rows');
