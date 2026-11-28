-- Owner catalogue: one working draft (compare-and-set on revision) and an append-only list of published snapshots.
-- Public pages and the static build only ever read the latest published snapshot. Rollback appends a copy; history is never rewritten.
CREATE TABLE catalogue_draft (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json))
) STRICT;
CREATE TABLE catalogue_published (
  version INTEGER PRIMARY KEY CHECK (version >= 1),
  published_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('publish', 'rollback')),
  from_version INTEGER,
  data_json TEXT NOT NULL CHECK (json_valid(data_json))
) STRICT;
