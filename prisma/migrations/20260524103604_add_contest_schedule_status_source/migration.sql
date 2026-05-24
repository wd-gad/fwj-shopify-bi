-- AlterTable
ALTER TABLE "contest_schedules" ADD COLUMN     "source" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft';
