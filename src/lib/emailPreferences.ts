import { randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Opt-out plumbing for automated re-engagement mail.
 *
 * Only re-engagement campaigns honour `marketingEmailsEnabled`. Transactional
 * mail — application stage changes, interview invites, offers — is unaffected,
 * since a user who unsubscribes from nudges still needs to hear that they got
 * an interview.
 */

const SITE_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://www.paktechjobs.com";

export function generateUnsubscribeToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Returns the user's unsubscribe token, minting and persisting one on first use.
 * Existing accounts predate the column, so this backfills lazily rather than
 * requiring a data migration over every row.
 */
export async function ensureUnsubscribeToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { unsubscribeToken: true },
  });

  if (user?.unsubscribeToken) return user.unsubscribeToken;

  const token = generateUnsubscribeToken();
  await prisma.user.update({
    where: { id: userId },
    data: { unsubscribeToken: token },
  });
  return token;
}

export function unsubscribeUrl(token: string): string {
  return `${SITE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Constant-time token comparison, so the lookup can't be probed by timing. */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Standard footer for every re-engagement email. The unsubscribe link is a
 * one-click GET on a public route — no login required, which is what spam
 * filters and CAN-SPAM both expect.
 */
export function emailFooter(token: string): string {
  return `
    <p style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6">
      PakTechJobs &middot; Pakistan's Tech Job Board<br>
      You're receiving this because you have an account on PakTechJobs.<br>
      <a href="${unsubscribeUrl(token)}" style="color:#6b7280;text-decoration:underline">Unsubscribe from these emails</a>
    </p>
  `;
}
