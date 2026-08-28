import { escapeHtml } from "@/lib/reengagementEmails";

/**
 * Transactional mail for the promotion request flow.
 *
 * These are operational, not marketing: an admin needs to see a pending request
 * and a recruiter needs the outcome of one they raised. They therefore carry no
 * unsubscribe footer and ignore `marketingEmailsEnabled`, matching how
 * application and interview mail behaves.
 */

const SITE_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://www.paktechjobs.com";

const BRAND = "#0a66c2";

function shell(inner: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827">
      ${inner}
      <p style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">
        PakTechJobs &middot; Pakistan's Tech Job Board
      </p>
    </div>
  `;
}

function cta(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:${BRAND};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${label}</a>`;
}

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 0;color:#6b7280;font-size:13px;width:130px;vertical-align:top">${label}</td>
      <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:500">${value}</td>
    </tr>
  `;
}

export interface PromotionRequestEmailOpts {
  jobId: string;
  jobTitle: string;
  companyName: string;
  recruiterName: string;
  recruiterEmail: string;
  city: string;
  jobType: string;
  experienceLevel: string;
  salaryMin: number;
  salaryMax: number;
  applicationCount: number;
  message: string | null;
  packageLabel: string;
  amountPkr: number;
}

export function promotionRequestSubject(opts: {
  jobTitle: string;
  companyName: string;
}): string {
  return `Promotion request: ${opts.jobTitle} (${opts.companyName})`;
}

/**
 * Sent to every admin when a recruiter asks for a listing to be promoted.
 *
 * The CTA deep-links straight to the job in the admin dashboard — landing on
 * the Jobs tab, filtered and highlighted — so promoting is one further click.
 */
export function promotionRequestEmail(opts: PromotionRequestEmailOpts): string {
  const deepLink = `${SITE_URL}/admin?tab=jobs&job=${encodeURIComponent(opts.jobId)}`;

  const note = opts.message
    ? `
      <p style="margin-top:16px;color:#6b7280;font-size:13px">Note from the recruiter:</p>
      <blockquote style="margin:6px 0 0;padding:10px 14px;border-left:3px solid ${BRAND};background:#f4f7fb;color:#111827;font-size:13px">
        ${escapeHtml(opts.message)}
      </blockquote>
    `
    : "";

  return shell(`
    <h2 style="color:${BRAND};margin-top:0">Promotion requested</h2>
    <p><strong>${escapeHtml(opts.recruiterName)}</strong> at
       <strong>${escapeHtml(opts.companyName)}</strong> has asked for a listing
       to be promoted.</p>

    <table style="width:100%;border-collapse:collapse;margin-top:16px">
      ${row("Job", escapeHtml(opts.jobTitle))}
      ${row("Company", escapeHtml(opts.companyName))}
      ${row("Location", escapeHtml(opts.city))}
      ${row("Type", escapeHtml(opts.jobType))}
      ${row("Level", escapeHtml(opts.experienceLevel))}
      ${row("Salary", `PKR ${opts.salaryMin.toLocaleString()}&ndash;${opts.salaryMax.toLocaleString()}`)}
      ${row("Applications", String(opts.applicationCount))}
      ${row("Package", `${escapeHtml(opts.packageLabel)} &mdash; <strong>PKR ${opts.amountPkr.toLocaleString("en-PK")}</strong>`)}
      ${row("Requested by", `${escapeHtml(opts.recruiterName)} &lt;${escapeHtml(opts.recruiterEmail)}&gt;`)}
    </table>

    ${note}

    ${cta(deepLink, "Review and promote")}
  `);
}

export interface PromotionOutcomeEmailOpts {
  recruiterName: string;
  jobId: string;
  jobTitle: string;
  approved: boolean;
  /** Days of promotion granted. Only meaningful when approved. */
  days?: number;
  /** Admin's reason, shown when declined. */
  note?: string | null;
}

export function promotionOutcomeSubject(opts: {
  jobTitle: string;
  approved: boolean;
}): string {
  return opts.approved
    ? `Your listing is now promoted: ${opts.jobTitle}`
    : `Update on your promotion request: ${opts.jobTitle}`;
}

export function promotionOutcomeEmail(opts: PromotionOutcomeEmailOpts): string {
  const title = escapeHtml(opts.jobTitle);

  if (opts.approved) {
    return shell(`
      <h2 style="color:${BRAND};margin-top:0">Your listing is promoted</h2>
      <p>Hi ${escapeHtml(opts.recruiterName)},</p>
      <p><strong>${title}</strong> is now promoted${
        opts.days ? ` for the next ${opts.days} days` : ""
      } — it will appear above regular listings in search and browse, with a
      Promoted badge.</p>
      ${cta(`${SITE_URL}/jobs/${encodeURIComponent(opts.jobId)}`, "View your listing")}
    `);
  }

  const reason = opts.note
    ? `<blockquote style="margin:12px 0 0;padding:10px 14px;border-left:3px solid #d1d5db;background:#f9fafb;color:#111827;font-size:13px">${escapeHtml(
        opts.note
      )}</blockquote>`
    : "";

  return shell(`
    <h2 style="margin-top:0">Promotion request not approved</h2>
    <p>Hi ${escapeHtml(opts.recruiterName)},</p>
    <p>We weren't able to promote <strong>${title}</strong> this time.</p>
    ${reason}
    <p style="margin-top:16px;color:#6b7280;font-size:13px">
      You're welcome to request again once the listing has been updated.
    </p>
    ${cta(`${SITE_URL}/recruiter/jobs`, "Back to my jobs")}
  `);
}
