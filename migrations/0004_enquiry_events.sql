-- Enquiry workflow history. Current status = latest event, falling back to the legacy column
-- (legacy 'booked' maps to 'confirmed'). Append-only: corrections are new events, never edits.
CREATE TABLE enquiry_events (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('new','replied','quoted','confirmed','closed')),
  created_at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 1000)
) STRICT;
CREATE INDEX enquiry_events_latest ON enquiry_events(enquiry_id, created_at);
