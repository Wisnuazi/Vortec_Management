-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'id',
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'system';
