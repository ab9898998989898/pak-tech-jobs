-- CreateEnum
CREATE TYPE "EmailCampaign" AS ENUM ('RECRUITER_LAPSED', 'RECRUITER_NEVER_POSTED', 'SEEKER_JOB_DIGEST', 'SEEKER_WEEKLY_NEWSLETTER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "marketingEmailsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unsubscribeToken" TEXT;

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "campaign" "EmailCampaign" NOT NULL,
    "subject" TEXT NOT NULL,
    "sequenceStep" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_unsubscribeToken_key" ON "User"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "EmailLog_userId_campaign_sentAt_idx" ON "EmailLog"("userId", "campaign", "sentAt");

-- CreateIndex
CREATE INDEX "EmailLog_campaign_sentAt_idx" ON "EmailLog"("campaign", "sentAt");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
