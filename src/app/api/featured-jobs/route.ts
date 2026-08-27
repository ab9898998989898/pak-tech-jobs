import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";
import {
  promotionExpiry,
  validatePromotionDays,
} from "@/lib/promotedListings";

/**
 * Promoted ("featured") listings.
 *
 * Promotion is admin-controlled. There is no payment integration yet, so a
 * self-serve toggle would let every recruiter promote every listing for free
 * and flatten the ranking it exists to create.
 */

// GET — public: currently promoted jobs.
export async function GET() {
  const jobs = await prisma.jobPost.findMany({
    where: {
      isActive: true,
      isClosed: false,
      isFeatured: true,
      // Exclude promotions that lapsed since the nightly expiry cron last ran.
      OR: [{ featuredUntil: null }, { featuredUntil: { gt: new Date() } }],
    },
    orderBy: { featuredUntil: "desc" },
    select: {
      id: true, title: true, city: true, jobType: true,
      experienceLevel: true, salaryMin: true, salaryMax: true,
      skills: true, featuredUntil: true,
      recruiter: { select: { id: true, name: true, companyName: true, recruiterVerified: true } },
    },
    take: 6,
  });
  return NextResponse.json(jobs);
}

// POST — admin only: promote a listing for a bounded number of days.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { jobPostId, days } = body as { jobPostId?: unknown; days?: unknown };

  if (typeof jobPostId !== "string" || jobPostId.trim() === "") {
    return NextResponse.json({ error: "jobPostId required" }, { status: 400 });
  }

  const validation = validatePromotionDays(days);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const job = await prisma.jobPost.findUnique({
    where: { id: jobPostId },
    select: { id: true },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const updated = await prisma.jobPost.update({
    where: { id: jobPostId },
    data: {
      isFeatured: true,
      featuredUntil: promotionExpiry(validation.days, new Date()),
    },
    select: { id: true, title: true, isFeatured: true, featuredUntil: true },
  });

  // Browse results are cached for 2 minutes and carry the promoted ordering.
  await invalidateCache("jobs:*");

  return NextResponse.json(updated);
}

// DELETE — admin only: end a promotion immediately.
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobPostId = req.nextUrl.searchParams.get("jobPostId");
  if (!jobPostId) {
    return NextResponse.json({ error: "jobPostId required" }, { status: 400 });
  }

  const job = await prisma.jobPost.findUnique({
    where: { id: jobPostId },
    select: { id: true },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const updated = await prisma.jobPost.update({
    where: { id: jobPostId },
    data: { isFeatured: false, featuredUntil: null },
    select: { id: true, title: true, isFeatured: true, featuredUntil: true },
  });

  await invalidateCache("jobs:*");

  return NextResponse.json(updated);
}
