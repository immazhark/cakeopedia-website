-- Per-client daily cap on bot-verified upload sessions. `client` is an HMAC pseudonym of the canonical network (never a raw address);
-- NULL for sessions created before this migration or when no client key is available.
ALTER TABLE upload_sessions ADD COLUMN client TEXT;
CREATE INDEX upload_sessions_client ON upload_sessions(client, verified_at);
