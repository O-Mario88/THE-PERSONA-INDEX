-- Private replies read oldest first (sharing.go ShareNotes). Two replies in
-- the same instant keep the order they arrived in.
ALTER TABLE share_notes ADD COLUMN IF NOT EXISTS seq bigserial;
