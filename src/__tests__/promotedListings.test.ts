import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  isPromotionActive,
  sortJobsByPromotion,
  validatePromotionDays,
  promotionExpiry,
  daysRemaining,
  PROMOTION_MIN_DAYS,
  PROMOTION_MAX_DAYS,
  PROMOTION_DEFAULT_DAYS,
  type RankableJob,
} from "@/lib/promotedListings";
import { sortJobListings } from "@/lib/enterpriseTier";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 86400000);

function job(overrides: Partial<RankableJob> = {}): RankableJob {
  return {
    isFeatured: false,
    featuredUntil: null,
    isPremium: false,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

// ─── Active promotion ────────────────────────────────────────────────────────

describe("isPromotionActive", () => {
  it("is false when the job was never promoted", () => {
    expect(isPromotionActive({ isFeatured: false, featuredUntil: null }, NOW)).toBe(false);
  });

  it("is true while the expiry is in the future", () => {
    expect(
      isPromotionActive({ isFeatured: true, featuredUntil: daysFromNow(3) }, NOW)
    ).toBe(true);
  });

  it("is false once the expiry has passed, without waiting for the nightly cron", () => {
    expect(
      isPromotionActive({ isFeatured: true, featuredUntil: daysFromNow(-0.1) }, NOW)
    ).toBe(false);
  });

  it("treats a null expiry as an indefinite promotion", () => {
    expect(isPromotionActive({ isFeatured: true, featuredUntil: null }, NOW)).toBe(true);
  });

  it("is false at the exact moment of expiry", () => {
    expect(isPromotionActive({ isFeatured: true, featuredUntil: NOW }, NOW)).toBe(false);
  });

  it("ignores a stale expiry when isFeatured is false", () => {
    expect(
      isPromotionActive({ isFeatured: false, featuredUntil: daysFromNow(30) }, NOW)
    ).toBe(false);
  });
});

// ─── Ranking ─────────────────────────────────────────────────────────────────

describe("sortJobsByPromotion", () => {
  it("puts an active promotion above a premium listing", () => {
    const promoted = job({ isFeatured: true, featuredUntil: daysFromNow(5) });
    const premium = job({ isPremium: true });
    expect(sortJobsByPromotion([premium, promoted], NOW)[0]).toBe(promoted);
  });

  it("puts premium above a plain listing when neither is promoted", () => {
    const premium = job({ isPremium: true });
    const plain = job();
    expect(sortJobsByPromotion([plain, premium], NOW)[0]).toBe(premium);
  });

  it("orders newest-first within the same rank", () => {
    const older = job({ createdAt: new Date("2026-08-01") });
    const newer = job({ createdAt: new Date("2026-08-20") });
    expect(sortJobsByPromotion([older, newer], NOW)).toEqual([newer, older]);
  });

  it("does not rank an expired promotion above anything", () => {
    const expired = job({ isFeatured: true, featuredUntil: daysFromNow(-1) });
    const premium = job({ isPremium: true });
    expect(sortJobsByPromotion([expired, premium], NOW)[0]).toBe(premium);
  });

  it("does not mutate the input array", () => {
    const input = [job({ isPremium: true }), job({ isFeatured: true, featuredUntil: daysFromNow(1) })];
    const copy = [...input];
    sortJobsByPromotion(input, NOW);
    expect(input).toEqual(copy);
  });

  it("keeps every job", () => {
    const input = [job(), job({ isPremium: true }), job({ isFeatured: true, featuredUntil: daysFromNow(2) })];
    expect(sortJobsByPromotion(input, NOW)).toHaveLength(3);
  });

  const rankableArb = fc.record({
    isFeatured: fc.boolean(),
    featuredUntil: fc.option(
      fc.date({ min: new Date("2026-01-01"), max: new Date("2027-12-31") }),
      { nil: null }
    ),
    isPremium: fc.boolean(),
    createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
  });

  it("property: no unpromoted job ever appears above a promoted one", () => {
    fc.assert(
      fc.property(fc.array(rankableArb, { maxLength: 50 }), (jobs) => {
        const sorted = sortJobsByPromotion(jobs, NOW);
        let seenUnpromoted = false;
        for (const j of sorted) {
          const promoted = isPromotionActive(j, NOW);
          if (!promoted) seenUnpromoted = true;
          else if (seenUnpromoted) return false;
        }
        return true;
      })
    );
  });

  it("property: within the unpromoted group, premium still outranks non-premium", () => {
    fc.assert(
      fc.property(fc.array(rankableArb, { maxLength: 50 }), (jobs) => {
        const unpromoted = sortJobsByPromotion(jobs, NOW).filter(
          (j) => !isPromotionActive(j, NOW)
        );
        let seenNonPremium = false;
        for (const j of unpromoted) {
          if (!j.isPremium) seenNonPremium = true;
          else if (seenNonPremium) return false;
        }
        return true;
      })
    );
  });

  it("property: with nothing promoted, ranking matches the existing tier sort", () => {
    // Guarantees Phase 2 is a strict refinement — enterprise ordering is intact.
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            isPremium: fc.boolean(),
            createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
          }),
          { maxLength: 50 }
        ),
        (plain) => {
          const jobs = plain.map((p, i) => ({
            ...p,
            id: String(i),
            isFeatured: false,
            featuredUntil: null,
          }));
          const viaPromotion = sortJobsByPromotion(jobs, NOW).map((j) => j.id);
          const viaTier = sortJobListings(jobs).map((j) => j.id);
          return JSON.stringify(viaPromotion) === JSON.stringify(viaTier);
        }
      )
    );
  });
});

// ─── Duration validation ─────────────────────────────────────────────────────

describe("validatePromotionDays", () => {
  it("defaults when nothing is supplied", () => {
    expect(validatePromotionDays(undefined)).toEqual({ ok: true, days: PROMOTION_DEFAULT_DAYS });
    expect(validatePromotionDays(null)).toEqual({ ok: true, days: PROMOTION_DEFAULT_DAYS });
  });

  it("accepts values inside the range", () => {
    expect(validatePromotionDays(30)).toEqual({ ok: true, days: 30 });
    expect(validatePromotionDays(PROMOTION_MIN_DAYS).ok).toBe(true);
    expect(validatePromotionDays(PROMOTION_MAX_DAYS).ok).toBe(true);
  });

  it("rejects the unbounded value the old self-serve endpoint allowed", () => {
    expect(validatePromotionDays(99999).ok).toBe(false);
  });

  it("rejects zero and negatives", () => {
    expect(validatePromotionDays(0).ok).toBe(false);
    expect(validatePromotionDays(-5).ok).toBe(false);
  });

  it("rejects fractions and junk", () => {
    expect(validatePromotionDays(1.5).ok).toBe(false);
    expect(validatePromotionDays("abc").ok).toBe(false);
    expect(validatePromotionDays(NaN).ok).toBe(false);
    expect(validatePromotionDays(Infinity).ok).toBe(false);
  });

  it("accepts a numeric string, since JSON bodies are untyped", () => {
    expect(validatePromotionDays("14")).toEqual({ ok: true, days: 14 });
  });

  it("rejects objects rather than throwing on them", () => {
    // Number({ toString: "not a function" }) throws "Cannot convert object to
    // primitive value". `days` comes straight off req.json(), so this input is
    // reachable and must produce a 400, not an unhandled 500.
    expect(validatePromotionDays({ toString: "nope" }).ok).toBe(false);
    expect(validatePromotionDays({ valueOf: 1, toString: 2 }).ok).toBe(false);
    expect(validatePromotionDays(Object.create(null)).ok).toBe(false);
    expect(validatePromotionDays([7]).ok).toBe(false);
    expect(validatePromotionDays(true).ok).toBe(false);
  });

  it("property: never throws, and an accepted value is always within bounds", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = validatePromotionDays(input);
        if (!result.ok) return true;
        return (
          Number.isInteger(result.days) &&
          result.days >= PROMOTION_MIN_DAYS &&
          result.days <= PROMOTION_MAX_DAYS
        );
      }),
      { numRuns: 2000 }
    );
  });
});

// ─── Expiry helpers ──────────────────────────────────────────────────────────

describe("promotionExpiry", () => {
  it("lands the expiry the requested number of days out", () => {
    expect(promotionExpiry(7, NOW).toISOString()).toBe("2026-09-03T12:00:00.000Z");
  });

  it("always produces a future date for a valid duration", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: PROMOTION_MIN_DAYS, max: PROMOTION_MAX_DAYS }),
        (days) => promotionExpiry(days, NOW).getTime() > NOW.getTime()
      )
    );
  });
});

describe("daysRemaining", () => {
  it("returns null for a job that is not promoted", () => {
    expect(daysRemaining({ isFeatured: false, featuredUntil: daysFromNow(5) }, NOW)).toBeNull();
  });

  it("returns null for an indefinite promotion", () => {
    expect(daysRemaining({ isFeatured: true, featuredUntil: null }, NOW)).toBeNull();
  });

  it("rounds up partial days", () => {
    expect(daysRemaining({ isFeatured: true, featuredUntil: daysFromNow(2.4) }, NOW)).toBe(3);
  });

  it("floors at zero rather than going negative", () => {
    expect(daysRemaining({ isFeatured: true, featuredUntil: daysFromNow(-10) }, NOW)).toBe(0);
  });
});
