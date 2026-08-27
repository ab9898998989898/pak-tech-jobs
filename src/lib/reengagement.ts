/**
 * Pure segmentation and send-eligibility logic for the re-engagement email system.
 *
 * Deliberately free of Prisma / DB imports so the rules can be property-tested
 * in isolation, matching the pattern in `jobFilters.ts` and `demandClassification.ts`.
 * The DB query + send loop lives in `src/jobs/recruiterReengagement.ts` and
 * `src/jobs/seekerJobDigest.ts`.
 */

export type EmailCampaignName =
  | "RECRUITER_LAPSED"
  | "RECRUITER_NEVER_POSTED"
  | "SEEKER_JOB_DIGEST"
  | "SEEKER_WEEKLY_NEWSLETTER";

export type RecruiterSegment = "LAPSED" | "NEVER_POSTED" | "ACTIVE";

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** A recruiter is "lapsed" once this many days have passed since their last post. */
export const LAPSED_THRESHOLD_DAYS = 7;

/**
 * Days-since-anchor at which nudge 1, 2 and 3 become due.
 * The sequence is capped at 3 — after that the recruiter is left alone until
 * they post again (which resets the sequence).
 */
export const LAPSED_SCHEDULE_DAYS = [7, 14, 28] as const;
export const NEVER_POSTED_SCHEDULE_DAYS = [3, 10, 24] as const;

export const MAX_SEQUENCE_STEPS = 3;

/**
 * Hard floor between two sends of the same campaign to the same person.
 * Belt-and-braces: guarantees the "once per 7-day window" rule holds even if
 * the cron double-fires or the schedule above is retuned to something tighter.
 */
export const MIN_GAP_DAYS = 7;

/** A seeker receives at most one digest per day, across all digest campaigns. */
export const SEEKER_DIGEST_MIN_GAP_HOURS = 20;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Whole and fractional days from `from` to `to`. Negative if `to` precedes `from`. */
export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_HOUR;
}

function latest(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

// ─── Recruiter segmentation ──────────────────────────────────────────────────

export interface RecruiterActivity {
  /** When the recruiter account was created. */
  accountCreatedAt: Date;
  /** createdAt of their most recent job post, or null if they have never posted. */
  lastPostAt: Date | null;
  /** Total job posts, ever. */
  postCount: number;
  /** sentAt of every prior send of the campaign being considered. Order-independent. */
  priorSendsAt: Date[];
  /** False when the user has unsubscribed from automated re-engagement mail. */
  marketingEmailsEnabled: boolean;
}

/**
 * Which of the three groups this recruiter falls into right now.
 *
 * - NEVER_POSTED — created an account, zero job posts ever
 * - LAPSED       — has posted before, but the most recent post is >7 days old
 * - ACTIVE       — posted within the last 7 days; leave them alone
 */
export function classifyRecruiter(
  activity: Pick<RecruiterActivity, "postCount" | "lastPostAt">,
  now: Date
): RecruiterSegment {
  if (activity.postCount <= 0 || activity.lastPostAt === null) {
    return "NEVER_POSTED";
  }
  return daysBetween(activity.lastPostAt, now) >= LAPSED_THRESHOLD_DAYS
    ? "LAPSED"
    : "ACTIVE";
}

export interface SendDecision {
  send: boolean;
  campaign: EmailCampaignName | null;
  /** 1-based position in the nudge sequence. 0 when nothing is being sent. */
  sequenceStep: number;
  /** Days since the anchor event (last post, or signup for never-posted). */
  daysSinceAnchor: number;
  /** Machine-readable explanation — surfaced in cron output for observability. */
  reason:
    | "due"
    | "opted_out"
    | "active"
    | "sequence_complete"
    | "not_yet_due"
    | "min_gap_not_elapsed";
}

const NO_SEND = (
  reason: SendDecision["reason"],
  daysSinceAnchor: number
): SendDecision => ({
  send: false,
  campaign: null,
  sequenceStep: 0,
  daysSinceAnchor,
  reason,
});

/**
 * Decides whether this recruiter should receive a re-engagement email right now,
 * and if so which one and at which step of the sequence.
 *
 * Sequence reset: for LAPSED recruiters only sends that happened *after* their
 * most recent post are counted, so posting a job naturally resets them to step 1
 * the next time they lapse. NEVER_POSTED recruiters are anchored to signup, so
 * every prior send counts — and posting removes them from the segment entirely.
 */
export function decideRecruiterSend(
  activity: RecruiterActivity,
  now: Date
): SendDecision {
  if (!activity.marketingEmailsEnabled) return NO_SEND("opted_out", 0);

  const segment = classifyRecruiter(activity, now);
  if (segment === "ACTIVE") {
    return NO_SEND("active", daysBetween(activity.lastPostAt!, now));
  }

  const isLapsed = segment === "LAPSED";
  const anchor = isLapsed ? activity.lastPostAt! : activity.accountCreatedAt;
  const schedule = isLapsed ? LAPSED_SCHEDULE_DAYS : NEVER_POSTED_SCHEDULE_DAYS;
  const campaign: EmailCampaignName = isLapsed
    ? "RECRUITER_LAPSED"
    : "RECRUITER_NEVER_POSTED";

  const daysSinceAnchor = daysBetween(anchor, now);

  // Only sends after the anchor count — this is what makes posting reset the sequence.
  const relevantSends = activity.priorSendsAt.filter(
    (d) => d.getTime() > anchor.getTime()
  );

  const sequenceStep = relevantSends.length + 1;
  if (sequenceStep > MAX_SEQUENCE_STEPS) {
    return NO_SEND("sequence_complete", daysSinceAnchor);
  }

  if (daysSinceAnchor < schedule[sequenceStep - 1]) {
    return NO_SEND("not_yet_due", daysSinceAnchor);
  }

  const lastSend = latest(relevantSends);
  if (lastSend && daysBetween(lastSend, now) < MIN_GAP_DAYS) {
    return NO_SEND("min_gap_not_elapsed", daysSinceAnchor);
  }

  return { send: true, campaign, sequenceStep, daysSinceAnchor, reason: "due" };
}

// ─── Seeker digest ───────────────────────────────────────────────────────────

export interface SeekerDigestActivity {
  marketingEmailsEnabled: boolean;
  /**
   * sentAt of every prior digest — both the daily digest and the weekly
   * newsletter — so the two pipelines can't stack on the same day.
   */
  priorDigestSentAt: Date[];
}

export interface SeekerDigestDecision {
  send: boolean;
  reason: "due" | "opted_out" | "min_gap_not_elapsed";
}

export function decideSeekerDigest(
  activity: SeekerDigestActivity,
  now: Date
): SeekerDigestDecision {
  if (!activity.marketingEmailsEnabled) {
    return { send: false, reason: "opted_out" };
  }
  const lastSend = latest(activity.priorDigestSentAt);
  if (lastSend && hoursBetween(lastSend, now) < SEEKER_DIGEST_MIN_GAP_HOURS) {
    return { send: false, reason: "min_gap_not_elapsed" };
  }
  return { send: true, reason: "due" };
}

// ─── Seeker job matching (fallback path) ─────────────────────────────────────

export interface SeekerProfile {
  skills: string[];
  targetRoles: string[];
  location: string | null;
}

export interface MatchableJob {
  title: string;
  skills: string[];
  city: string;
  description: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Profile-based match used for seekers who have not configured a JobAlert.
 *
 * A job matches when any of the seeker's skills appears in the job's skill tags
 * or title, or when any target role appears in the title. Location alone never
 * qualifies a job — it would match every listing in Karachi.
 */
export function matchesSeekerProfile(
  job: MatchableJob,
  profile: SeekerProfile
): boolean {
  const jobSkills = new Set(job.skills.map(norm));
  const title = norm(job.title);

  const skillHit = profile.skills.some(
    (s) => s.trim() !== "" && (jobSkills.has(norm(s)) || title.includes(norm(s)))
  );
  if (skillHit) return true;

  return profile.targetRoles.some(
    (r) => r.trim() !== "" && title.includes(norm(r))
  );
}

export interface AlertCriteria {
  keywords: string[];
  city: string | null;
  jobType: string | null;
  experienceLevel: string | null;
  salaryMin: number | null;
}

export interface AlertMatchableJob extends MatchableJob {
  jobType: string;
  experienceLevel: string;
  salaryMin: number;
}

/**
 * Mirrors the JobAlert filter used by the weekly newsletter, but as an in-memory
 * predicate. The daily digest pulls one pool of recent jobs and filters it per
 * seeker, rather than issuing a query per alert.
 *
 * An alert with no keywords matches on its structural filters alone.
 */
export function matchesJobAlert(
  job: AlertMatchableJob,
  alert: AlertCriteria
): boolean {
  const keywords = alert.keywords.filter((k) => k.trim() !== "");
  if (keywords.length > 0) {
    const haystack = `${norm(job.title)} ${norm(job.description)}`;
    const jobSkills = new Set(job.skills.map(norm));
    const hit = keywords.some(
      (kw) => haystack.includes(norm(kw)) || jobSkills.has(norm(kw))
    );
    if (!hit) return false;
  }

  if (alert.city && !norm(job.city).includes(norm(alert.city))) return false;
  if (alert.jobType && job.jobType !== alert.jobType) return false;
  if (alert.experienceLevel && job.experienceLevel !== alert.experienceLevel) {
    return false;
  }
  if (alert.salaryMin !== null && job.salaryMin < alert.salaryMin) return false;

  return true;
}

/** True when the seeker has given us nothing to match on. */
export function hasEmptyProfile(profile: SeekerProfile): boolean {
  const nonBlank = (arr: string[]) => arr.some((s) => s.trim() !== "");
  return !nonBlank(profile.skills) && !nonBlank(profile.targetRoles);
}

// ─── Conversion tracking ─────────────────────────────────────────────────────

export interface ConversionInput {
  /** One entry per email sent, for the campaign being measured. */
  sends: { userId: string; sentAt: Date }[];
  /** createdAt of every job post by any of those users. */
  posts: { recruiterId: string; createdAt: Date }[];
}

export interface ConversionStats {
  emailsSent: number;
  recipients: number;
  /** Recipients who posted a job within the window after any email they received. */
  converted: number;
  /** converted / recipients, as a percentage rounded to one decimal. 0 when no recipients. */
  conversionRate: number;
}

/**
 * "How many recruiters who got the email then posted a job within X days?"
 *
 * A recipient counts as converted once, no matter how many nudges they received
 * — otherwise a 3-step sequence would inflate the rate threefold. Only posts
 * created strictly after an email and within the window count; a post that
 * predates every email is not attributable to it.
 */
export function computeConversions(
  input: ConversionInput,
  windowDays: number
): ConversionStats {
  const windowMs = windowDays * MS_PER_DAY;

  const postsByUser = new Map<string, number[]>();
  for (const post of input.posts) {
    const list = postsByUser.get(post.recruiterId) ?? [];
    list.push(post.createdAt.getTime());
    postsByUser.set(post.recruiterId, list);
  }

  const recipients = new Set<string>();
  const converted = new Set<string>();

  for (const send of input.sends) {
    recipients.add(send.userId);
    if (converted.has(send.userId)) continue;

    const sentAt = send.sentAt.getTime();
    const postTimes = postsByUser.get(send.userId) ?? [];
    if (postTimes.some((t) => t > sentAt && t <= sentAt + windowMs)) {
      converted.add(send.userId);
    }
  }

  const rate =
    recipients.size === 0
      ? 0
      : Math.round((converted.size / recipients.size) * 1000) / 10;

  return {
    emailsSent: input.sends.length,
    recipients: recipients.size,
    converted: converted.size,
    conversionRate: rate,
  };
}

/**
 * Drops jobs the seeker has already been emailed about, so the daily digest and
 * the weekly newsletter never show the same listing twice.
 */
export function selectUnseenJobs<T extends { id: string }>(
  candidates: T[],
  alreadyEmailedJobIds: Iterable<string>,
  limit: number
): T[] {
  const seen = new Set(alreadyEmailedJobIds);
  const out: T[] = [];
  for (const job of candidates) {
    if (seen.has(job.id)) continue;
    out.push(job);
    if (out.length >= limit) break;
  }
  return out;
}
