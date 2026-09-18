-- DEC-067: per-role BOM submit permissions + Open/Close BOM per project.
--
-- 1. Role.allowedBomTypes — Postgres text[] column. Each role gets a
--    default backfilled in this same migration based on its `title`,
--    matching the ruleset documented in DEC-067 + schema.prisma.
-- 2. Project.bomClosed / bomClosedAt / bomClosedByUserId — lock flag
--    that the PM/OM flips via POST /api/projects/:id/bom/close. Also
--    an FK to the User who closed it (audit).

BEGIN;

-- 1a. Add the new Role column. Empty array by default — the backfill
--     below fills in known role titles; anything unknown stays empty.
ALTER TABLE "Role" ADD COLUMN "allowedBomTypes" "BomType"[] NOT NULL DEFAULT ARRAY[]::"BomType"[];

-- 1b. Backfill defaults. Each UPDATE is idempotent against the title
--     match; running the migration twice produces the same result.
UPDATE "Role" SET "allowedBomTypes" = ARRAY['MBOM']::"BomType"[]
  WHERE "title" = 'Mechanical Engineer';

UPDATE "Role" SET "allowedBomTypes" = ARRAY['EBOM']::"BomType"[]
  WHERE "title" = 'Electrical Engineer';

UPDATE "Role" SET "allowedBomTypes" = ARRAY['SBOM']::"BomType"[]
  WHERE "title" = 'Software Development';

UPDATE "Role" SET "allowedBomTypes" = ARRAY['QBOM']::"BomType"[]
  WHERE "title" = 'Quality Control';

UPDATE "Role" SET "allowedBomTypes" = ARRAY['MBOM','EBOM','SBOM','QBOM']::"BomType"[]
  WHERE "title" IN ('Project Manager', 'Operational Manager');

-- Director / Purchasing / Operational Leader intentionally left
-- empty (oversight, not submitters). Same for any other role title
-- not enumerated above (the default [] applies).

-- 2. Project Open/Close BOM fields. bomClosed defaults to false so
--    every existing project stays "open" (submissions still allowed)
--    until the team explicitly closes it.
ALTER TABLE "Project" ADD COLUMN "bomClosed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "bomClosedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "bomClosedByUserId" VARCHAR(30);

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_bomClosedByUserId_fkey"
  FOREIGN KEY ("bomClosedByUserId") REFERENCES "User"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "Project_bomClosed_idx" ON "Project"("bomClosed");

COMMIT;
