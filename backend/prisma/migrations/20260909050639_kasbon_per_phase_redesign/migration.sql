/*
  Warnings:

  - You are about to drop the column `kasbonId` on the `KasbonItem` table. All the data in the column will be lost.
  - You are about to drop the `Kasbon` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `phaseId` to the `KasbonItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `KasbonItem` table without a default value. This is not possible if the table is not empty.
  - Made the column `purchaseDate` on table `KasbonItem` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "KasbonPhaseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "Kasbon" DROP CONSTRAINT "Kasbon_requestedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Kasbon" DROP CONSTRAINT "Kasbon_reviewedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "KasbonItem" DROP CONSTRAINT "KasbonItem_kasbonId_fkey";

-- AlterTable
ALTER TABLE "KasbonItem" DROP COLUMN "kasbonId",
ADD COLUMN     "itemPhotoUrl" TEXT,
ADD COLUMN     "phaseId" TEXT NOT NULL,
ADD COLUMN     "receiptPhotoUrl" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "purchaseDate" SET NOT NULL;

-- DropTable
DROP TABLE "Kasbon";

-- DropEnum
DROP TYPE "KasbonStatus";

-- CreateTable
CREATE TABLE "KasbonPhase" (
    "id" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "phase" INTEGER NOT NULL DEFAULT 1,
    "status" "KasbonPhaseStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KasbonPhase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KasbonPhase_period_idx" ON "KasbonPhase"("period");

-- CreateIndex
CREATE UNIQUE INDEX "KasbonPhase_requestedByUserId_division_period_phase_key" ON "KasbonPhase"("requestedByUserId", "division", "period", "phase");

-- AddForeignKey
ALTER TABLE "KasbonPhase" ADD CONSTRAINT "KasbonPhase_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KasbonPhase" ADD CONSTRAINT "KasbonPhase_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KasbonItem" ADD CONSTRAINT "KasbonItem_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "KasbonPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
