import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { emitToUser } from "@/lib/socketio";
import type { NotificationType, Prisma } from "@prisma/client";

/**
 * One channel for everything that needs the admin's attention.
 *
 * Every alert goes to two places: an in-app Notification (so it shows in the
 * bell and the dashboard) and an email (so it lands even when the admin panel
 * is closed). Routes call `notifyAdmins` rather than assembling recipients
 * themselves, so adding a new admin-facing event is one call.
 */

/**
 * Extra address that always receives admin alerts, independent of the User
 * table. Set ADMIN_ALERT_EMAIL so alerts still arrive if the admin account's
 * login address is not the inbox actually being read.
 */
const ALERT_INBOX = process.env.ADMIN_ALERT_EMAIL?.trim() || null;

const SITE_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://www.paktechjobs.com";

export interface AdminAlert {
  type: NotificationType;
  /** Short in-app title, e.g. "New recruiter registered". */
  title: string;
  /** One-line in-app body. */
  body: string;
  /** Structured context stored on the notification. */
  data?: Record<string, unknown>;
  emailSubject: string;
  emailHtml: string;
}

export interface AdminAlertResult {
  notified: number;
  emailed: number;
  failed: number;
}

/**
 * Resolves who should hear about admin events: every active ADMIN account,
 * plus ADMIN_ALERT_EMAIL when set. Addresses are de-duplicated so a matching
 * env address does not produce two copies.
 */
export async function adminRecipients(): Promise<{
  users: { id: string; email: string }[];
  emails: string[];
}> {
  const users = await prisma.user.findMany({
    where: { role: "ADMIN", suspended: false },
    select: { id: true, email: true },
  });

  const emails = new Set(users.map((u) => u.email.toLowerCase()));
  if (ALERT_INBOX) emails.add(ALERT_INBOX.toLowerCase());

  return { users, emails: [...emails] };
}

/**
 * Sends an alert to every admin. Never throws — a notification failure must not
 * roll back the action that triggered it, and one bad address must not stop the
 * rest from being told.
 */
export async function notifyAdmins(alert: AdminAlert): Promise<AdminAlertResult> {
  const result: AdminAlertResult = { notified: 0, emailed: 0, failed: 0 };

  let recipients: Awaited<ReturnType<typeof adminRecipients>>;
  try {
    recipients = await adminRecipients();
  } catch (error) {
    console.error("[adminAlerts] could not resolve recipients:", error);
    return { ...result, failed: 1 };
  }

  if (recipients.users.length === 0 && recipients.emails.length === 0) {
    // Loud, because the alternative is an event nobody ever hears about.
    console.error(
      `[adminAlerts] no admin recipients for "${alert.title}" — set ADMIN_ALERT_EMAIL or create an ADMIN user`
    );
    return { ...result, failed: 1 };
  }

  for (const admin of recipients.users) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: admin.id,
          type: alert.type,
          title: alert.title,
          body: alert.body,
          data: (alert.data ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      emitToUser(admin.id, "notification:new", notification);
      result.notified++;
    } catch (error) {
      console.error(`[adminAlerts] in-app notify failed for ${admin.id}:`, error);
      result.failed++;
    }
  }

  for (const to of recipients.emails) {
    try {
      const ok = await sendEmail({
        to,
        subject: alert.emailSubject,
        html: alert.emailHtml,
      });
      if (ok) result.emailed++;
      else result.failed++;
    } catch (error) {
      console.error(`[adminAlerts] email failed for ${to}:`, error);
      result.failed++;
    }
  }

  return result;
}

// ─── Shared email chrome ─────────────────────────────────────────────────────

const BRAND = "#0a66c2";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Admin alerts are operational, not marketing: no unsubscribe footer, and they
 * ignore `marketingEmailsEnabled`. An admin must not be able to mute their own
 * work queue.
 */
export function adminEmailShell(inner: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827">
      ${inner}
      <p style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">
        PakTechJobs admin alert &middot; you receive these because you administer the site.
      </p>
    </div>
  `;
}

export function adminCta(path: string, label: string): string {
  return `<a href="${SITE_URL}${path}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:${BRAND};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${label}</a>`;
}

export function adminRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 0;color:#6b7280;font-size:13px;width:140px;vertical-align:top">${label}</td>
      <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:500">${value}</td>
    </tr>
  `;
}

export function adminTable(rows: string): string {
  return `<table style="width:100%;border-collapse:collapse;margin-top:16px">${rows}</table>`;
}
