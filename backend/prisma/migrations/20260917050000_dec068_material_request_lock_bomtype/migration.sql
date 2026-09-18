-- DEC-068: Pengajuan Bahan Baku lock toggle + per-submission BomType.
--
-- 1. MaterialRequest.bomType — nullable so legacy rows stay valid.
--    New submissions should always set it (frontend dropdown filters
--    by user's roles' allowedBomTypes; backend enforces the rule).
-- 2. Project.materialRequestLocked — soft lock flag, PM/OM toggle.
--    When true, POST /api/projects/:id/material-requests returns 400.

BEGIN;

-- 1. MaterialRequest.bomType column (nullable for back-compat).
ALTER TABLE "MaterialRequest" ADD COLUMN "bomType" "BomType";

CREATE INDEX "MaterialRequest_bomType_idx" ON "MaterialRequest"("bomType");

-- 2. Project lock toggle + audit fields.
ALTER TABLE "Project" ADD COLUMN "materialRequestLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "materialRequestLockedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "materialRequestLockedByUserId" VARCHAR(30);

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_materialRequestLockedByUserId_fkey"
  FOREIGN KEY ("materialRequestLockedByUserId") REFERENCES "User"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "Project_materialRequestLocked_idx" ON "Project"("materialRequestLocked");

COMMIT;
