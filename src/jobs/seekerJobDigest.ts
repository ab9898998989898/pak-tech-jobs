import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { ensureUnsubscribeToken } from "@/lib/emailPreferences";
import {
  decideSeekerDigest,
  hasEmptyProfile,
  matchesJobAlert,
  matchesSeekerProfile,
  selectUnseenJobs,
  type AlertMatchableJob,
  type SeekerProfile,
} from "@/lib/reengagement";
import {
  seekerDigestSubject,
  seekerJobDigestEmail,
  type DigestJob,
  type MatchBasis,
} from "@/lib/reengagementEmails";

/**
 * Daily digest telling job seekers about newly posted roles.
 *
 * Match precedence per seeker:
 *   1. their active JobAlert(s), if any
 *   2. otherwise their profile — skills and target roles
 *   3. otherwise every new job
 *
 * A seeker is never shown the same listing twice: prior sends (both this digest
 * and the weekly newsletter) record the job ids they covered, and those are
 * filtered out. That also means a skipped day loses nothing — the job simply
 * appears in the next digest.
 */

const SEND_INTERVAL_MS = 600;
/** Wide enough that a missed run doesn't drop jobs; the per-seeker dedupe does the real work. */
const NEW_JOB_LOOKBACK_DAYS = 7;
const DEDUPE_LOOKBACK_DAYS = 30;
const MAX_JOBS_PER_EMAIL = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SeekerDigestResult {
  scanned: number;
  newJobsInPool: number;
  sent: number;
  failed: number;
  byBasis: Record<MatchBasis, number>;
  skipped: { optedOut: number; recentlyEmailed: number; noMatches: number };
}

/** Reads the jobIds recorded on prior digest sends. Tolerates legacy/absent metadata. */
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

export async function runSeekerJobDigest(
  now: Date = new Date()
): Promise<SeekerDigestResult> {
  const since = new Date(
    now.getTime() - NEW_JOB_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  const newJobs = await prisma.jobPost.findMany({
    where: { isActive: true, isClosed: false, createdAt: { gte: since } },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      description: true,
      skills: true,
      city: true,
      jobType: true,
      experienceLevel: true,
      salaryMin: true,
      salaryMax: true,
      recruiter: { select: { name: true, companyName: true } },
    },
  });

  const result: SeekerDigestResult = {
    scanned: 0,
    newJobsInPool: newJobs.length,
    sent: 0,
    failed: 0,
    byBasis: { alert: 0, profile: 0, all: 0 },
    skipped: { optedOut: 0, recentlyEmailed: 0, noMatches: 0 },
  };

  if (newJobs.length === 0) return result;

  const pool: (AlertMatchableJob & DigestJob)[] = newJobs.map((job) => ({
    id: job.id,
    title: job.title,
    description: job.description,
    skills: job.skills,
    city: job.city,
    jobType: job.jobType,
    experienceLevel: job.experienceLevel,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    companyLabel: job.recruiter.companyName || job.recruiter.name,
  }));

  const dedupeSince = new Date(
    now.getTime() - DEDUPE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  const seekers = await prisma.user.findMany({
    where: { role: "APPLICANT", suspended: false },
    select: {
      id: true,
      name: true,
      email: true,
      skills: true,
      targetRoles: true,
      location: true,
      marketingEmailsEnabled: true,
      jobAlerts: {
        where: { isActive: true },
        select: {
          keywords: true,
          city: true,
          jobType: true,
          experienceLevel: true,
          salaryMin: true,
        },
      },
      emailLogs: {
        where: {
          campaign: { in: ["SEEKER_JOB_DIGEST", "SEEKER_WEEKLY_NEWSLETTER"] },
          sentAt: { gte: dedupeSince },
        },
        select: { sentAt: true, metadata: true },
      },
    },
  });

  result.scanned = seekers.length;

  for (const seeker of seekers) {
    const decision = decideSeekerDigest(
      {
        marketingEmailsEnabled: seeker.marketingEmailsEnabled,
        priorDigestSentAt: seeker.emailLogs.map((log) => log.sentAt),
      },
      now
    );

    if (!decision.send) {
      if (decision.reason === "opted_out") result.skipped.optedOut++;
      else result.skipped.recentlyEmailed++;
      continue;
    }

    const profile: SeekerProfile = {
      skills: seeker.skills,
      targetRoles: seeker.targetRoles,
      location: seeker.location,
    };

    let basis: MatchBasis;
    let matched: (AlertMatchableJob & DigestJob)[];

    if (seeker.jobAlerts.length > 0) {
      basis = "alert";
      matched = pool.filter((job) =>
        seeker.jobAlerts.some((alert) => matchesJobAlert(job, alert))
      );
    } else if (!hasEmptyProfile(profile)) {
      basis = "profile";
      matched = pool.filter((job) => matchesSeekerProfile(job, profile));
    } else {
      basis = "all";
      matched = pool;
    }

    // A seeker whose alert or profile matches nothing new still deserves to
    // hear the board is active, so fall back to everything rather than silence.
    if (matched.length === 0) {
      basis = "all";
      matched = pool;
    }

    const jobs = selectUnseenJobs(
      matched,
      emailedJobIds(seeker.emailLogs),
      MAX_JOBS_PER_EMAIL
    );

    if (jobs.length === 0) {
      result.skipped.noMatches++;
      continue;
    }

    try {
      const token = await ensureUnsubscribeToken(seeker.id);
      const subject = seekerDigestSubject(jobs);
      const html = seekerJobDigestEmail({
        seekerName: seeker.name,
        jobs,
        matchBasis: basis,
        unsubscribeToken: token,
      });

      const ok = await sendEmail({ to: seeker.email, subject, html });
      if (!ok) {
        result.failed++;
        continue;
      }

      await prisma.emailLog.create({
        data: {
          userId: seeker.id,
          recipient: seeker.email,
          campaign: "SEEKER_JOB_DIGEST",
          subject,
          sequenceStep: 1,
          metadata: { jobIds: jobs.map((j) => j.id), matchBasis: basis },
        },
      });

      result.sent++;
      result.byBasis[basis]++;
    } catch (error) {
      console.error(`[seeker-digest] failed for ${seeker.id}:`, error);
      result.failed++;
    }

    await sleep(SEND_INTERVAL_MS);
  }

  return result;
}
