-- Local operational proof. No scheduler or provider sending is enabled.
ALTER TABLE notification_outbox ADD COLUMN lease_token TEXT;
ALTER TABLE notification_outbox ADD COLUMN lease_until INTEGER;
ALTER TABLE notification_outbox ADD COLUMN first_attempt_at INTEGER;
ALTER TABLE notification_outbox ADD COLUMN provider_id TEXT;
ALTER TABLE notification_outbox ADD COLUMN last_error_code TEXT;
