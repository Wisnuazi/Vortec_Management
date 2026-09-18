/*
  Warnings:

  - You are about to drop the column `realizationAmount` on the `Kasbon` table. All the data in the column will be lost.
  - Added the required column `division` to the `Kasbon` table without a default value. This is not possible if the table is not empty.
  - Added the required column `period` to the `Kasbon` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "KasbonReason" AS ENUM ('DEVELOPMENT', 'PRODUCTION', 'OPERATION', 'TOOLS_ASSET');

-- AlterTable
ALTER TABLE "Kasbon" DROP COLUMN "realizationAmount",
ADD COLUMN     "division" TEXT NOT NULL,
ADD COLUMN     "period" TEXT NOT NULL,
ADD COLUMN     "phase" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "KasbonItem" (
    "id" TEXT NOT NULL,
    "kasbonId" TEXT NOT NULL,
    "reason" "KasbonReason" NOT NULL,
    "item" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "link" TEXT NOT NULL DEFAULT '',
    "purchaseDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KasbonItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kasbon_period_idx" ON "Kasbon"("period");

-- AddForeignKey
ALTER TABLE "KasbonItem" ADD CONSTRAINT "KasbonItem_kasbonId_fkey" FOREIGN KEY ("kasbonId") REFERENCES "Kasbon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
