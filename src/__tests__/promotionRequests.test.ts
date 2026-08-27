import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  canRequestPromotion,
  canReviewRequest,
  requestButtonState,
  type RequestableJob,
  type RequestStatus,
} from "@/lib/promotionRequests";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 86400000);

function job(overrides: Partial<RequestableJob> = {}): RequestableJob {
  return {
    isActive: true,
    isClosed: false,
    isFeatured: false,
    featuredUntil: null,
    latestRequestStatus: null,
    ...overrides,
  };
}

describe("canRequestPromotion", () => {
  it("allows a plain active listing", () => {
    expect(canRequestPromotion(job(), NOW)).toEqual({ allowed: true });
  });

  it("refuses a closed listing", () => {
    const r = canRequestPromotion(job({ isClosed: true }), NOW);
    expect(r).toMatchObject({ allowed: false, status: 400 });
  });

  it("refuses an inactive listing", () => {
    expect(canRequestPromotion(job({ isActive: false }), NOW).allowed).toBe(false);
  });

  it("refuses a listing that is already promoted", () => {
    const r = canRequestPromotion(
      job({ isFeatured: true, featuredUntil: daysFromNow(5) }),
      NOW
    );
    expect(r).toMatchObject({ allowed: false, status: 409 });
  });

  it("allows again once a promotion has lapsed", () => {
    // The nightly cron may not have cleared isFeatured yet.
    expect(
      canRequestPromotion(job({ isFeatured: true, featuredUntil: daysFromNow(-1) }), NOW)
        .allowed
    ).toBe(true);
  });

  it("refuses a second request while one is pending", () => {
    const r = canRequestPromotion(job({ latestRequestStatus: "PENDING" }), NOW);
    expect(r).toMatchObject({ allowed: false, status: 409 });
  });

  it("allows a fresh request after one was declined", () => {
    expect(canRequestPromotion(job({ latestRequestStatus: "DECLINED" }), NOW).allowed).toBe(true);
  });

  it("allows a fresh request after an earlier promotion was approved and expired", () => {
    expect(
      canRequestPromotion(
        job({ latestRequestStatus: "APPROVED", isFeatured: true, featuredUntil: daysFromNow(-2) }),
        NOW
      ).allowed
    ).toBe(true);
  });

  it("property: an allowed request always means active, unpromoted, and not pending", () => {
    fc.assert(
      fc.property(
        fc.record({
          isActive: fc.boolean(),
          isClosed: fc.boolean(),
          isFeatured: fc.boolean(),
          featuredUntil: fc.option(
            fc.date({ min: new Date("2026-01-01"), max: new Date("2027-12-31") }),
            { nil: null }
          ),
          latestRequestStatus: fc.constantFrom<RequestStatus | null>(
            "PENDING",
            "APPROVED",
            "DECLINED",
            null
          ),
        }),
        (j) => {
          const result = canRequestPromotion(j, NOW);
          if (!result.allowed) return true;
          const promotedNow =
            j.isFeatured && (j.featuredUntil === null || j.featuredUntil.getTime() > NOW.getTime());
          return (
            j.isActive &&
            !j.isClosed &&
            !promotedNow &&
            j.latestRequestStatus !== "PENDING"
          );
        }
      )
    );
  });
});

describe("canReviewRequest", () => {
  it("allows acting on a pending request", () => {
    expect(canReviewRequest("PENDING")).toEqual({ allowed: true });
  });

  it("refuses double-approving", () => {
    expect(canReviewRequest("APPROVED")).toMatchObject({ allowed: false, status: 409 });
  });

  it("refuses acting on a declined request", () => {
    expect(canReviewRequest("DECLINED")).toMatchObject({ allowed: false, status: 409 });
  });
});

describe("requestButtonState", () => {
  it("reports an active promotion", () => {
    expect(
      requestButtonState(job({ isFeatured: true, featuredUntil: daysFromNow(3) }), NOW)
    ).toBe("promoted");
  });

  it("reports a pending request", () => {
    expect(requestButtonState(job({ latestRequestStatus: "PENDING" }), NOW)).toBe("pending");
  });

  it("reports a closed listing as unavailable", () => {
    expect(requestButtonState(job({ isClosed: true }), NOW)).toBe("unavailable");
  });

  it("reports a plain listing as requestable", () => {
    expect(requestButtonState(job(), NOW)).toBe("requestable");
  });

  it("prefers 'promoted' over 'pending' when both somehow apply", () => {
    expect(
      requestButtonState(
        job({ isFeatured: true, featuredUntil: daysFromNow(2), latestRequestStatus: "PENDING" }),
        NOW
      )
    ).toBe("promoted");
  });

  it("property: 'requestable' agrees with canRequestPromotion", () => {
    fc.assert(
      fc.property(
        fc.record({
          isActive: fc.boolean(),
          isClosed: fc.boolean(),
          isFeatured: fc.boolean(),
          featuredUntil: fc.option(
            fc.date({ min: new Date("2026-01-01"), max: new Date("2027-12-31") }),
            { nil: null }
          ),
          latestRequestStatus: fc.constantFrom<RequestStatus | null>(
            "PENDING",
            "APPROVED",
            "DECLINED",
            null
          ),
        }),
        (j) =>
          (requestButtonState(j, NOW) === "requestable") === canRequestPromotion(j, NOW).allowed
      )
    );
  });
});
