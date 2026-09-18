/*
  DEC-061 — Kasbon full rewrite.

  Old model:  KasbonPhase (status: DRAFT|SUBMITTED|APPROVED|REJECTED) holds
  KasbonItems directly. One phase = one submission batch. Reject = back to
  DRAFT for edit+resubmit.

  New model:  KasbonPhase (status: OPEN|REALIZED, createdByUserId is the
  OM). A phase can hold MANY KasbonSubmissions (status:
  PENDING|APPROVED|REJECTED) submitted by OL. Items live under a
  submission. Rejected submissions stay visible (read-only) — OL must
  create a new submission.

  Data migration: each existing KasbonPhase becomes one OPEN/REALIZED
  KasbonPhase (decided by the old status) plus one synthetic
  KasbonSubmission carrying the old status, the original
  requestedByUserId becomes submittedByUserId, and the old submittedAt/
  reviewedAt/reviewNote/reviewedByUserId move onto the submission. Items
  move from phaseId to submissionId (the synthetic one).
*/

-- 1. Add the new status enum and create the new submission table.
CREATE TYPE "KasbonSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "KasbonSubmission" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "status" "KasbonSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "batchNote" TEXT NOT NULL DEFAULT '',
    "submittedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KasbonSubmission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KasbonSubmission_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "KasbonPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KasbonSubmission_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KasbonSubmission_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "KasbonSubmission_phaseId_idx" ON "KasbonSubmission"("phaseId");
CREATE INDEX "KasbonSubmission_status_idx" ON "KasbonSubmission"("status");
CREATE INDEX "KasbonSubmission_submittedByUserId_idx" ON "KasbonSubmission"("submittedByUserId");

-- 2. Migrate the old phase-level review fields onto a synthetic submission
-- per phase. The old "requestedByUserId" becomes the synthetic
-- submission's "submittedByUserId" (preserves the audit trail — the
-- phase creator in the old model was the item requester; in the new
-- model the phase is created by OM, but the old data still has
-- requestedByUserId which we'll keep below as "createdByUserId" on the
-- phase, see step 5).
INSERT INTO "KasbonSubmission" (
    "id", "phaseId", "status", "batchNote",
    "submittedByUserId", "submittedAt",
    "reviewedByUserId", "reviewedAt", "reviewNote",
    "createdAt", "updatedAt"
)
SELECT
    'migrated-' || p."id",
    p."id",
    CASE p."status"
        WHEN 'DRAFT'     THEN 'PENDING'::"KasbonSubmissionStatus"
        WHEN 'SUBMITTED' THEN 'PENDING'::"KasbonSubmissionStatus"
        WHEN 'APPROVED'  THEN 'APPROVED'::"KasbonSubmissionStatus"
        WHEN 'REJECTED'  THEN 'REJECTED'::"KasbonSubmissionStatus"
    END,
    '',
    p."requestedByUserId",
    COALESCE(p."submittedAt", p."createdAt"),
    p."reviewedByUserId",
    p."reviewedAt",
    p."reviewNote",
    p."createdAt",
    p."updatedAt"
FROM "KasbonPhase" p;

-- 3. Add submissionId to KasbonItem (nullable for the UPDATE below).
ALTER TABLE "KasbonItem" ADD COLUMN "submissionId" TEXT;

-- 4. Move every existing item to the synthetic submission that replaced
-- its phase. Every existing item gets linked to the "migrated-<phaseId>"
-- submission row created in step 2.
UPDATE "KasbonItem" ki
SET "submissionId" = 'migrated-' || ki."phaseId";

-- 5. Make submissionId NOT NULL and add FK + index.
ALTER TABLE "KasbonItem" ALTER COLUMN "submissionId" SET NOT NULL;

// DEC-061 makes purchaseDate optional (it's now filled in during the
// "realise" step, not at submission time). The DEC-045 migration set
// it to NOT NULL, so drop that constraint here.
ALTER TABLE "KasbonItem" ALTER COLUMN "purchaseDate" DROP NOT NULL;

ALTER TABLE "KasbonItem" DROP CONSTRAINT "KasbonItem_phaseId_fkey";
ALTER TABLE "KasbonItem" DROP COLUMN "phaseId";

ALTER TABLE "KasbonItem" ADD CONSTRAINT "KasbonItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "KasbonSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "KasbonItem_submissionId_idx" ON "KasbonItem"("submissionId");

-- 6. Drop the phase-level review fields that moved onto the submission.
ALTER TABLE "KasbonPhase" DROP CONSTRAINT "KasbonPhase_reviewedByUserId_fkey";
ALTER TABLE "KasbonPhase" DROP COLUMN "reviewedByUserId";
ALTER TABLE "KasbonPhase" DROP COLUMN "reviewedAt";
ALTER TABLE "KasbonPhase" DROP COLUMN "reviewNote";
ALTER TABLE "KasbonPhase" DROP COLUMN "submittedAt";

-- 7. Rename the old requestedByUserId column to createdByUserId (the
-- phase is now "created by" the OM, which in the old data was the
-- phase's requester — same person in practice, but the relationship
-- intent is different). Keep the same column type and FK target.
ALTER TABLE "KasbonPhase" RENAME COLUMN "requestedByUserId" TO "createdByUserId";

-- 8. Replace the KasbonPhaseStatus enum (DRAFT|SUBMITTED|APPROVED|REJECTED
-- → OPEN|REALIZED). Must use a TEXT cast because the new enum values
-- don't overlap the old ones.
ALTER TABLE "KasbonPhase" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "KasbonPhase" ALTER COLUMN "status" TYPE TEXT USING
    CASE "status"
        WHEN 'APPROVED' THEN 'REALIZED'
        ELSE 'OPEN'
    END;
DROP TYPE "KasbonPhaseStatus";
CREATE TYPE "KasbonPhaseStatus" AS ENUM ('OPEN', 'REALIZED');
ALTER TABLE "KasbonPhase" ALTER COLUMN "status" TYPE "KasbonPhaseStatus" USING "status"::"KasbonPhaseStatus";
ALTER TABLE "KasbonPhase" ALTER COLUMN "status" SET DEFAULT 'OPEN';
ALTER TABLE "KasbonPhase" ALTER COLUMN "status" SET NOT NULL;

-- 9. Add realizedAt (set for previously-APPROVED phases which became
-- REALIZED in step 8).
ALTER TABLE "KasbonPhase" ADD COLUMN "realizedAt" TIMESTAMP(3);
UPDATE "KasbonPhase" SET "realizedAt" = "updatedAt" WHERE "status" = 'REALIZED';

-- 10. Add a status index for the new "find the OPEN phase" query path.
CREATE INDEX "KasbonPhase_status_idx" ON "KasbonPhase"("status");

-- 11. Replace the old unique key (requestedByUserId, division, period,
-- phase) with the new one (division, period, phase) — the new model
-- scopes uniqueness by division/period/phase only, since the phase
-- creator is now a system role (OM) not a specific user. NOTE: the
-- old constraint was already dropped by the DEC-059 migration
-- (20260911000000_employee_to_userrole) which renamed the column;
-- only re-create the new unique key.
CREATE UNIQUE INDEX "KasbonPhase_division_period_phase_key" ON "KasbonPhase"("division", "period", "phase");
