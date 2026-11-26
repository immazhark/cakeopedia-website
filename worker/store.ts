import { InvalidInput, type Enquiry } from './contract.ts';

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
      statements.push(this.db.prepare('UPDATE uploads SET enquiry_id = ? WHERE id = ? AND submission_id = ? AND enquiry_id IS NULL AND deleted_at IS NULL AND ready_at IS NOT NULL').bind(id, fileId, enquiry.submissionId));
    }
    if (enquiry.attachmentIds.length > 0) { // a lost attachment violates NOT NULL, aborting the whole batch: no enquiry that claims a missing picture
      statements.push(this.db.prepare('UPDATE enquiries SET payload_hash = NULL WHERE id = ? AND (SELECT count(*) FROM uploads WHERE enquiry_id = ?) <> ?').bind(id, id, enquiry.attachmentIds.length));
    }
    // Owner decision (26 Nov 2026): no automatic email to the customer at intake, because the address is unverified and the form could be used to email a third party.
    // The customer role and its sender stay in place for a future owner-triggered message; nothing queues it here.
    for (const role of ['owner']) {
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
      if (!previous) {
        if (enquiry.attachmentIds.length > 0) {
          const n = await this.db.prepare(`SELECT count(*) AS n FROM uploads WHERE submission_id = ? AND enquiry_id IS NULL AND deleted_at IS NULL AND ready_at IS NOT NULL AND id IN (${enquiry.attachmentIds.map(() => '?').join(',')})`)
            .bind(enquiry.submissionId, ...enquiry.attachmentIds).first<{ n: number }>();
          if ((n?.n ?? 0) < enquiry.attachmentIds.length) throw new InvalidInput(); // an attachment is gone: the customer must re-add it
        }
        throw error;
      }
      if (previous.hash !== hash) throw new Conflict();
      return { receipt: previous, replay: true };
    }
  }
}
