/**
 * Pure rules for expiring paid employer subscriptions.
 *
 * `subscriptionExpiry` was previously written and displayed but never checked,
 * so an ENTERPRISE account kept CV access and premium listings forever
 * regardless of the date on it. These rules give it teeth; the sweep that
 * applies them lives in `src/jobs/expireSubscriptions.ts`.
 */

export type EmployerTier = "FREE" | "PRO" | "ENTERPRISE";

export interface ExpirableEmployer {
  tier: EmployerTier;
  subscriptionExpiry: Date | null;
  hasCvAccess: boolean;
}

/** Warn this many days before expiry so the employer can renew in time. */
export const EXPIRY_WARNING_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A paid subscription has lapsed when its expiry date has passed.
 *
 * A null expiry means "no end date" and never lapses — that is how a
 * perpetual or manually-managed account is represented. FREE accounts have
 * nothing to lapse.
 */
export function isSubscriptionExpired(
  employer: ExpirableEmployer,
  now: Date
): boolean {
  if (employer.tier === "FREE") return false;
  if (employer.subscriptionExpiry === null) return false;
  return employer.subscriptionExpiry.getTime() <= now.getTime();
}

export interface Downgrade {
  tier: "FREE";
  hasCvAccess: false;
  subscriptionExpiry: null;
  maxRecruiterSeats: 1;
  accountManagerName: null;
}

/**
 * What a lapsed employer becomes. Everything the paid tier granted is revoked
 * together — leaving `hasCvAccess` on would let an expired account keep
 * searching the candidate database, which is the most valuable thing it buys.
 */
export function downgradeFields(): Downgrade {
  return {
    tier: "FREE",
    hasCvAccess: false,
    subscriptionExpiry: null,
    maxRecruiterSeats: 1,
    accountManagerName: null,
  };
}

/**
 * True when the subscription is still live but inside the warning window, so
 * the employer should be nudged to renew. Excludes already-expired accounts,
 * which get the downgrade notice instead.
 */
export function isExpiringSoon(
  employer: ExpirableEmployer,
  now: Date
): boolean {
  if (employer.tier === "FREE") return false;
  if (employer.subscriptionExpiry === null) return false;

  const msLeft = employer.subscriptionExpiry.getTime() - now.getTime();
  return msLeft > 0 && msLeft <= EXPIRY_WARNING_DAYS * MS_PER_DAY;
}

/** Whole days until expiry, rounded up. Null when there is no expiry date. */
export function daysUntilExpiry(
  employer: ExpirableEmployer,
  now: Date
): number | null {
  if (employer.subscriptionExpiry === null) return null;
  const ms = employer.subscriptionExpiry.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / MS_PER_DAY);
}
