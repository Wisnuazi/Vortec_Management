-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "floorId" TEXT;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
