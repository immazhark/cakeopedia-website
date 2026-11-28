-- A submission may upload only after one bot challenge was verified for it (kept for an hour, purged after a day).
CREATE TABLE upload_sessions (
  submission_id TEXT PRIMARY KEY,
  verified_at INTEGER NOT NULL
) STRICT;
