import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { JobType, ExperienceLevel, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { requireVerifiedRecruiter } from "@/lib/requireVerifiedRecruiter";
import { broadcast } from "@/lib/socketio";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import { rateLimitByUser, RATE_LIMITS } from "@/lib/rateLimit";
import { sortJobsByPromotion } from "@/lib/promotedListings";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const q = searchParams.get("q")?.trim() || undefined;
  const category = searchParams.get("category") || undefined;
  const city = searchParams.get("city") || undefined;
  const jobTypeParam = searchParams.get("jobType") || undefined;
  const experienceLevelParam = searchParams.get("experienceLevel") || undefined;
  const salaryMinParam = searchParams.get("salaryMin");
  const salaryMaxParam = searchParams.get("salaryMax");
  const responseRateParam = searchParams.get("responseRate");

  // Validate enum values
  const jobType =
    jobTypeParam && Object.values(JobType).includes(jobTypeParam as JobType)
      ? (jobTypeParam as JobType)
      : undefined;

  const experienceLevel =
    experienceLevelParam &&
    Object.values(ExperienceLevel).includes(
      experienceLevelParam as ExperienceLevel
    )
      ? (experienceLevelParam as ExperienceLevel)
      : undefined;

  const salaryMin = salaryMinParam ? parseInt(salaryMinParam, 10) : undefined;
  const salaryMax = salaryMaxParam ? parseInt(salaryMaxParam, 10) : undefined;
  const responseRate = responseRateParam
    ? parseFloat(responseRateParam)
    : undefined;

  // Build the where clause
  const where: Prisma.JobPostWhereInput = {
    isActive: true,
    isClosed: false,
  };

  // Keyword search across title, description, and skills (case-insensitive)
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { skills: { has: q } },
    ];
  }

  if (category) {
    where.category = { has: category };
  }

  if (city) {
    where.city = { contains: city, mode: "insensitive" };
  }

  if (jobType) {
    where.jobType = jobType;
  }

  if (experienceLevel) {
    where.experienceLevel = experienceLevel;
  }

  // Salary range overlap: job's range overlaps with the requested range
  if (salaryMin !== undefined) {
    // Job must have salaryMax >= requested salaryMin
    where.salaryMax = { gte: salaryMin };
  }

  if (salaryMax !== undefined) {
    // Job must have salaryMin <= requested salaryMax
    where.salaryMin = {
      ...(where.salaryMin as Prisma.IntFilter | undefined),
      lte: salaryMax,
    };
  }

  // Recruiter response rate filter
  if (responseRate !== undefined) {
    where.recruiter = {
      responseRate: { gte: responseRate },
    };
  }

  const cacheKey = `jobs:${JSON.stringify({ q, category, city, jobType, experienceLevel, salaryMin, salaryMax, responseRate })}`;
  const cached = await getCached(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const rows = await prisma.jobPost.findMany({
      where,
      orderBy: [{ isPremium: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        skills: true,
        city: true,
        location: true,
        salaryMin: true,
        salaryMax: true,
        experienceLevel: true,
        jobType: true,
        category: true,
        createdAt: true,
        applyUrl: true,
        isPremium: true,
        isFeatured: true,
        featuredUntil: true,
        recruiter: {
          select: {
            id: true,
            name: true,
            companyName: true,
            // responseRate defaults to 100 and avgResponseTimeHours to null on creation (schema defaults)
            responseRate: true,
            avgResponseTimeHours: true,
            recruiterVerified: true,
          },
        },
      },
    });

    // Promoted listings rank above everything else. Applied here rather than in
    // the SQL ORDER BY because a promotion whose featuredUntil has passed must
    // stop ranking immediately, not at the next nightly expiry cron.
    const jobs = sortJobsByPromotion(rows, new Date());

    await setCached(cacheKey, jobs, 120);
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("[GET /api/jobs] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const guard = await requireVerifiedRecruiter(session);
  if (guard) return guard;

  const rl = await rateLimitByUser(session!.user.id, RATE_LIMITS.jobPost);
  if (rl) return rl;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    title,
    description,
    skills,
    location,
    city,
    salaryMin,
    salaryMax,
    experienceLevel,
    jobType,
    category,
    requiredFields,
    isPremium,
  } = body as Record<string, unknown>;

  // Required field validation (Requirement 2.1, 2.2)
  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!description) missing.push("description");
  if (!location) missing.push("location");
  if (!city) missing.push("city");
  if (salaryMin === undefined || salaryMin === null) missing.push("salaryMin");
  if (salaryMax === undefined || salaryMax === null) missing.push("salaryMax");
  if (!experienceLevel) missing.push("experienceLevel");
  if (!jobType) missing.push("jobType");

  // At least one skill tag required (Requirement 2.2)
  if (!Array.isArray(skills) || skills.length === 0) missing.push("skills (at least 1 required)");

  // At least one category required
  if (!Array.isArray(category) || category.length === 0) missing.push("category");

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Missing required fields", fields: missing },
      { status: 400 }
    );
  }

  // Validate enum values
  if (!Object.values(ExperienceLevel).includes(experienceLevel as ExperienceLevel)) {
    return NextResponse.json({ error: "Invalid experienceLevel" }, { status: 400 });
  }
  if (!Object.values(JobType).includes(jobType as JobType)) {
    return NextResponse.json({ error: "Invalid jobType" }, { status: 400 });
  }

  // Salary range sanity check
  const min = Number(salaryMin);
  const max = Number(salaryMax);
  if (isNaN(min) || isNaN(max) || min < 0 || max < min) {
    return NextResponse.json(
      { error: "salaryMin and salaryMax must be valid numbers with salaryMin <= salaryMax" },
      { status: 400 }
    );
  }

  try {
    // Fetch the recruiter's tier to enforce isPremium access control
    const recruiter = await prisma.user.findUnique({
      where: { id: session!.user.id },
      select: { tier: true },
    });
    const canPremium = recruiter?.tier === "PRO" || recruiter?.tier === "ENTERPRISE";

    const job = await prisma.jobPost.create({
      data: {
        recruiterId: session!.user.id,
        title: title as string,
        description: description as string,
        skills: skills as string[],
        location: location as string,
        city: city as string,
        salaryMin: min,
        salaryMax: max,
        experienceLevel: experienceLevel as ExperienceLevel,
        jobType: jobType as JobType,
        category: category as string[],
        requiredFields: Array.isArray(requiredFields) ? requiredFields as string[] : ["name", "email"],
        isPremium: canPremium && isPremium === true,
      },
    });

    // Requirement 13.4: broadcast updated active job count to all clients (non-blocking)
    const activeCount = await prisma.jobPost.count({ where: { isActive: true, isClosed: false } });
    broadcast("jobs:count_updated", { activeCount });
    await invalidateCache("jobs:*");

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    console.error("[POST /api/jobs] error:", error);
    return NextResponse.json({ error: "Failed to create job post" }, { status: 500 });
  }
}
