-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "photoUrl" TEXT;

-- CreateTable
CREATE TABLE "RoleSupervision" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleSupervision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoleSupervision_roleId_supervisorId_key" ON "RoleSupervision"("roleId", "supervisorId");

-- AddForeignKey
ALTER TABLE "RoleSupervision" ADD CONSTRAINT "RoleSupervision_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleSupervision" ADD CONSTRAINT "RoleSupervision_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
