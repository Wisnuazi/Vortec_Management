-- DEC-064 fix: the original migration used VARCHAR(20) for reviewStatus,
-- but the Prisma schema declares it as enum DocReviewStatus. Postgres needs
-- the actual enum type to exist or Prisma queries break with
-- "type public.DocReviewStatus does not exist" (error 42704).
--
-- This migration creates the enum, converts the column, and rebuilds the
-- constraint/index. We use DO blocks to make this idempotent — if the
-- enum already exists in a future run, nothing changes.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocReviewStatus' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "DocReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REVISION');
  END IF;
END $$;

-- Drop the default briefly so we can cast cleanly, then restore.
ALTER TABLE "ProjectDocument"
  ALTER COLUMN "reviewStatus" DROP DEFAULT;

ALTER TABLE "ProjectDocument"
  ALTER COLUMN "reviewStatus" TYPE "DocReviewStatus"
  USING "reviewStatus"::"DocReviewStatus";

ALTER TABLE "ProjectDocument"
  ALTER COLUMN "reviewStatus" SET DEFAULT 'PENDING';

COMMIT;
