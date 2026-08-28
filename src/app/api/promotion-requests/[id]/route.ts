import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { emitToUser } from "@/lib/socketio";
import { invalidateCache } from "@/lib/cache";
import {
  promotionOutcomeEmail,
  promotionOutcomeSubject,
} from "@/lib/promotionEmails";
import { promotionExpiry, validatePromotionDays } from "@/lib/promotedListings";
import { canReviewRequest } from "@/lib/promotionRequests";
import {
  findPackage,
  formatPkr,
  generateInvoiceRef,
  PROMOTION_PACKAGES,
} from "@/lib/promotionPricing";
import {
  promotionInvoiceEmail,
  promotionInvoiceSubject,
} from "@/lib/invoiceEmails";

/**
 * PATCH /api/promotion-requests/[id]  { action: "approve" | "decline", days?, note? }
 *
 * Admin-only. Approving promotes the listing in the same transaction that
 * closes the request, so the two can never disagree.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, days, note } = body as {
    action?: unknown;
    days?: unknown;
    note?: unknown;
  };

  const ACTIONS = ["invoice", "mark-paid", "approve", "decline"] as const;
  if (typeof action !== "string" || !ACTIONS.includes(action as typeof ACTIONS[number])) {
    return NextResponse.json(
      { error: `action must be one of: ${ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return NextResponse.json({ error: "note must be text" }, { status: 400 });
  }

  const request = await prisma.promotionRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      jobPostId: true,
      recruiterId: true,
      packageDays: true,
      amountPkr: true,
      invoiceRef: true,
      jobPost: { select: { id: true, title: true } },
      recruiter: { select: { id: true, name: true, email: true } },
    },
  });

  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // ─── Issue an invoice ──────────────────────────────────────────────────────
  // Only a PENDING request can be invoiced; re-invoicing would mint a second
  // reference for money already asked for.
  if (action === "invoice") {
    if (request.status !== "PENDING") {
      return NextResponse.json(
        { error: `This request is already ${request.status.toLowerCase()}` },
        { status: 409 }
      );
    }

    const pkg = findPackage(request.packageDays) ?? PROMOTION_PACKAGES[0];
    const amount = request.amountPkr ?? pkg.pricePkr;

    // invoiceRef is uniquely indexed. A clash is vanishingly unlikely, but
    // retrying is cheaper than handing the admin an unexplained failure.
    let updated;
    let invoiceRef = request.invoiceRef ?? generateInvoiceRef();

    for (let attempt = 0; ; attempt++) {
      try {
        updated = await prisma.promotionRequest.update({
          where: { id },
          data: {
            status: "INVOICED",
            invoiceRef,
            invoicedAt: new Date(),
            packageDays: request.packageDays ?? pkg.days,
            amountPkr: amount,
          },
          select: {
            id: true,
            status: true,
            invoiceRef: true,
            invoicedAt: true,
            amountPkr: true,
            packageDays: true,
          },
        });
        break;
      } catch (error) {
        const isUniqueClash =
          typeof error === "object" &&
          error !== null &&
          (error as { code?: string }).code === "P2002";

        if (!isUniqueClash || attempt >= 4) {
          console.error(`[promotion-request ${id}] invoicing failed:`, error);
          return NextResponse.json(
            { error: "Could not issue the invoice, please try again" },
            { status: 500 }
          );
        }
        invoiceRef = generateInvoiceRef();
      }
    }

    try {
      const notification = await prisma.notification.create({
        data: {
          userId: request.recruiterId,
          type: "PROMOTION_INVOICED",
          title: "Invoice sent",
          body: `Invoice ${invoiceRef} for promoting "${request.jobPost.title}" — ${formatPkr(amount)}.`,
          data: { jobPostId: request.jobPostId, invoiceRef },
        },
      });
      emitToUser(request.recruiterId, "notification:new", notification);

      await sendEmail({
        to: request.recruiter.email,
        subject: promotionInvoiceSubject({ invoiceRef, jobTitle: request.jobPost.title }),
        html: promotionInvoiceEmail({
          recruiterName: request.recruiter.name,
          jobTitle: request.jobPost.title,
          packageLabel: pkg.label,
          packageDays: request.packageDays ?? pkg.days,
          amountPkr: amount,
          invoiceRef,
        }),
      });
    } catch (error) {
      console.error(`[promotion-request ${id}] invoice email failed:`, error);
    }

    return NextResponse.json(updated);
  }

  // "mark-paid" is approval for an already-invoiced request: same effect, but
  // it also stamps paidAt so the money and the promotion stay linked.
  const markingPaid = action === "mark-paid";
  if (markingPaid && request.status !== "INVOICED") {
    return NextResponse.json(
      { error: "Only an invoiced request can be marked paid" },
      { status: 409 }
    );
  }
  if (!markingPaid) {
    const reviewable = canReviewRequest(request.status);
    if (!reviewable.allowed) {
      return NextResponse.json({ error: reviewable.reason }, { status: reviewable.status });
    }
  }

  const approved = action === "approve" || markingPaid;
  const reviewNote =
    typeof note === "string" && note.trim() !== "" ? note.trim().slice(0, 500) : null;

  let grantedDays: number | undefined;

  if (approved) {
    // When marking an invoice paid, the duration is whatever they paid for —
    // not whatever the admin happens to have selected in the UI.
    const validation = validatePromotionDays(
      markingPaid ? request.packageDays ?? days : days
    );
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    grantedDays = validation.days;

    // Promote and close the request together — a partial failure would leave a
    // pending request against an already-promoted job, or vice versa.
    await prisma.$transaction([
      prisma.jobPost.update({
        where: { id: request.jobPostId },
        data: {
          isFeatured: true,
          featuredUntil: promotionExpiry(grantedDays, new Date()),
        },
      }),
      prisma.promotionRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: session.user.id,
          reviewNote,
          ...(markingPaid ? { paidAt: new Date() } : {}),
        },
      }),
    ]);

    await invalidateCache("jobs:*");
  } else {
    await prisma.promotionRequest.update({
      where: { id },
      data: {
        status: "DECLINED",
        reviewedAt: new Date(),
        reviewedById: session.user.id,
        reviewNote,
      },
    });
  }

  // Tell the recruiter what happened, in-app and by email.
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: request.recruiterId,
        type: approved ? "PROMOTION_APPROVED" : "PROMOTION_DECLINED",
        title: approved ? "Listing promoted" : "Promotion request declined",
        body: approved
          ? `"${request.jobPost.title}" is now promoted${grantedDays ? ` for ${grantedDays} days` : ""}.`
          : `Your request to promote "${request.jobPost.title}" wasn't approved.`,
        data: { jobPostId: request.jobPostId, promotionRequestId: request.id },
      },
    });
    emitToUser(request.recruiterId, "notification:new", notification);

    await sendEmail({
      to: request.recruiter.email,
      subject: promotionOutcomeSubject({
        jobTitle: request.jobPost.title,
        approved,
      }),
      html: promotionOutcomeEmail({
        recruiterName: request.recruiter.name,
        jobId: request.jobPostId,
        jobTitle: request.jobPost.title,
        approved,
        days: grantedDays,
        note: reviewNote,
      }),
    });
  } catch (error) {
    // The decision is already recorded; notification failure must not undo it.
    console.error(`[promotion-request ${id}] recruiter notify failed:`, error);
  }

  const updated = await prisma.promotionRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      reviewedAt: true,
      reviewNote: true,
      jobPost: { select: { id: true, title: true, isFeatured: true, featuredUntil: true } },
    },
  });

  return NextResponse.json(updated);
}
