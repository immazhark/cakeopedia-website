import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// Encrypted export and restore check for the D1 database. A backup holds customer data, so it is always encrypted (AES-256-GCM, key
// derived from a passphrase with scrypt) and a wrong key or any tampering fails to decrypt. Nothing here talks to a provider.
const MAGIC = Buffer.from('CKBK1'); // format version 1: magic, salt(16), iv(12), tag(16), ciphertext
export const MIN_PASSPHRASE = 20;

const key = (passphrase: string, salt: Buffer): Buffer => {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`The backup passphrase must be at least ${MIN_PASSPHRASE} characters.`);
  return scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
};

export function encryptBackup(plain: Uint8Array, passphrase: string): Buffer {
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decryptBackup(blob: Uint8Array, passphrase: string): Buffer {
  const b = Buffer.from(blob), head = MAGIC.length + 16 + 12 + 16;
  if (b.length < head || !b.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a Cakeopedia backup file.');
  const salt = b.subarray(MAGIC.length, MAGIC.length + 16), iv = b.subarray(MAGIC.length + 16, MAGIC.length + 28), tag = b.subarray(MAGIC.length + 28, head);
  const decipher = createDecipheriv('aes-256-gcm', key(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try { return Buffer.concat([decipher.update(b.subarray(head)), decipher.final()]); }
  catch { throw new Error('Wrong passphrase or damaged backup file.'); }
}

export interface RestoreReport { tables: Record<string, number>; integrity: string }

/** Loads a SQL dump into a scratch in-memory SQLite database and reports row counts per table. Throws when a required table is missing. */
export function checkRestore(sql: string, required: string[]): RestoreReport {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(sql);
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    for (const t of required) if (!names.includes(t)) throw new Error(`Restore check failed: table "${t}" is missing from the backup.`);
    const tables: Record<string, number> = {};
    for (const n of names) tables[n] = Number((db.prepare(`SELECT count(*) AS n FROM "${n.replaceAll('"', '""')}"`).get() as { n: number }).n);
    const integrity = String((db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check);
    return { tables, integrity };
  } finally { db.close(); }
}

/** Tables a usable backup of this application must contain. */
export const REQUIRED_TABLES = ['enquiries', 'enquiry_events', 'quotes', 'payments', 'uploads', 'notification_outbox', 'catalogue_published', 'upload_sessions'];
