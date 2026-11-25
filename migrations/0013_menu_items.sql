-- Private editorial menu. Public pages only ever see the owner-approved export (published AND available), never this table.
-- revision is the optimistic-concurrency token: an edit applies only to the revision the owner was looking at.
CREATE TABLE menu_items (
  id TEXT PRIMARY KEY CHECK (id GLOB '[a-z0-9]*' AND length(id) <= 80),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json))
) STRICT;
