-- DEC-066: Vortec Organization library — Workflow + SOP.
--
-- Workflows document "how a particular piece of work flows" (process
-- reference for the team). SOPs document "the official way to perform a
-- specific task" (typically a PDF/DOCX attachment).
--
-- CRU by Operational Manager and super admin; every other authenticated
-- role can read. Permission gate lives in the route handler.
--
-- Order matters: Workflow + SOP tables must exist before we attach the
-- Attachment FKs to them. Earlier draft had the FKs declared before the
-- tables and failed with `current transaction is aborted`.

BEGIN;

-- 1. Workflow table. See DEC-066 in docs/DECISIONS.md.
CREATE TABLE "Workflow" (
    "id" VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR(30),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "steps" TEXT NOT NULL DEFAULT '',
    "category" VARCHAR(80) NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" VARCHAR(30) NOT NULL,
    "updatedByUserId" VARCHAR(30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Workflow_category_order_idx" ON "Workflow"("category", "order");

ALTER TABLE "Workflow"
  ADD CONSTRAINT "Workflow_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Workflow"
  ADD CONSTRAINT "Workflow_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- 2. SOP table. Same shape as Workflow but with `content` (free-text body
--    shown alongside the file) and `summary` (card preview).
CREATE TABLE "SOP" (
    "id" VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR(30),
    "title" VARCHAR(200) NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "category" VARCHAR(80) NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" VARCHAR(30) NOT NULL,
    "updatedByUserId" VARCHAR(30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "SOP_category_order_idx" ON "SOP"("category", "order");

ALTER TABLE "SOP"
  ADD CONSTRAINT "SOP_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "SOP"
  ADD CONSTRAINT "SOP_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- 3. Extend Attachment with two optional FKs. The existing per-relation
--    rule (at most one of taskId/documentId/materialRequestId/dailyReportId
--    is set) is documented in the schema; we extend it to include sopId
--    and workflowId here. Existing rows are unaffected (both default NULL).
ALTER TABLE "Attachment" ADD COLUMN "sopId" VARCHAR(30);
ALTER TABLE "Attachment" ADD COLUMN "workflowId" VARCHAR(30);

CREATE INDEX "Attachment_sopId_idx" ON "Attachment"("sopId");
CREATE INDEX "Attachment_workflowId_idx" ON "Attachment"("workflowId");

-- FKs are added last so both tables and columns exist. DEFERRABLE so the
-- attach step in the route handler can insert Attachment rows before the
-- parent Workflow/SOP row in the same transaction.
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_sopId_fkey"
  FOREIGN KEY ("sopId") REFERENCES "SOP"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

COMMIT;
