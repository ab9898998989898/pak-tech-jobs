import { escapeHtml } from "@/lib/adminAlerts";
import { formatPkr, paymentInstructions } from "@/lib/promotionPricing";

/**
 * The invoice a recruiter receives when an admin approves their promotion
 * request for billing. Payment happens offline; this email carries the amount,
 * the reference to quote, and where to send it.
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

function payLine(label: string, value: string): string {
  return `<p style="margin:4px 0;font-size:14px"><span style="color:#6b7280">${label}:</span> <strong>${escapeHtml(value)}</strong></p>`;
}

export interface PromotionInvoiceOpts {
  recruiterName: string;
  jobTitle: string;
  packageLabel: string;
  packageDays: number;
  amountPkr: number;
  invoiceRef: string;
}

export function promotionInvoiceSubject(opts: {
  invoiceRef: string;
  jobTitle: string;
}): string {
  return `Invoice ${opts.invoiceRef} — promote "${opts.jobTitle}"`;
}

export function promotionInvoiceEmail(opts: PromotionInvoiceOpts): string {
  const pay = paymentInstructions();

  const methods = pay.empty
    ? `<p style="margin:0;font-size:14px;color:#b45309">Payment details will follow in a separate message.</p>`
    : [
        pay.bankName ? payLine("Bank", pay.bankName) : "",
        pay.accountTitle ? payLine("Account title", pay.accountTitle) : "",
        pay.accountNumber ? payLine("Account / IBAN", pay.accountNumber) : "",
        pay.easypaisa ? payLine("Easypaisa", pay.easypaisa) : "",
        pay.jazzcash ? payLine("JazzCash", pay.jazzcash) : "",
      ].join("");

  return shell(`
    <h2 style="color:${BRAND};margin-top:0">Invoice ${escapeHtml(opts.invoiceRef)}</h2>
    <p>Hi ${escapeHtml(opts.recruiterName)},</p>
    <p>Here's the invoice to promote <strong>${escapeHtml(opts.jobTitle)}</strong>.</p>

    <table style="width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #e5e7eb">
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-size:14px">
          Promoted listing &mdash; ${escapeHtml(opts.packageLabel)} (${opts.packageDays} days)
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;white-space:nowrap">
          ${formatPkr(opts.amountPkr)}
        </td>
      </tr>
      <tr>
        <td style="padding:12px 14px;font-size:15px;font-weight:600">Total due</td>
        <td style="padding:12px 14px;font-size:15px;font-weight:700;text-align:right;white-space:nowrap">
          ${formatPkr(opts.amountPkr)}
        </td>
      </tr>
    </table>

    <div style="padding:14px 16px;background:#f4f7fb;border-left:3px solid ${BRAND}">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#111827">How to pay</p>
      ${methods}
      <p style="margin:10px 0 0;font-size:13px;color:#111827">
        Please quote <strong>${escapeHtml(opts.invoiceRef)}</strong> as the payment reference so we
        can match it to your listing.
      </p>
    </div>

    <p style="margin-top:18px;font-size:14px">
      Once the payment lands we'll switch the promotion on and email you to confirm.
      Your ${opts.packageDays} days start from that point, not from today.
    </p>

    <a href="${SITE_URL}/recruiter/jobs" style="display:inline-block;margin-top:16px;padding:12px 24px;background:${BRAND};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">View my jobs</a>
  `);
}
