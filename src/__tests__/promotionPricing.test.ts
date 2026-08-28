import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  PROMOTION_PACKAGES,
  DEFAULT_PACKAGE_DAYS,
  findPackage,
  formatPkr,
  generateInvoiceRef,
  INVOICE_REF_SPACE,
} from "@/lib/promotionPricing";
import { validatePromotionDays, PROMOTION_MAX_DAYS } from "@/lib/promotedListings";

describe("PROMOTION_PACKAGES", () => {
  it("offers at least one package", () => {
    expect(PROMOTION_PACKAGES.length).toBeGreaterThan(0);
  });

  it("has a default that is actually purchasable", () => {
    expect(findPackage(DEFAULT_PACKAGE_DAYS)).not.toBeNull();
  });

  it("every package is within the promotion duration limit", () => {
    // A package the promote endpoint would reject could be sold but never
    // fulfilled.
    for (const p of PROMOTION_PACKAGES) {
      expect(validatePromotionDays(p.days).ok).toBe(true);
      expect(p.days).toBeLessThanOrEqual(PROMOTION_MAX_DAYS);
    }
  });

  it("every package has a positive whole-rupee price", () => {
    for (const p of PROMOTION_PACKAGES) {
      expect(Number.isInteger(p.pricePkr)).toBe(true);
      expect(p.pricePkr).toBeGreaterThan(0);
    }
  });

  it("longer packages cost more in total but less per day", () => {
    const sorted = [...PROMOTION_PACKAGES].sort((a, b) => a.days - b.days);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].pricePkr).toBeGreaterThan(sorted[i - 1].pricePkr);
      const prevPerDay = sorted[i - 1].pricePkr / sorted[i - 1].days;
      const thisPerDay = sorted[i].pricePkr / sorted[i].days;
      expect(thisPerDay).toBeLessThanOrEqual(prevPerDay);
    }
  });

  it("has no duplicate durations", () => {
    const days = PROMOTION_PACKAGES.map((p) => p.days);
    expect(new Set(days).size).toBe(days.length);
  });
});

describe("findPackage", () => {
  it("finds a real package by its day count", () => {
    expect(findPackage(PROMOTION_PACKAGES[0].days)?.days).toBe(PROMOTION_PACKAGES[0].days);
  });

  it("rejects a duration nobody offers", () => {
    expect(findPackage(999)).toBeNull();
  });

  it("rejects non-integers and junk without throwing", () => {
    expect(findPackage(7.5)).toBeNull();
    expect(findPackage("7")).toBeNull();
    expect(findPackage(null)).toBeNull();
    expect(findPackage(undefined)).toBeNull();
    expect(findPackage({ toString: "nope" })).toBeNull();
    expect(findPackage(NaN)).toBeNull();
  });

  it("property: anything it returns is one of the offered packages", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const found = findPackage(input);
        return found === null || PROMOTION_PACKAGES.includes(found);
      })
    );
  });
});

describe("generateInvoiceRef", () => {
  it("uses a recognisable, quotable format", () => {
    expect(generateInvoiceRef()).toMatch(/^PTJ-[0-9A-F]{10}$/);
  });

  it("has enough entropy that collisions stay negligible at realistic volume", () => {
    // Deterministic rather than probabilistic. Correctness does not rest on
    // this — the issuing route retries on a unique violation — but the width
    // should make retries essentially never happen.
    //
    // 10k invoices is already generous for this business; the birthday bound
    // there is ~1 in 22,000. Note this grows quadratically: at 100k references
    // it is ~0.45%, which is exactly why the retry exists.
    const invoicesEverIssued = 10_000;
    const collisionProbability =
      1 - Math.exp(-(invoicesEverIssued ** 2) / (2 * INVOICE_REF_SPACE));

    expect(collisionProbability).toBeLessThan(1e-4);
  });

  it("does not repeat across a realistic number of invoices", () => {
    const refs = new Set(Array.from({ length: 2000 }, generateInvoiceRef));
    expect(refs.size).toBe(2000);
  });
});

describe("formatPkr", () => {
  it("groups thousands", () => {
    expect(formatPkr(9000)).toContain("9,000");
  });

  it("always carries the currency", () => {
    expect(formatPkr(500).startsWith("PKR")).toBe(true);
  });
});
