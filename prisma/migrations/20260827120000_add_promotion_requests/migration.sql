-- CreateEnum
CREATE TYPE "PromotionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PROMOTION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'PROMOTION_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'PROMOTION_DECLINED';

-- CreateTable
CREATE TABLE "PromotionRequest" (
    "id" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "status" "PromotionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,

    CONSTRAINT "PromotionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromotionRequest_status_createdAt_idx" ON "PromotionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PromotionRequest_jobPostId_idx" ON "PromotionRequest"("jobPostId");

-- CreateIndex
CREATE INDEX "PromotionRequest_recruiterId_idx" ON "PromotionRequest"("recruiterId");

-- Only one open request per job. Enforced in the API too, but a partial unique
-- index closes the race where two concurrent requests both pass the check.
-- Prisma's schema language cannot express a partial unique index, so it lives here.
CREATE UNIQUE INDEX "PromotionRequest_one_pending_per_job"
    ON "PromotionRequest"("jobPostId")
    WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
