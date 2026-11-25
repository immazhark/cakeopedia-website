-- Private inspiration uploads. Rows are created BEFORE the object is stored, so an object can never exist untracked.
-- enquiry_id stays NULL until the enquiry is saved; NULL rows older than the retention window are purged.
CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  created_at INTEGER NOT NULL,
  enquiry_id TEXT REFERENCES enquiries(id) ON DELETE CASCADE
) STRICT;
CREATE INDEX uploads_submission ON uploads(submission_id);
CREATE INDEX uploads_orphans ON uploads(enquiry_id, created_at);
CREATE INDEX uploads_recent ON uploads(created_at);
