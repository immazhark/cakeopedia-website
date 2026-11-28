import { REFERENCE } from '../worker/erase.ts';

// The erasure ledger as a small text file: one line per erased enquiry, "reference<TAB>erased_at<TAB>source". References are not personal data. The file is
// append-only in spirit: merging keeps every reference ever seen and the EARLIEST time, so a restore from an old backup can still re-apply every later erasure.
export interface LedgerEntry { reference: string; at: number; source: 'owner' | 'retention' | 'backfill' }
const SOURCES = new Set(['owner', 'retention', 'backfill']);

export function parseLedger(text: string): Map<string, LedgerEntry> {
  const out = new Map<string, LedgerEntry>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [reference, at, source] = line.split('\t');
    if (!reference || !REFERENCE.test(reference) || !/^\d{1,16}$/.test(at ?? '') || !SOURCES.has(source ?? '')) throw new Error('The erasure ledger has a malformed line; nothing was applied.');
    out.set(reference, { reference, at: Number(at), source: source as LedgerEntry['source'] });
  }
  return out;
}
export function mergeLedgers(...ledgers: Map<string, LedgerEntry>[]): Map<string, LedgerEntry> {
  const out = new Map<string, LedgerEntry>();
  for (const l of ledgers) for (const e of l.values()) { const have = out.get(e.reference); if (!have || e.at < have.at) out.set(e.reference, e); }
  return out;
}
export const formatLedger = (l: Map<string, LedgerEntry>) => '# Cakeopedia erasure ledger: reference, erased_at (ms), source. References only, no personal data.\n' +
  [...l.values()].sort((a, b) => a.at - b.at || (a.reference < b.reference ? -1 : 1)).map((e) => `${e.reference}\t${e.at}\t${e.source}`).join('\n') + '\n';
