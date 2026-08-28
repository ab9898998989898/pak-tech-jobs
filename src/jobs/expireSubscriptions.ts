import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { emitToUser } from "@/lib/socketio";
import {
  notifyAdmins,
  adminEmailShell,
  adminTable,
  adminRow,
  adminCta,
  escapeHtml,
} from "@/lib/adminAlerts";
import {
  daysUntilExpiry,
  downgradeFields,
  isExpiringSoon,
  isSubscriptionExpired,
  EXPIRY_WARNING_DAYS,
} from "@/lib/subscriptionExpiry";

/**
 * Nightly sweep that actually enforces `subscriptionExpiry`.
 *
 * Mirrors `expire-featured`: lapsed paid accounts drop to FREE and lose CV
 * access, and accounts inside the warning window get a renewal nudge.
 */

const SITE_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://www.paktechjobs.com";

export interface ExpireSubscriptionsResult {
  scanned: number;
  downgraded: number;
  warned: number;
  failed: number;
}

function employerEmail(inner: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827">
      ${inner}
      <p style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">
        PakTechJobs &middot; Pakistan's Tech Job Board
      </p>
    </div>
  `;
}

export async function runExpireSubscriptions(
  now: Date = new Date()
): Promise<ExpireSubscriptionsResult> {
  // Only paid accounts with a date set can lapse or need warning.
  const employers = await prisma.user.findMany({
    where: {
      role: "RECRUITER",
      tier: { in: ["PRO", "ENTERPRISE"] },
      subscriptionExpiry: { not: null },
    },
    select: {
      id: true,
      name: true,
      email: true,
      companyName: true,
      tier: true,
      subscriptionExpiry: true,
      hasCvAccess: true,
    },
  });

  const result: ExpireSubscriptionsResult = {
    scanned: employers.length,
    downgraded: 0,
    warned: 0,
    failed: 0,
  };

  const lapsed: { company: string; tier: string; expiredOn: string }[] = [];

  for (const employer of employers) {
    const company = employer.companyName || employer.name;

    try {
      if (isSubscriptionExpired(employer, now)) {
        const previousTier = employer.tier;

        await prisma.user.update({
          where: { id: employer.id },
          data: downgradeFields(),
        });

        const notification = await prisma.notification.create({
          data: {
            userId: employer.id,
            type: "SUBSCRIPTION_EXPIRED",
            title: "Your subscription has ended",
            body: `Your ${previousTier} plan expired. Your account is now on the Free plan.`,
            data: { previousTier },
          },
        });
        emitToUser(employer.id, "notification:new", notification);

        await sendEmail({
          to: employer.email,
          subject: `Your PakTechJobs ${previousTier} plan has ended`,
          html: employerEmail(`
            <h2 style="color:#0a66c2;margin-top:0">Your ${escapeHtml(previousTier)} plan has ended</h2>
            <p>Hi ${escapeHtml(employer.name)},</p>
            <p>Your subscription expired, so <strong>${escapeHtml(company)}</strong> is now on the
               Free plan. Your job posts and applicants are untouched — only the paid
               extras have switched off:</p>
            <ul style="color:#4b5563;line-height:1.8;padding-left:20px">
              <li>Candidate database search</li>
              <li>Premium listing placement on new posts</li>
            </ul>
            <p>Want to continue? Reply to this email and we'll get you set back up.</p>
            <a href="${SITE_URL}/recruiter/dashboard" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#0a66c2;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">Go to dashboard</a>
          `),
        });

        lapsed.push({
          company,
          tier: previousTier,
          expiredOn: employer.subscriptionExpiry!.toLocaleDateString("en-PK"),
        });
        result.downgraded++;
        continue;
      }

      if (isExpiringSoon(employer, now)) {
        const days = daysUntilExpiry(employer, now);

        const notification = await prisma.notification.create({
          data: {
            userId: employer.id,
            type: "SUBSCRIPTION_EXPIRED",
            title: "Subscription ending soon",
            body: `Your ${employer.tier} plan ends in ${days} day${days === 1 ? "" : "s"}.`,
            data: { daysRemaining: days },
          },
        });
        emitToUser(employer.id, "notification:new", notification);

        await sendEmail({
          to: employer.email,
          subject: `Your PakTechJobs plan ends in ${days} day${days === 1 ? "" : "s"}`,
          html: employerEmail(`
            <h2 style="color:#0a66c2;margin-top:0">Your plan ends soon</h2>
            <p>Hi ${escapeHtml(employer.name)},</p>
            <p>The ${escapeHtml(employer.tier)} plan for <strong>${escapeHtml(company)}</strong>
               ends in <strong>${days} day${days === 1 ? "" : "s"}</strong>.</p>
            <p>After that you'll keep your job posts and applicants, but lose candidate
               search and premium placement. Reply to this email to renew.</p>
          `),
        });

        result.warned++;
      }
    } catch (error) {
      console.error(`[expire-subscriptions] failed for ${employer.id}:`, error);
      result.failed++;
    }
  }

  // A downgrade is revenue churn — the admin should hear about it once, in a
  // single summary rather than one email per account.
  if (lapsed.length > 0) {
    await notifyAdmins({
      type: "SUBSCRIPTION_EXPIRED",
      title: `${lapsed.length} subscription${lapsed.length === 1 ? "" : "s"} expired`,
      body: lapsed.map((l) => l.company).join(", "),
      data: { count: lapsed.length },
      emailSubject: `${lapsed.length} PakTechJobs subscription${lapsed.length === 1 ? "" : "s"} expired`,
      emailHtml: adminEmailShell(`
        <h2 style="color:#0a66c2;margin-top:0">Subscriptions expired</h2>
        <p>These employers were downgraded to Free today. They have been emailed.</p>
        ${adminTable(
          lapsed
            .map((l) => adminRow(escapeHtml(l.company), `${escapeHtml(l.tier)} — ended ${escapeHtml(l.expiredOn)}`))
            .join("")
        )}
        ${adminCta("/admin", "Open admin panel")}
      `),
    });
  }

  return result;
}

export { EXPIRY_WARNING_DAYS };
