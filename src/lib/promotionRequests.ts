/**
 * Pure eligibility rules for promotion requests.
 *
 * Extracted from the route handlers so the "can this recruiter ask?" and
 * "can an admin still act on this?" questions are testable without a database.
 */

import { isPromotionActive, type PromotableJob } from "@/lib/promotedListings";

export type RequestStatus = "PENDING" | "INVOICED" | "APPROVED" | "DECLINED";

/** Statuses that represent an unresolved request and block raising another. */
export const OPEN_STATUSES: readonly RequestStatus[] = ["PENDING", "INVOICED"];

export interface RequestableJob extends PromotableJob {
  isActive: boolean;
  isClosed: boolean;
  /** Status of the most recent request for this job, if any. */
  latestRequestStatus?: RequestStatus | null;
}

export type RequestEligibility =
  | { allowed: true }
  | { allowed: false; reason: string; status: 400 | 409 };

/**
 * Whether a recruiter may raise a promotion request for one of their listings.
 *
 * Ownership and authentication are checked in the route; this covers only the
 * state of the listing itself.
 */
export function canRequestPromotion(
  job: RequestableJob,
  now: Date
): RequestEligibility {
  if (job.isClosed || !job.isActive) {
    return {
      allowed: false,
      reason: "Only active listings can be promoted",
      status: 400,
    };
  }
  if (isPromotionActive(job, now)) {
    return {
      allowed: false,
      reason: "This listing is already promoted",
      status: 409,
    };
  }
  if (job.latestRequestStatus === "PENDING") {
    return {
      allowed: false,
      reason: "A promotion request for this listing is already pending",
      status: 409,
    };
  }
  if (job.latestRequestStatus === "INVOICED") {
    return {
      allowed: false,
      reason: "An invoice for this listing is awaiting payment",
      status: 409,
    };
  }
  return { allowed: true };
}

/**
 * A request can be acted on exactly once. Re-review is refused rather than
 * silently re-promoting, which would extend an existing promotion by surprise.
 */
export function canReviewRequest(status: RequestStatus): RequestEligibility {
  if (status !== "PENDING") {
    return {
      allowed: false,
      reason: `This request was already ${status.toLowerCase()}`,
      status: 409,
    };
  }
  return { allowed: true };
}

/** Label shown on the recruiter's own listing row. */
export function requestButtonState(
  job: RequestableJob,
  now: Date
): "promoted" | "invoiced" | "pending" | "requestable" | "unavailable" {
  if (isPromotionActive(job, now)) return "promoted";
  if (job.isClosed || !job.isActive) return "unavailable";
  if (job.latestRequestStatus === "INVOICED") return "invoiced";
  if (job.latestRequestStatus === "PENDING") return "pending";
  return "requestable";
}
