-- Quotes, owner-verified payments and busy dates. All money is integer US cents. All dates are Austin calendar
-- dates (YYYY-MM-DD) and times are local HH:MM strings: nothing is converted between zones, so DST cannot shift an order.
-- Quotes and payments are append-only (a new quote is a new version; a payment is voided, never edited or deleted).
CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  total_cents INTEGER NOT NULL CHECK (total_cents BETWEEN 0 AND 10000000),
  deposit_cents INTEGER NOT NULL CHECK (deposit_cents >= 0 AND deposit_cents <= total_cents),
  fulfilment TEXT NOT NULL CHECK (fulfilment IN ('pickup','delivery')),
  fulfil_date TEXT NOT NULL CHECK (fulfil_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  fulfil_time TEXT CHECK (fulfil_time IS NULL OR fulfil_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  design_notes TEXT CHECK (design_notes IS NULL OR length(design_notes) <= 2000),
  prep_notes TEXT CHECK (prep_notes IS NULL OR length(prep_notes) <= 2000),
  created_at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  UNIQUE (enquiry_id, version)
) STRICT;
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('deposit','balance')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 1 AND 10000000),
  received_on TEXT NOT NULL CHECK (received_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  recorded_at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  voided_at INTEGER,
  void_reason TEXT CHECK (void_reason IS NULL OR length(void_reason) <= 500)
) STRICT;
CREATE INDEX payments_enquiry ON payments(enquiry_id);
CREATE TABLE busy_dates (
  date TEXT PRIMARY KEY CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  created_at INTEGER NOT NULL,
  actor TEXT NOT NULL
) STRICT;
CREATE INDEX quotes_date ON quotes(fulfil_date);
