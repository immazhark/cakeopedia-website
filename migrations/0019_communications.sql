-- Owner-sent correspondence (manual outbound only). One row per message the owner chose to send from the dashboard.
-- 'accepted' means the email provider took the message; it does NOT mean the customer received it (delivery_status is reserved
-- for provider webhooks and stays NULL until that is built). direction/channel reserve 'inbound'/'mailbox' for a future synchronized
-- mailbox; nothing writes them today, and Cloudflare Email Routing forwarding is not synchronization. Content columns are nullable
-- so erasure can blank them while keeping the fact that a message was sent.
CREATE TABLE communications (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  channel TEXT NOT NULL DEFAULT 'resend' CHECK (channel IN ('resend','mailbox')),
  template TEXT NOT NULL CHECK (template IN ('reply','quotation','confirmation','reminder')),
  recipient TEXT CHECK (recipient IS NULL OR length(recipient) <= 254),
  subject TEXT CHECK (subject IS NULL OR length(subject) <= 200),
  body TEXT CHECK (body IS NULL OR length(body) <= 8000),
  payload TEXT CHECK (payload IS NULL OR (json_valid(payload) AND length(CAST(payload AS BLOB)) <= 16384)),
  state TEXT NOT NULL CHECK (state IN ('queued','accepted','failed','unknown')),
  provider_id TEXT CHECK (provider_id IS NULL OR length(provider_id) <= 256),
  delivery_status TEXT CHECK (delivery_status IS NULL OR length(delivery_status) <= 40),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  actor TEXT NOT NULL
) STRICT;
CREATE INDEX communications_enquiry ON communications(enquiry_id, created_at);
