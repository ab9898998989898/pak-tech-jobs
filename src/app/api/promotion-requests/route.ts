import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { broadcast } from "@/lib/socketio";
import { notifyAdmins } from "@/lib/adminAlerts";
import {
  promotionRequestEmail,
  promotionRequestSubject,
} from "@/lib/promotionEmails";
import { canRequestPromotion } from "@/lib/promotionRequests";
import { findPackage, DEFAULT_PACKAGE_DAYS, formatPkr } from "@/lib/promotionPricing";

/**
 * Recruiters ask for a listing to be promoted; admins act on the request.
 *
 * Promotion itself stays admin-only because there is no payment integration
 * yet — a self-serve toggle would let everyone promote everything for free and
 * flatten the ranking. This is the channel that keeps recruiters unblocked.
 */

const MAX_MESSAGE_LENGTH = 500;

// GET — recruiters see their own requests; admins see all (default: pending).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const statusParam = req.nextUrl.searchParams.get("status");
  const status =
    statusParam === "PENDING" || statusParam === "APPROVED" || statusParam === "DECLINED"
      ? statusParam
      : undefined;

  const requests = await prisma.promotionRequest.findMany({
    where: {
      ...(isAdmin ? {} : { recruiterId: session.user.id }),
      // Admins default to the work queue: anything not yet resolved, which
      // includes invoices still awaiting payment.
      ...(status
        ? { status }
        : isAdmin
        ? { status: { in: ["PENDING", "INVOICED"] as const } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      message: true,
      createdAt: true,
      reviewedAt: true,
      reviewNote: true,
      packageDays: true,
      amountPkr: true,
      invoiceRef: true,
      invoicedAt: true,
      paidAt: true,
      jobPost: {
        select: {
          id: true,
          title: true,
          city: true,
          jobType: true,
          experienceLevel: true,
          salaryMin: true,
          salaryMax: true,
          isFeatured: true,
          featuredUntil: true,
          _count: { select: { applications: true } },
        },
      },
      recruiter: {
        select: { id: true, name: true, email: true, companyName: true },
      },
    },
  });

  return NextResponse.json(requests);
}

// POST — a recruiter requests promotion for one of their own listings.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "RECRUITER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { jobPostId, message, packageDays } = body as {
    jobPostId?: unknown;
    message?: unknown;
    packageDays?: unknown;
  };

  if (typeof jobPostId !== "string" || jobPostId.trim() === "") {
    return NextResponse.json({ error: "jobPostId required" }, { status: 400 });
  }

  // Price is frozen onto the request at this point, so later changes to the
  // package table never alter an invoice already quoted.
  const pkg = findPackage(packageDays ?? DEFAULT_PACKAGE_DAYS);
  if (!pkg) {
    return NextResponse.json(
      { error: "Choose one of the available promotion packages" },
      { status: 400 }
    );
  }
  if (message !== undefined && message !== null && typeof message !== "string") {
    return NextResponse.json({ error: "message must be text" }, { status: 400 });
  }
  const note =
    typeof message === "string" && message.trim() !== ""
      ? message.trim().slice(0, MAX_MESSAGE_LENGTH)
      : null;

  const job = await prisma.jobPost.findUnique({
    where: { id: jobPostId },
    select: {
      id: true,
      title: true,
      city: true,
      jobType: true,
      experienceLevel: true,
      salaryMin: true,
      salaryMax: true,
      isActive: true,
      isClosed: true,
      isFeatured: true,
      featuredUntil: true,
      recruiterId: true,
      _count: { select: { applications: true } },
    },
  });

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.recruiterId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // An outstanding invoice blocks a new request just as a pending one does.
  const existing = await prisma.promotionRequest.findFirst({
    where: { jobPostId, status: { in: ["PENDING", "INVOICED"] } },
    select: { id: true, status: true },
  });

  const eligibility = canRequestPromotion(
    { ...job, latestRequestStatus: existing ? existing.status : null },
    new Date()
  );
  if (!eligibility.allowed) {
    return NextResponse.json({ error: eligibility.reason }, { status: eligibility.status });
  }

  const recruiter = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, companyName: true },
  });

  let request;
  try {
    request = await prisma.promotionRequest.create({
      data: {
        jobPostId,
        recruiterId: session.user.id,
        message: note,
        packageDays: pkg.days,
        amountPkr: pkg.pricePkr,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        message: true,
        packageDays: true,
        amountPkr: true,
      },
    });
  } catch {
    // The partial unique index is the real guard — two concurrent requests can
    // both clear the findFirst check above.
    return NextResponse.json(
      { error: "A promotion request for this listing is already pending" },
      { status: 409 }
    );
  }

  const companyName = recruiter?.companyName || recruiter?.name || "A recruiter";

  // Goes through the shared channel, so it also reaches ADMIN_ALERT_EMAIL and
  // never throws back into the request that created the row.
  await notifyAdmins({
    type: "PROMOTION_REQUESTED",
    title: "Promotion requested",
    body: `${companyName} asked to promote "${job.title}" — ${pkg.label}, ${formatPkr(pkg.pricePkr)}`,
    data: { jobPostId: job.id, promotionRequestId: request.id },
    emailSubject: promotionRequestSubject({ jobTitle: job.title, companyName }),
    emailHtml: promotionRequestEmail({
      jobId: job.id,
      jobTitle: job.title,
      companyName,
      recruiterName: recruiter?.name ?? "Unknown",
      recruiterEmail: recruiter?.email ?? "",
      city: job.city,
      jobType: job.jobType,
      experienceLevel: job.experienceLevel,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      applicationCount: job._count.applications,
      message: note,
      packageLabel: pkg.label,
      amountPkr: pkg.pricePkr,
    }),
  });

  broadcast("promotion:requested", { jobPostId: job.id });

  return NextResponse.json(request, { status: 201 });
}
