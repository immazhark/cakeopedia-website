-- An upload is attachable only once its object is confirmed stored (ready_at set). Existing live rows were stored before this column existed.
ALTER TABLE uploads ADD COLUMN ready_at INTEGER;
UPDATE uploads SET ready_at = created_at WHERE deleted_at IS NULL;
