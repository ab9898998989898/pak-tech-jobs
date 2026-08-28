import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ExperienceLevel, JobType, VerificationStatus } from "@prisma/client";
import {
  notifyAdmins,
  adminEmailShell,
  adminTable,
  adminRow,
  adminCta,
  escapeHtml,
} from "@/lib/adminAlerts";

// POST /api/salaries — Authenticated user submits a salary entry
// Requirements: 10.2, 10.3, 10.4
export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    roleTitle,
    experienceLevel,
    city,
    salaryAmount,
    employmentType,
    techStack,
    evidenceUrl,
  } = body as Record<string, unknown>;

  // Validate required fields (Requirement 10.2)
  const missing: string[] = [];
  if (!roleTitle || typeof roleTitle !== "string" || roleTitle.trim() === "") missing.push("roleTitle");
  if (!experienceLevel) missing.push("experienceLevel");
  if (!city || typeof city !== "string" || city.trim() === "") missing.push("city");
  if (salaryAmount === undefined || salaryAmount === null) missing.push("salaryAmount");
  if (!employmentType) missing.push("employmentType");

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Missing required fields", fields: missing },
      { status: 400 }
    );
  }

  // Validate experienceLevel enum
  if (!Object.values(ExperienceLevel).includes(experienceLevel as ExperienceLevel)) {
    return NextResponse.json({ error: "Invalid experienceLevel" }, { status: 400 });
  }

  // Validate employmentType enum
  if (!Object.values(JobType).includes(employmentType as JobType)) {
    return NextResponse.json({ error: "Invalid employmentType" }, { status: 400 });
  }

  // Validate salaryAmount is a positive number (Requirement 10.2)
  const salary = Number(salaryAmount);
  if (isNaN(salary) || salary <= 0) {
    return NextResponse.json(
      { error: "salaryAmount must be a positive number" },
      { status: 400 }
    );
  }

  // Validate optional techStack
  if (techStack !== undefined && !Array.isArray(techStack)) {
    return NextResponse.json({ error: "techStack must be an array of strings" }, { status: 400 });
  }

  // Validate optional evidenceUrl
  if (evidenceUrl !== undefined && typeof evidenceUrl !== "string") {
    return NextResponse.json({ error: "evidenceUrl must be a string" }, { status: 400 });
  }

  // Requirement 10.3, 10.4: set verificationStatus based on evidence presence
  const verificationStatus: VerificationStatus =
    evidenceUrl && (evidenceUrl as string).trim() !== ""
      ? VerificationStatus.PENDING
      : VerificationStatus.UNVERIFIED;

  try {
    const entry = await prisma.salaryEntry.create({
      data: {
        submittedById: session.user.id,
        roleTitle: (roleTitle as string).trim(),
        experienceLevel: experienceLevel as ExperienceLevel,
        city: (city as string).trim(),
        salaryAmount: Math.round(salary),
        employmentType: employmentType as JobType,
        techStack: Array.isArray(techStack) ? (techStack as string[]) : [],
        verificationStatus,
        evidenceUrl: evidenceUrl ? (evidenceUrl as string).trim() : null,
      },
    });

    // Only entries with evidence land in the admin review queue; unverified
    // ones need no decision, so alerting on them would be noise.
    if (verificationStatus === VerificationStatus.PENDING) {
      await notifyAdmins({
        type: "SALARY_SUBMITTED",
        title: "Salary entry awaiting verification",
        body: `${entry.roleTitle} in ${entry.city} — evidence submitted.`,
        data: { salaryEntryId: entry.id },
        emailSubject: `Salary entry to verify: ${entry.roleTitle} (${entry.city})`,
        emailHtml: adminEmailShell(`
          <h2 style="color:#0a66c2;margin-top:0">Salary entry awaiting verification</h2>
          <p>Someone submitted a salary with supporting evidence, so it needs a
             decision before it counts toward the public benchmarks.</p>
          ${adminTable(
            [
              adminRow("Role", escapeHtml(entry.roleTitle)),
              adminRow("City", escapeHtml(entry.city)),
              adminRow("Level", escapeHtml(entry.experienceLevel)),
              adminRow("Amount", `PKR ${entry.salaryAmount.toLocaleString("en-PK")}`),
              adminRow("Type", escapeHtml(entry.employmentType)),
            ].join("")
          )}
          ${adminCta("/admin", "Review in admin panel")}
        `),
      });
    }

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("[POST /api/salaries] error:", error);
    return NextResponse.json({ error: "Failed to create salary entry" }, { status: 500 });
  }
}

// GET /api/salaries — Public endpoint returning aggregated salary stats
// Requirements: 10.1, 10.6, 10.7
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const role = searchParams.get("role")?.trim() || undefined;
  const experienceLevelParam = searchParams.get("experienceLevel") || undefined;
  const city = searchParams.get("city")?.trim() || undefined;
  const techStackParam = searchParams.get("techStack") || undefined;

  // Validate experienceLevel if provided
  if (
    experienceLevelParam &&
    !Object.values(ExperienceLevel).includes(experienceLevelParam as ExperienceLevel)
  ) {
    return NextResponse.json({ error: "Invalid experienceLevel" }, { status: 400 });
  }

  const experienceLevel = experienceLevelParam as ExperienceLevel | undefined;
  const techStack = techStackParam
    ? techStackParam.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  try {
    // Fetch only VERIFIED entries (Requirement 10.6)
    const entries = await prisma.salaryEntry.findMany({
      where: {
        verificationStatus: VerificationStatus.VERIFIED,
        ...(role ? { roleTitle: { contains: role, mode: "insensitive" } } : {}),
        ...(experienceLevel ? { experienceLevel } : {}),
        ...(city ? { city: { contains: city, mode: "insensitive" } } : {}),
        ...(techStack && techStack.length > 0
          ? { techStack: { hasSome: techStack } }
          : {}),
      },
      select: {
        roleTitle: true,
        experienceLevel: true,
        city: true,
        salaryAmount: true,
      },
    });

    // Group by (roleTitle, experienceLevel, city)
    const groups = new Map<
      string,
      { roleTitle: string; experienceLevel: ExperienceLevel; city: string; amounts: number[] }
    >();

    for (const entry of entries) {
      const key = `${entry.roleTitle}|${entry.experienceLevel}|${entry.city}`;
      if (!groups.has(key)) {
        groups.set(key, {
          roleTitle: entry.roleTitle,
          experienceLevel: entry.experienceLevel,
          city: entry.city,
          amounts: [],
        });
      }
      groups.get(key)!.amounts.push(entry.salaryAmount);
    }

    // Build response: aggregate stats or insufficientData flag (Requirements 10.6, 10.7)
    const results = Array.from(groups.values()).map((group) => {
      const { roleTitle, experienceLevel: expLevel, city: groupCity, amounts } = group;
      const count = amounts.length;

      if (count < 3) {
        return { roleTitle, experienceLevel: expLevel, city: groupCity, insufficientData: true };
      }

      const sorted = [...amounts].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const median = calculateMedian(sorted);

      return { roleTitle, experienceLevel: expLevel, city: groupCity, min, median, max, count };
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("[GET /api/salaries] error:", error);
    return NextResponse.json({ error: "Failed to fetch salary data" }, { status: 500 });
  }
}

/**
 * Calculate the median of a pre-sorted array of numbers.
 * For even-length arrays, returns the average of the two middle values.
 */
function calculateMedian(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
