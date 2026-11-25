import type { Enquiry } from './contract.ts';

// Narrow D1 boundary: prepare/bind and transactional batch only.
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export interface Receipt { hash: string; reference: string }
export class Conflict extends Error {}
export class EnquiryStore {
  private db: Database;
  constructor(db: Database) { this.db = db; }
  async find(submissionId: string): Promise<Receipt | null> {
    return this.db.prepare('SELECT payload_hash AS hash, public_reference AS reference FROM enquiries WHERE submission_id = ?')
      .bind(submissionId).first<Receipt>();
  }
  async save(enquiry: Enquiry, hash: string): Promise<{ receipt: Receipt; replay: boolean }> {
    const id = crypto.randomUUID();
    const reference = 'CK-' + crypto.randomUUID();
    const now = Date.now();
    const statements = [this.db.prepare('INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, enquiry.submissionId, hash, reference, now, JSON.stringify(enquiry))];
    for (const creationId of enquiry.creationIds) {
      statements.push(this.db.prepare('INSERT INTO enquiry_references (enquiry_id, creation_id) VALUES (?, ?)').bind(id, creationId));
    }
    for (const fileId of enquiry.attachmentIds) {
      statements.push(this.db.prepare('UPDATE uploads SET enquiry_id = ? WHERE id = ? AND submission_id = ? AND enquiry_id IS NULL AND deleted_at IS NULL').bind(id, fileId, enquiry.submissionId));
    }
    for (const role of ['owner', 'customer']) {
      statements.push(this.db.prepare('INSERT INTO notification_outbox (id, enquiry_id, recipient_role, next_attempt_at) VALUES (?, ?, ?, ?)')
        .bind(`${id}:${role}`, id, role, now));
    }
    try {
      await this.db.batch(statements);
      return { receipt: { hash, reference }, replay: false };
    } catch (error) {
      // A concurrent request may have won. Only a matching durable receipt recovers
      // success; an unrelated storage failure must remain a failure.
      const previous = await this.find(enquiry.submissionId);
      if (!previous) throw error;
      if (previous.hash !== hash) throw new Conflict();
      return { receipt: previous, replay: true };
    }
  }
}
