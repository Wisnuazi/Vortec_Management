-- DEC-065: Add workflow stage to Task and ProjectDocument.
--
-- Every task/document is tagged with the project stage (INITIATION,
-- REQUIREMENT, DESIGN, PROCUREMENT, FABRICATION, TESTING, FINAL_REVIEW,
-- RELEASED, PACKAGING) it belongs to so:
--   - The WorkflowDiagram becomes clickable as a filter
--   - The AddTask form can require an explicit stage
--   - Document Checklist can be filtered by stage
--
-- The column is nullable for backward compat with rows created before
-- DEC-065 — new code will require the field at the API surface.

BEGIN;

-- 1. Add the columns.
ALTER TABLE "ProjectDocument" ADD COLUMN "stage" "ProjectStage";
ALTER TABLE "Task" ADD COLUMN "stage" "ProjectStage";

-- 2. Backfill ProjectDocument.stage from order. The seed in
--    backend/src/routes/projects.ts:STANDARD_DOCUMENTS is indexed by
--    order so we can map order -> stage deterministically.
UPDATE "ProjectDocument" SET "stage" = CASE "order"
  WHEN 0  THEN 'REQUIREMENT'::"ProjectStage"   -- PRD
  WHEN 1  THEN 'REQUIREMENT'::"ProjectStage"   -- Project Documentation
  WHEN 2  THEN 'DESIGN'::"ProjectStage"        -- MBOM
  WHEN 3  THEN 'DESIGN'::"ProjectStage"        -- CAD FILE
  WHEN 4  THEN 'DESIGN'::"ProjectStage"        -- EBOM
  WHEN 5  THEN 'DESIGN'::"ProjectStage"        -- Schematic FILE
  WHEN 6  THEN 'FABRICATION'::"ProjectStage"   -- Assembling Documentation
  WHEN 7  THEN 'FABRICATION'::"ProjectStage"   -- Technical Spec Documentation
  WHEN 8  THEN 'DESIGN'::"ProjectStage"        -- SBOM
  WHEN 9  THEN 'FABRICATION'::"ProjectStage"   -- FE&BE Documentation
  WHEN 10 THEN 'FINAL_REVIEW'::"ProjectStage"   -- Manual Book
  WHEN 11 THEN 'PROCUREMENT'::"ProjectStage"   -- BOQ
  ELSE NULL
END;

-- 3. Backfill Task.stage from order. The seed in
--    backend/src/routes/projects.ts:STANDARD_TASKS is indexed by order.
UPDATE "Task" SET "stage" = CASE "order"
  WHEN 0  THEN 'INITIATION'::"ProjectStage"    -- Project Insight / Initial Alignment
  WHEN 1  THEN 'INITIATION'::"ProjectStage"    -- Gate 0
  WHEN 2  THEN 'REQUIREMENT'::"ProjectStage"   -- Requirement Gathering
  WHEN 3  THEN 'REQUIREMENT'::"ProjectStage"   -- PRD
  WHEN 4  THEN 'REQUIREMENT'::"ProjectStage"   -- PRD Approval
  WHEN 5  THEN 'DESIGN'::"ProjectStage"        -- Mechanical Eng
  WHEN 6  THEN 'DESIGN'::"ProjectStage"        -- Electrical Eng
  WHEN 7  THEN 'DESIGN'::"ProjectStage"        -- Software Eng
  WHEN 8  THEN 'DESIGN'::"ProjectStage"        -- Design Review
  WHEN 9  THEN 'PROCUREMENT'::"ProjectStage"   -- BOM Released
  WHEN 10 THEN 'PROCUREMENT'::"ProjectStage"   -- Purchasing: Material Readiness
  WHEN 11 THEN 'FABRICATION'::"ProjectStage"   -- Mechanical Fabrication
  WHEN 12 THEN 'FABRICATION'::"ProjectStage"   -- Electrical Fabrication
  WHEN 13 THEN 'FABRICATION'::"ProjectStage"   -- Software Development (Coding)
  WHEN 14 THEN 'FABRICATION'::"ProjectStage"   -- Hardware Assembling
  WHEN 15 THEN 'FABRICATION'::"ProjectStage"   -- Flashing Firmware
  WHEN 16 THEN 'TESTING'::"ProjectStage"       -- Functional / Verification Test
  WHEN 17 THEN 'TESTING'::"ProjectStage"       -- Field Validation
  WHEN 18 THEN 'TESTING'::"ProjectStage"       -- Product Valid?
  WHEN 19 THEN 'FINAL_REVIEW'::"ProjectStage"  -- Final Release Package
  WHEN 20 THEN 'FINAL_REVIEW'::"ProjectStage"  -- Final Approval
  WHEN 21 THEN 'RELEASED'::"ProjectStage"      -- Product Release
  WHEN 22 THEN 'PACKAGING'::"ProjectStage"     -- Packing Produk
  WHEN 23 THEN 'PACKAGING'::"ProjectStage"     -- Cek Kelengkapan Item
  ELSE NULL
END;

-- 4. Helpful indexes for the new filter ("show me everything in REQUIREMENT").
CREATE INDEX "ProjectDocument_stage_idx" ON "ProjectDocument"("stage");
CREATE INDEX "Task_stage_idx" ON "Task"("stage");

COMMIT;
