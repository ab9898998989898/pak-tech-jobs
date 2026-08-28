import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  isSubscriptionExpired,
  isExpiringSoon,
  daysUntilExpiry,
  downgradeFields,
  EXPIRY_WARNING_DAYS,
  type ExpirableEmployer,
  type EmployerTier,
} from "@/lib/subscriptionExpiry";

const NOW = new Date("2026-08-28T12:00:00.000Z");
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 86400000);

function employer(overrides: Partial<ExpirableEmployer> = {}): ExpirableEmployer {
  return {
    tier: "ENTERPRISE",
    subscriptionExpiry: daysFromNow(30),
    hasCvAccess: true,
    ...overrides,
  };
}

describe("isSubscriptionExpired", () => {
  it("is false while the expiry is in the future", () => {
    expect(isSubscriptionExpired(employer(), NOW)).toBe(false);
  });

  it("is true once the expiry has passed", () => {
    expect(isSubscriptionExpired(employer({ subscriptionExpiry: daysFromNow(-1) }), NOW)).toBe(true);
  });

  it("is true at the exact moment of expiry", () => {
    expect(isSubscriptionExpired(employer({ subscriptionExpiry: NOW }), NOW)).toBe(true);
  });

  it("treats a null expiry as perpetual", () => {
    expect(isSubscriptionExpired(employer({ subscriptionExpiry: null }), NOW)).toBe(false);
  });

  it("never expires a FREE account", () => {
    expect(
      isSubscriptionExpired(
        employer({ tier: "FREE", subscriptionExpiry: daysFromNow(-100) }),
        NOW
      )
    ).toBe(false);
  });

  it("applies to PRO as well as ENTERPRISE", () => {
    expect(
      isSubscriptionExpired(employer({ tier: "PRO", subscriptionExpiry: daysFromNow(-1) }), NOW)
    ).toBe(true);
  });
});

describe("downgradeFields", () => {
  it("revokes every paid benefit together", () => {
    // Leaving hasCvAccess on would let a lapsed account keep searching the
    // candidate database — the most valuable thing the tier buys.
    expect(downgradeFields()).toEqual({
      tier: "FREE",
      hasCvAccess: false,
      subscriptionExpiry: null,
      maxRecruiterSeats: 1,
      accountManagerName: null,
    });
  });
});

describe("isExpiringSoon", () => {
  it("warns inside the window", () => {
    expect(isExpiringSoon(employer({ subscriptionExpiry: daysFromNow(3) }), NOW)).toBe(true);
  });

  it("does not warn outside the window", () => {
    expect(
      isExpiringSoon(employer({ subscriptionExpiry: daysFromNow(EXPIRY_WARNING_DAYS + 1) }), NOW)
    ).toBe(false);
  });

  it("does not warn about an account that has already expired", () => {
    // Those get the downgrade notice instead; warning them would be wrong.
    expect(isExpiringSoon(employer({ subscriptionExpiry: daysFromNow(-1) }), NOW)).toBe(false);
  });

  it("does not warn a FREE account", () => {
    expect(
      isExpiringSoon(employer({ tier: "FREE", subscriptionExpiry: daysFromNow(2) }), NOW)
    ).toBe(false);
  });

  it("does not warn a perpetual account", () => {
    expect(isExpiringSoon(employer({ subscriptionExpiry: null }), NOW)).toBe(false);
  });

  it("property: expired and expiring-soon are mutually exclusive", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<EmployerTier>("FREE", "PRO", "ENTERPRISE"),
        fc.integer({ min: -60, max: 60 }),
        fc.boolean(),
        (tier, offsetDays, nullExpiry) => {
          const e: ExpirableEmployer = {
            tier,
            subscriptionExpiry: nullExpiry ? null : daysFromNow(offsetDays),
            hasCvAccess: true,
          };
          return !(isSubscriptionExpired(e, NOW) && isExpiringSoon(e, NOW));
        }
      )
    );
  });

  it("property: a FREE account is never expired or warned", () => {
    fc.assert(
      fc.property(fc.integer({ min: -60, max: 60 }), (offsetDays) => {
        const e: ExpirableEmployer = {
          tier: "FREE",
          subscriptionExpiry: daysFromNow(offsetDays),
          hasCvAccess: false,
        };
        return !isSubscriptionExpired(e, NOW) && !isExpiringSoon(e, NOW);
      })
    );
  });
});

describe("daysUntilExpiry", () => {
  it("rounds partial days up", () => {
    expect(daysUntilExpiry(employer({ subscriptionExpiry: daysFromNow(2.4) }), NOW)).toBe(3);
  });

  it("floors at zero rather than going negative", () => {
    expect(daysUntilExpiry(employer({ subscriptionExpiry: daysFromNow(-5) }), NOW)).toBe(0);
  });

  it("returns null with no expiry date", () => {
    expect(daysUntilExpiry(employer({ subscriptionExpiry: null }), NOW)).toBeNull();
  });
});
