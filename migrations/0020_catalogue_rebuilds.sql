-- Durable record of whether the static site rebuild was requested for each published catalogue version, and which draft revision a
-- publish came from (so a retried publish of the same revision is a replay, not a second version). "requested" means the deploy hook
-- accepted the call; it is not proof the site has finished rebuilding.
ALTER TABLE catalogue_published ADD COLUMN draft_revision INTEGER;
CREATE TABLE catalogue_rebuilds (
  version INTEGER PRIMARY KEY REFERENCES catalogue_published(version),
  status TEXT NOT NULL CHECK (status IN ('requested', 'failed', 'not_configured')),
  attempts INTEGER NOT NULL CHECK (attempts >= 1),
  updated_at TEXT NOT NULL
) STRICT;
