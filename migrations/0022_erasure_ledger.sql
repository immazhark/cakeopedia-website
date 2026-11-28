-- Append-only record of erasures: the public reference and when, never any personal data. It lets an erasure be re-applied after a restore from an older
-- backup (the restored database would otherwise bring erased customers back). Written in the same atomic batch as the erasure itself.
CREATE TABLE erasure_ledger (
  reference TEXT PRIMARY KEY CHECK (length(reference) BETWEEN 4 AND 100),
  erased_at INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('owner', 'retention', 'backfill'))
) STRICT;
-- Erasures made before this table existed (time = last event, or creation).
INSERT INTO erasure_ledger (reference, erased_at, source)
  SELECT e.public_reference, COALESCE((SELECT MAX(ev.created_at) FROM enquiry_events ev WHERE ev.enquiry_id = e.id), e.created_at), 'backfill'
  FROM enquiries e WHERE json_extract(e.payload_json, '$.erased') = 1;
