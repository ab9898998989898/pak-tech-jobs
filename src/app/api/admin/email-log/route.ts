import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { EmailCampaign } from "@prisma/client";
import { computeConversions } from "@/lib/reengagement";

/**
 * GET /api/admin/email-log?campaign=&windowDays=7&limit=100
 *
 * Powers the admin "Emails" tab: what went out, to whom, when — and for the
 * recruiter campaigns, how many recipients posted a job within the window.
 */

const RECRUITER_CAMPAIGNS: EmailCampaign[] = [
  "RECRUITER_LAPSED",
  "RECRUITER_NEVER_POSTED",
];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;

  const campaignParam = searchParams.get("campaign");
  const campaign =
    campaignParam && Object.values(EmailCampaign).includes(campaignParam as EmailCampaign)
      ? (campaignParam as EmailCampaign)
      : undefined;

  const windowDays = Math.min(
    90,
    Math.max(1, parseInt(searchParams.get("windowDays") ?? "7", 10) || 7)
  );
  const limit = Math.min(
    500,
    Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100)
  );

  const [rows, grouped, unsubscribed] = await Promise.all([
    prisma.emailLog.findMany({
      where: campaign ? { campaign } : undefined,
      orderBy: { sentAt: "desc" },
      take: limit,
      select: {
        id: true,
        recipient: true,
        campaign: true,
        subject: true,
        sequenceStep: true,
        sentAt: true,
        user: {
          select: { id: true, name: true, role: true, companyName: true },
        },
      },
    }),
    prisma.emailLog.groupBy({
      by: ["campaign"],
      _count: { _all: true },
    }),
    prisma.user.count({ where: { marketingEmailsEnabled: false } }),
  ]);

  // Conversion: recipients of each recruiter campaign who then posted a job
  // within `windowDays`.
  const recruiterSends = await prisma.emailLog.findMany({
    where: { campaign: { in: RECRUITER_CAMPAIGNS } },
    select: { userId: true, sentAt: true, campaign: true },
  });

  const recipientIds = [...new Set(recruiterSends.map((s) => s.userId))];
  const posts = recipientIds.length
    ? await prisma.jobPost.findMany({
        where: { recruiterId: { in: recipientIds } },
        select: { recruiterId: true, createdAt: true },
      })
    : [];

  const conversions = Object.fromEntries(
    RECRUITER_CAMPAIGNS.map((c) => [
      c,
      computeConversions(
        {
          sends: recruiterSends
            .filter((s) => s.campaign === c)
            .map((s) => ({ userId: s.userId, sentAt: s.sentAt })),
          posts,
        },
        windowDays
      ),
    ])
  );

  const totals = Object.fromEntries(
    Object.values(EmailCampaign).map((c) => [
      c,
      grouped.find((g) => g.campaign === c)?._count._all ?? 0,
    ])
  );

  return NextResponse.json({
    windowDays,
    totals,
    conversions,
    unsubscribed,
    rows,
  });
}
