/**
 * Pure logic for promoted ("featured") job listings.
 *
 * Reuses the existing `JobPost.isFeatured` / `featuredUntil` columns rather than
 * introducing a parallel `isPromoted` field — two flags meaning the same thing
 * would drift apart. "Promoted" is the user-facing name for that pair.
 *
 * No Prisma imports, so the ranking and expiry rules stay unit-testable.
 */

export const PROMOTION_MIN_DAYS = 1;
export const PROMOTION_MAX_DAYS = 90;
export const PROMOTION_DEFAULT_DAYS = 7;

export interface PromotableJob {
  isFeatured: boolean;
  /** null means the promotion has no expiry — only an admin can set that. */
  featuredUntil: Date | null;
}

/**
 * Whether a listing should be treated as promoted *right now*.
 *
 * The `expire-featured` cron only runs once a day, so a listing whose
 * `featuredUntil` passed at 10:00 would still carry `isFeatured = true` until
 * midnight. Checking the date here means display and ranking are correct the
 * moment the promotion lapses; the cron remains the DB-level cleanup.
 */
export function isPromotionActive(job: PromotableJob, now: Date): boolean {
  if (!job.isFeatured) return false;
  if (job.featuredUntil === null) return true;
  return job.featuredUntil.getTime() > now.getTime();
}

export interface RankableJob extends PromotableJob {
  isPremium: boolean;
  createdAt: Date;
}

/**
 * Ranking for job seeker browse and search:
 *
 *   1. active promotion   — an explicit, time-boxed, per-listing boost
 *   2. isPremium          — the employer's Enterprise/Pro tier flag
 *   3. createdAt          — newest first
 *
 * Promotion outranks tier deliberately: it is a decision made about one
 * listing, where `isPremium` applies to everything an employer posts. Without a
 * fixed precedence the two flags would compete and ordering would depend on
 * whichever the database happened to return first.
 *
 * With no promoted listings this produces exactly the order that
 * `sortJobListings` in `enterpriseTier.ts` produces, so existing tier behaviour
 * is preserved. Returns a new array; does not mutate the input.
 */
export function sortJobsByPromotion<T extends RankableJob>(
  jobs: T[],
  now: Date
): T[] {
  return [...jobs].sort((a, b) => {
    const aPromoted = isPromotionActive(a, now);
    const bPromoted = isPromotionActive(b, now);
    if (aPromoted !== bPromoted) return aPromoted ? -1 : 1;

    if (a.isPremium !== b.isPremium) return a.isPremium ? -1 : 1;

    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export type DaysValidation =
  | { ok: true; days: number }
  | { ok: false; error: string };

/**
 * Bounds the promotion length. The previous self-serve endpoint accepted any
 * `days` value, so a single request could pin a listing to the top for
 * centuries; promotions are now capped at 90 days.
 */
export function validatePromotionDays(input: unknown): DaysValidation {
  if (input === undefined || input === null) {
    return { ok: true, days: PROMOTION_DEFAULT_DAYS };
  }

  // Only numbers and numeric strings are coerced. `Number(x)` on an object
  // whose `toString` is not callable — e.g. `{"days":{"toString":"x"}}` in a
  // request body — throws "Cannot convert object to primitive value", which
  // would surface as a 500 instead of a 400.
  if (typeof input !== "number" && typeof input !== "string") {
    return { ok: false, error: "days must be a whole number" };
  }

  const days = typeof input === "number" ? input : Number(input);

  if (!Number.isFinite(days) || !Number.isInteger(days)) {
    return { ok: false, error: "days must be a whole number" };
  }
  if (days < PROMOTION_MIN_DAYS || days > PROMOTION_MAX_DAYS) {
    return {
      ok: false,
      error: `days must be between ${PROMOTION_MIN_DAYS} and ${PROMOTION_MAX_DAYS}`,
    };
  }

  return { ok: true, days };
}

export function promotionExpiry(days: number, now: Date): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Whole days remaining, floored at 0. null when the promotion never expires. */
export function daysRemaining(
  job: PromotableJob,
  now: Date
): number | null {
  if (!job.isFeatured || job.featuredUntil === null) return null;
  const ms = job.featuredUntil.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}
