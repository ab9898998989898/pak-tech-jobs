import { NextRequest, NextResponse } from "next/server";
import { runSeekerJobDigest } from "@/jobs/seekerJobDigest";

/**
 * GET /api/cron/seeker-digest
 *
 * Daily digest of newly posted jobs for job seekers.
 * Protected by CRON_SECRET, matching the other cron endpoints.
 */

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const isAuthorized =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    cronSecret === process.env.CRON_SECRET;

  if (!process.env.CRON_SECRET || !isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSeekerJobDigest();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[seeker-digest cron] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
