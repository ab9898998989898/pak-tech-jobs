import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { ensureUnsubscribeToken, emailFooter } from "@/lib/emailPreferences";
import { selectUnseenJobs } from "@/lib/reengagement";

/**
 * GET /api/cron/newsletter
 *
 * Weekly JobAlert digest. Shares the EmailLog, opt-out flag and per-job dedupe
 * with the daily seeker digest, so a seeker never sees the same listing twice
 * across the two pipelines.
 */

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DEDUPE_LOOKBACK_DAYS = 30;

function emailedJobIds(logs: { metadata: unknown }[]): string[] {
  const ids: string[] = [];
  for (const log of logs) {
    const meta = log.metadata;
    if (meta && typeof meta === "object" && "jobIds" in meta) {
      const value = (meta as { jobIds?: unknown }).jobIds;
      if (Array.isArray(value)) {
        for (const id of value) if (typeof id === "string") ids.push(id);
      }
    }
  }
  return ids;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const isAuthorized =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    cronSecret === process.env.CRON_SECRET;

  if (!process.env.CRON_SECRET || !isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dedupeSince = new Date(
    now.getTime() - DEDUPE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  const alerts = await prisma.jobAlert.findMany({
    where: {
      isActive: true,
      // Respect the re-engagement opt-out; suspended accounts get nothing.
      user: { marketingEmailsEnabled: true, suspended: false },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          emailLogs: {
            where: {
              campaign: {
                in: ["SEEKER_JOB_DIGEST", "SEEKER_WEEKLY_NEWSLETTER"],
              },
              sentAt: { gte: dedupeSince },
            },
            select: { metadata: true },
          },
        },
      },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const alert of alerts) {
    try {
      const matchingJobs = await prisma.jobPost.findMany({
        where: {
          isActive: true,
          isClosed: false,
          createdAt: { gte: sevenDaysAgo },
          ...(alert.keywords.length > 0 && {
            OR: alert.keywords.map(kw => ({
              OR: [
                { title: { contains: kw, mode: "insensitive" as const } },
                { skills: { has: kw } },
                { description: { contains: kw, mode: "insensitive" as const } },
              ],
            })),
          }),
          ...(alert.city && { city: { contains: alert.city, mode: "insensitive" as const } }),
          ...(alert.jobType && { jobType: alert.jobType }),
          ...(alert.experienceLevel && { experienceLevel: alert.experienceLevel }),
          ...(alert.salaryMin && { salaryMin: { gte: alert.salaryMin } }),
        },
        select: {
          id: true,
          title: true,
          city: true,
          jobType: true,
          salaryMin: true,
          salaryMax: true,
          recruiter: { select: { companyName: true, name: true } },
        },
        take: 25,
        orderBy: { createdAt: "desc" },
      });

      // Drop anything this seeker was already emailed by either pipeline.
      const jobs = selectUnseenJobs(
        matchingJobs,
        emailedJobIds(alert.user.emailLogs),
        10
      );

      if (jobs.length === 0) continue;

      const jobListHtml = jobs.map(job => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb">
            <a href="https://www.paktechjobs.com/jobs/${job.id}" style="font-weight:600;color:#0a66c2;text-decoration:none">${job.title}</a><br>
            <span style="color:#6b7280;font-size:13px">${job.recruiter.companyName || job.recruiter.name} &middot; ${job.city} &middot; PKR ${job.salaryMin.toLocaleString()}&ndash;${job.salaryMax.toLocaleString()}</span>
          </td>
        </tr>
      `).join("");

      const token = await ensureUnsubscribeToken(alert.user.id);

      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#0a66c2">${jobs.length} new job${jobs.length > 1 ? "s" : ""} matching your alert</h2>
          <p>Hi ${alert.user.name},</p>
          <p>Here are the latest jobs matching <strong>${alert.keywords.join(", ")}</strong>:</p>
          <table style="width:100%;border-collapse:collapse">
            ${jobListHtml}
          </table>
          <a href="https://www.paktechjobs.com/jobs?q=${encodeURIComponent(alert.keywords[0] ?? "")}"
             style="display:inline-block;margin-top:20px;padding:12px 24px;background:#0a66c2;color:white;border-radius:8px;text-decoration:none;font-weight:600">
            View All Matching Jobs
          </a>
          <p style="margin-top:16px;color:#6b7280;font-size:12px">
            <a href="https://www.paktechjobs.com/dashboard/job-alerts" style="color:#0a66c2">Manage your alerts</a>
          </p>
          ${emailFooter(token)}
        </div>
      `;

      const subject = `${jobs.length} new ${alert.keywords[0] ?? "tech"} jobs in Pakistan`;
      const ok = await sendEmail({ to: alert.user.email, subject, html });

      if (!ok) {
        failed++;
        continue;
      }

      await prisma.emailLog.create({
        data: {
          userId: alert.user.id,
          recipient: alert.user.email,
          campaign: "SEEKER_WEEKLY_NEWSLETTER",
          subject,
          sequenceStep: 1,
          metadata: { jobIds: jobs.map(j => j.id), alertId: alert.id },
        },
      });

      await prisma.jobAlert.update({
        where: { id: alert.id },
        data: { lastTriggeredAt: new Date() },
      });

      sent++;
    } catch (error) {
      console.error(`[newsletter] failed for alert ${alert.id}:`, error);
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, total: alerts.length });
}
