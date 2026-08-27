import { emailFooter } from "@/lib/emailPreferences";

/**
 * HTML bodies for the three re-engagement campaigns.
 *
 * Kept separate from `email.ts` (which holds transactional templates) so the
 * two concerns stay independently readable. Sending still goes through
 * `sendEmail()` from `email.ts` — this module only builds strings.
 */

const SITE_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://www.paktechjobs.com";

const BRAND = "#10b981";

/**
 * Job titles and company names are user-supplied and end up in someone else's
 * inbox, so they are escaped rather than interpolated raw.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(inner: string, token: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827">
      ${inner}
      ${emailFooter(token)}
    </div>
  `;
}

function cta(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:${BRAND};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${label}</a>`;
}

// ─── 1. Lapsed poster ────────────────────────────────────────────────────────

export interface LapsedRecruiterEmailOpts {
  recruiterName: string;
  daysSinceLastPost: number;
  lastJobTitle: string | null;
  /** 1, 2 or 3 — later steps get progressively shorter copy. */
  sequenceStep: number;
  unsubscribeToken: string;
}

export function lapsedRecruiterSubject(opts: {
  daysSinceLastPost: number;
  sequenceStep: number;
}): string {
  if (opts.sequenceStep === 1) {
    return `It's been ${opts.daysSinceLastPost} days since your last job post`;
  }
  if (opts.sequenceStep === 2) {
    return "Your hiring pipeline is quiet — post a role?";
  }
  return "Still hiring? Your PakTechJobs account is waiting";
}

export function lapsedRecruiterEmail(opts: LapsedRecruiterEmailOpts): string {
  const name = escapeHtml(opts.recruiterName);
  const lastJob = opts.lastJobTitle
    ? `<p style="color:#4b5563">Your last listing was <strong>${escapeHtml(
        opts.lastJobTitle
      )}</strong>.</p>`
    : "";

  const body =
    opts.sequenceStep === 1
      ? `
      <p>Hi ${name},</p>
      <p>It's been <strong>${opts.daysSinceLastPost} days</strong> since you last posted a role on PakTechJobs.</p>
      ${lastJob}
      <p>Candidates check the board daily — a fresh listing puts you back in front of them. Posting takes about two minutes.</p>
    `
      : opts.sequenceStep === 2
      ? `
      <p>Hi ${name},</p>
      <p>Your last post went up ${opts.daysSinceLastPost} days ago. If you're still hiring, now's a good time to add a role.</p>
      ${lastJob}
    `
      : `
      <p>Hi ${name},</p>
      <p>We haven't seen a new listing from you in ${opts.daysSinceLastPost} days. This is the last reminder we'll send — post a role any time and we'll get it in front of Pakistan's tech talent.</p>
    `;

  return shell(
    `
      <h2 style="color:${BRAND};margin-top:0">Ready to post your next role?</h2>
      ${body}
      ${cta(`${SITE_URL}/recruiter/jobs/new`, "Post a Job")}
    `,
    opts.unsubscribeToken
  );
}

// ─── 2. Never posted ─────────────────────────────────────────────────────────

export interface NeverPostedRecruiterEmailOpts {
  recruiterName: string;
  daysSinceSignup: number;
  sequenceStep: number;
  unsubscribeToken: string;
}

export function neverPostedRecruiterSubject(opts: {
  sequenceStep: number;
}): string {
  if (opts.sequenceStep === 1) return "Let's get your first job posted";
  if (opts.sequenceStep === 2) return "Your PakTechJobs account has no listings yet";
  return "Last nudge: post your first role on PakTechJobs";
}

export function neverPostedRecruiterEmail(
  opts: NeverPostedRecruiterEmailOpts
): string {
  const name = escapeHtml(opts.recruiterName);

  const body =
    opts.sequenceStep === 1
      ? `
      <p>Hi ${name},</p>
      <p>Thanks for signing up to PakTechJobs. You haven't posted a role yet — let's fix that.</p>
      <p>Once your first listing is live, applicants start landing in your dashboard where you can shortlist, message and schedule interviews without leaving the platform.</p>
      <ul style="color:#4b5563;line-height:1.8;padding-left:20px">
        <li>Posting is free and takes about two minutes</li>
        <li>Your listing reaches Pakistani developers actively looking</li>
        <li>Applications arrive structured — no CV inbox chaos</li>
      </ul>
    `
      : opts.sequenceStep === 2
      ? `
      <p>Hi ${name},</p>
      <p>You created your account ${opts.daysSinceSignup} days ago but haven't posted a role yet. If you're hiring, your first listing is a couple of minutes away — and you'll start seeing applicants right after.</p>
    `
      : `
      <p>Hi ${name},</p>
      <p>This is the last reminder we'll send. Your account is set up and ready whenever you want to post a role — nothing expires.</p>
    `;

  return shell(
    `
      <h2 style="color:${BRAND};margin-top:0">You're set up — now let's see some applicants</h2>
      ${body}
      ${cta(`${SITE_URL}/recruiter/jobs/new`, "Post Your First Job")}
    `,
    opts.unsubscribeToken
  );
}

// ─── 3. Seeker new-jobs digest ───────────────────────────────────────────────

export interface DigestJob {
  id: string;
  title: string;
  city: string;
  salaryMin: number;
  salaryMax: number;
  companyLabel: string;
}

export type MatchBasis = "alert" | "profile" | "all";

export interface SeekerDigestEmailOpts {
  seekerName: string;
  jobs: DigestJob[];
  matchBasis: MatchBasis;
  unsubscribeToken: string;
}

export function seekerDigestSubject(jobs: DigestJob[]): string {
  if (jobs.length === 1) return `New job: ${jobs[0].title}`;
  return `${jobs.length} new tech jobs posted on PakTechJobs`;
}

export function seekerJobDigestEmail(opts: SeekerDigestEmailOpts): string {
  const name = escapeHtml(opts.seekerName);

  const intro =
    opts.matchBasis === "alert"
      ? "Here are new roles matching your job alert:"
      : opts.matchBasis === "profile"
      ? "Here are new roles matching your skills and target roles:"
      : "Here's what went live on PakTechJobs since yesterday:";

  const rows = opts.jobs
    .map(
      (job) => `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #e5e7eb">
          <a href="${SITE_URL}/jobs/${encodeURIComponent(
        job.id
      )}" style="font-weight:600;color:${BRAND};text-decoration:none;font-size:15px">${escapeHtml(
        job.title
      )}</a><br>
          <span style="color:#6b7280;font-size:13px">${escapeHtml(
            job.companyLabel
          )} &middot; ${escapeHtml(
        job.city
      )} &middot; PKR ${job.salaryMin.toLocaleString()}&ndash;${job.salaryMax.toLocaleString()}</span>
        </td>
      </tr>
    `
    )
    .join("");

  const tuneProfile =
    opts.matchBasis === "all"
      ? `<p style="color:#6b7280;font-size:13px;margin-top:16px">Want a tighter match? <a href="${SITE_URL}/dashboard/job-alerts" style="color:${BRAND}">Set up a job alert</a> and we'll only send roles that fit.</p>`
      : "";

  return shell(
    `
      <h2 style="color:${BRAND};margin-top:0">${opts.jobs.length} new job${
      opts.jobs.length > 1 ? "s" : ""
    } to apply for</h2>
      <p>Hi ${name},</p>
      <p>${intro}</p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      ${cta(`${SITE_URL}/jobs`, "Browse All Jobs")}
      ${tuneProfile}
    `,
    opts.unsubscribeToken
  );
}
