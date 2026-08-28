-- CreateEnum
CREATE TYPE "PlanEnquiryKind" AS ENUM ('PREMIUM', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "PlanEnquiryStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
ALTER TYPE "PromotionRequestStatus" ADD VALUE 'INVOICED' BEFORE 'APPROVED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PROMOTION_INVOICED';
ALTER TYPE "NotificationType" ADD VALUE 'RECRUITER_REGISTERED';
ALTER TYPE "NotificationType" ADD VALUE 'SALARY_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'PLAN_ENQUIRY';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_EXPIRED';

-- AlterTable
ALTER TABLE "PromotionRequest" ADD COLUMN     "packageDays" INTEGER,
ADD COLUMN     "amountPkr" INTEGER,
ADD COLUMN     "invoiceRef" TEXT,
ADD COLUMN     "invoicedAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRequest_invoiceRef_key" ON "PromotionRequest"("invoiceRef");

-- The one-open-request-per-job guard must also cover INVOICED, otherwise a
-- recruiter could raise a second request while an invoice is outstanding.
DROP INDEX IF EXISTS "PromotionRequest_one_pending_per_job";
CREATE UNIQUE INDEX "PromotionRequest_one_open_per_job"
    ON "PromotionRequest"("jobPostId")
    WHERE "status" IN ('PENDING', 'INVOICED');

-- CreateTable
CREATE TABLE "PlanEnquiry" (
    "id" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "kind" "PlanEnquiryKind" NOT NULL,
    "message" TEXT,
    "status" "PlanEnquiryStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,

    CONSTRAINT "PlanEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanEnquiry_status_createdAt_idx" ON "PlanEnquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PlanEnquiry_recruiterId_idx" ON "PlanEnquiry"("recruiterId");

-- AddForeignKey
ALTER TABLE "PlanEnquiry" ADD CONSTRAINT "PlanEnquiry_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
