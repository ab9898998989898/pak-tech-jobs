import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobs = await prisma.jobPost.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      city: true,
      jobType: true,
      experienceLevel: true,
      isActive: true,
      isClosed: true,
      createdAt: true,
      salaryMin: true,
      salaryMax: true,
      skills: true,
      isPremium: true,
      isFeatured: true,
      featuredUntil: true,
      recruiter: {
        select: { id: true, name: true, companyName: true, email: true },
      },
      _count: { select: { applications: true } },
    },
  });

  return NextResponse.json(jobs);
}
