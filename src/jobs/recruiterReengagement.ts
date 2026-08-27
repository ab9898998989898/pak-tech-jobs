import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { ensureUnsubscribeToken } from "@/lib/emailPreferences";
import {
  decideRecruiterSend,
  type RecruiterActivity,
  type SendDecision,
} from "@/lib/reengagement";
import {
  lapsedRecruiterEmail,
  lapsedRecruiterSubject,
  neverPostedRecruiterEmail,
  neverPostedRecruiterSubject,
} from "@/lib/reengagementEmails";

/**
 * Daily sweep that emails the two dormant recruiter segments.
 *
 * Segmentation and send-eligibility rules live in `@/lib/reengagement` as pure
 * functions; this module is only the DB query, the send loop and the logging.
 */

/** Resend's default rate limit is 2 requests/second — stay comfortably under it. */
const SEND_INTERVAL_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ReengagementResult {
  scanned: number;
  sent: number;
  failed: number;
  bySegment: { lapsed: number; neverPosted: number };
  /** Counts of why recruiters were skipped — useful when the run sends nothing. */
  skipped: Record<SendDecision["reason"], number>;
}

export async function runRecruiterReengagement(
  now: Date = new Date()
): Promise<ReengagementResult> {
  const recruiters = await prisma.user.findMany({
    where: {
      role: "RECRUITER",
      suspended: false,
      // Unverified recruiters are still pending admin approval — nudging them to
      // post a job they cannot post yet would be a dead end.
      recruiterVerified: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      marketingEmailsEnabled: true,
      jobPosts: {
        select: { createdAt: true, title: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: { select: { jobPosts: true } },
      emailLogs: {
        where: {
          campaign: { in: ["RECRUITER_LAPSED", "RECRUITER_NEVER_POSTED"] },
        },
        select: { sentAt: true },
      },
    },
  });

  const result: ReengagementResult = {
    scanned: recruiters.length,
    sent: 0,
    failed: 0,
    bySegment: { lapsed: 0, neverPosted: 0 },
    skipped: {
      due: 0,
      opted_out: 0,
      active: 0,
      sequence_complete: 0,
      not_yet_due: 0,
      min_gap_not_elapsed: 0,
    },
  };

  for (const recruiter of recruiters) {
    const lastPost = recruiter.jobPosts[0] ?? null;

    const activity: RecruiterActivity = {
      accountCreatedAt: recruiter.createdAt,
      lastPostAt: lastPost?.createdAt ?? null,
      postCount: recruiter._count.jobPosts,
      priorSendsAt: recruiter.emailLogs.map((log) => log.sentAt),
      marketingEmailsEnabled: recruiter.marketingEmailsEnabled,
    };

    const decision = decideRecruiterSend(activity, now);
    if (!decision.send || !decision.campaign) {
      result.skipped[decision.reason]++;
      continue;
    }

    const wholeDays = Math.floor(decision.daysSinceAnchor);

    try {
      const token = await ensureUnsubscribeToken(recruiter.id);

      const isLapsed = decision.campaign === "RECRUITER_LAPSED";
      const subject = isLapsed
        ? lapsedRecruiterSubject({
            daysSinceLastPost: wholeDays,
            sequenceStep: decision.sequenceStep,
          })
        : neverPostedRecruiterSubject({ sequenceStep: decision.sequenceStep });

      const html = isLapsed
        ? lapsedRecruiterEmail({
            recruiterName: recruiter.name,
            daysSinceLastPost: wholeDays,
            lastJobTitle: lastPost?.title ?? null,
            sequenceStep: decision.sequenceStep,
            unsubscribeToken: token,
          })
        : neverPostedRecruiterEmail({
            recruiterName: recruiter.name,
            daysSinceSignup: wholeDays,
            sequenceStep: decision.sequenceStep,
            unsubscribeToken: token,
          });

      const ok = await sendEmail({ to: recruiter.email, subject, html });

      if (!ok) {
        result.failed++;
        continue;
      }

      // Written only after a confirmed send, so the log — and therefore the
      // duplicate guard and the admin dashboard — reflects reality.
      await prisma.emailLog.create({
        data: {
          userId: recruiter.id,
          recipient: recruiter.email,
          campaign: decision.campaign,
          subject,
          sequenceStep: decision.sequenceStep,
          metadata: {
            daysSinceAnchor: wholeDays,
            postCount: activity.postCount,
          },
        },
      });

      result.sent++;
      if (isLapsed) result.bySegment.lapsed++;
      else result.bySegment.neverPosted++;
    } catch (error) {
      console.error(
        `[recruiter-reengagement] failed for ${recruiter.id}:`,
        error
      );
      result.failed++;
    }

    await sleep(SEND_INTERVAL_MS);
  }

  return result;
}
