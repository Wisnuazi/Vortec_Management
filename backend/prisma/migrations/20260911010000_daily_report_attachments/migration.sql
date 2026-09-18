-- Add dailyReportId to Attachment so daily reports can carry file /
-- link attachments (DEC-060). Mirrors the existing taskId / documentId
-- / materialRequestId FK pattern — exactly one of those is set per row.
ALTER TABLE "Attachment" ADD COLUMN "dailyReportId" TEXT;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_dailyReportId_fkey"
  FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE;
CREATE INDEX "Attachment_dailyReportId_idx" ON "Attachment"("dailyReportId");
