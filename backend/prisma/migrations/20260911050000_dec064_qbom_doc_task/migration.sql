-- DEC-064: QBOM + Document PM/OM approval + multi-role task assignment
-- + permission narrowing (org editor includes Director/OM, role user picker
-- narrowed to super admin + Director + OM, floor layout description
-- narrowed to super admin + Director + OM)

-- 1. QBOM: add Quality BOM type for the Quality Control team.
ALTER TYPE "BomType" ADD VALUE IF NOT EXISTS 'QBOM';

-- 2. ProjectDocument PM/OM approval workflow:
--    done (boolean) = role checked it (the work is done)
--    reviewStatus (PENDING | APPROVED | REVISION) = PM/OM review result
--      PENDING  = waiting for the owning role to check it done
--      APPROVED = PM/OM reviewed and approved
--      REVISION = PM/OM reviewed and sent back for revision (done=false again)
ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "reviewStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDING';
ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "reviewedByUserId" VARCHAR(30);
ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT NOT NULL DEFAULT '';
-- Set existing rows to REVISION so PM/OM must explicitly approve them
-- (they predate this feature and should not auto-pass).
UPDATE "ProjectDocument" SET "reviewStatus" = 'REVISION' WHERE "reviewStatus" = 'PENDING';

-- 3. Multi-role task assignment: TaskRole join table replaces the
--    single nullable Task.assignedRoleId.
CREATE TABLE IF NOT EXISTS "TaskRole" (
    "id" VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR(30),
    "taskId" VARCHAR(30) NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
    "roleId" VARCHAR(30) NOT NULL REFERENCES "Role"("id") ON DELETE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    UNIQUE("taskId", "roleId")
);
CREATE INDEX IF NOT EXISTS "TaskRole_taskId_idx" ON "TaskRole"("taskId");
CREATE INDEX IF NOT EXISTS "TaskRole_roleId_idx" ON "TaskRole"("roleId");

-- Migrate existing assignedRoleId values into TaskRole.
-- Rows where assignedRoleId IS NOT NULL get one TaskRole entry each.
INSERT INTO "TaskRole" ("id", "taskId", "roleId", "createdAt")
SELECT
    gen_random_uuid()::VARCHAR(30),
    t."id",
    t."assignedRoleId",
    t."createdAt"
FROM "Task" t
WHERE t."assignedRoleId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Now safe to drop the old column (TaskRole is populated first).
ALTER TABLE "Task" DROP COLUMN IF EXISTS "assignedRoleId";
