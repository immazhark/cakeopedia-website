-- Additive local proof. No customer data or production bindings.
CREATE TABLE enquiries (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  public_reference TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','replied','booked','closed'))
) STRICT;
CREATE TABLE enquiry_references (
  enquiry_id TEXT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  creation_id TEXT NOT NULL,
  PRIMARY KEY (enquiry_id, creation_id)
) STRICT;
CREATE TABLE notification_outbox (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('owner','customer')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','sent','failed','reconcile')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at INTEGER NOT NULL,
  UNIQUE (enquiry_id, recipient_role)
) STRICT;
CREATE INDEX outbox_due ON notification_outbox(state, next_attempt_at);
