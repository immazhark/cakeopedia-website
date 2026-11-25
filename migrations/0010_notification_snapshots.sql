-- Additive, private notification snapshots. No live delivery is enabled.
CREATE TABLE notification_snapshots (
  event_id TEXT PRIMARY KEY REFERENCES notification_outbox(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('send','skip')),
  payload TEXT,
  created_at INTEGER NOT NULL,
  CHECK ((kind='send' AND payload IS NOT NULL AND json_valid(payload) AND length(CAST(payload AS BLOB)) BETWEEN 1 AND 16384)
      OR (kind='skip' AND payload IS NULL))
) STRICT;
