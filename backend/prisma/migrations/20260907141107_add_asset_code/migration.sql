-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Asset_code_key" ON "Asset"("code");
