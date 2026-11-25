-- Private owner-only record of every saved menu revision (written in the same batch as the compare-and-set, so it never lags the item).
CREATE TABLE menu_history (
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  at TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  PRIMARY KEY (id, revision)
) STRICT;
