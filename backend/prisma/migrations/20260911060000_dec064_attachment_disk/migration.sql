-- DEC-064: Add diskPath column to Attachment.
-- Stores the absolute path on disk for new file uploads.
-- Legacy dataUrl records (pre-DEC-064) are unaffected and continue to work.

BEGIN;

ALTER TABLE "Attachment" ADD COLUMN "diskPath" TEXT;

COMMIT;
