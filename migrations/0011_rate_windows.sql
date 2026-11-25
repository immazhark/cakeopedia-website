-- Local additive abuse-control storage. Only short-lived HMAC pseudonyms, never raw IPs.
CREATE TABLE request_rate_windows (
  scope TEXT NOT NULL CHECK (scope IN ('enquiry','upload','delete')),
  window_start INTEGER NOT NULL CHECK (window_start>=0 AND window_start%60000=0),
  subject TEXT NOT NULL CHECK (subject='global' OR (length(subject)=64 AND subject NOT GLOB '*[^0-9a-f]*')),
  hits INTEGER NOT NULL CHECK (hits BETWEEN 1 AND 10000),
  PRIMARY KEY(scope,window_start,subject)
) STRICT;
CREATE INDEX request_rate_expiry ON request_rate_windows(window_start);
