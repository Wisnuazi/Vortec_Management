-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('FILE', 'LINK');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "kind" "AttachmentKind" NOT NULL DEFAULT 'FILE';
ALTER TABLE "Attachment" ADD COLUMN "url" TEXT;
ALTER TABLE "Attachment" ALTER COLUMN "dataUrl" DROP NOT NULL;
ALTER TABLE "Attachment" ALTER COLUMN "mimeType" SET DEFAULT '';
ALTER TABLE "Attachment" ALTER COLUMN "fileSize" SET DEFAULT 0;
