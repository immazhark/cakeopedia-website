-- Last outcome of each scheduled job, so a silently failing job is visible in the owner health view. No customer data: job name, state and counters only.
CREATE TABLE maintenance_runs (
  job TEXT PRIMARY KEY CHECK (length(job) BETWEEN 1 AND 40),
  last_run_at INTEGER NOT NULL,
  last_state TEXT NOT NULL CHECK (last_state IN ('completed', 'partial', 'failed')),
  last_ok_at INTEGER,
  failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0)
) STRICT;
