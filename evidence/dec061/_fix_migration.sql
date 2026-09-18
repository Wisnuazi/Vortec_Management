-- Mark the failed migration as rolled back so Prisma can re-apply it.
-- Also clear the half-applied state in case the migration partially ran.
-- The failed migration is 20260911020000_dec061_kasbon_submissions.
-- It failed on the first ALTER TABLE step (DROP CONSTRAINT) so nothing
-- else was modified — the original schema is intact.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20260911020000_dec061_kasbon_submissions'
  AND "finished_at" IS NULL;
