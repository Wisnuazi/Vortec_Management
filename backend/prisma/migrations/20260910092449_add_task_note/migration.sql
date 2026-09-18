-- Add a free-text "note" column to Task for the assigned-role team to
-- record observations, blockers, and updates. PM/OM/Director can also
-- write it. Default empty string keeps existing rows valid without
-- backfill.
--
-- This is the structural change required by the "engineer can add notes
-- + subtasks + attachments, but cannot edit target dates" permission
-- model request.
ALTER TABLE "Task" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
