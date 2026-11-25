-- A removed or failed upload is first marked (deleted_at) so it can no longer be attached or counted, then its object and row are
-- removed. If either removal is lost, the scheduled purge finishes the job, so no private object is ever left untracked.
ALTER TABLE uploads ADD COLUMN deleted_at INTEGER;
