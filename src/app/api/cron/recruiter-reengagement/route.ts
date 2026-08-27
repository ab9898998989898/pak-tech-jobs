import { NextRequest, NextResponse } from "next/server";
import { runRecruiterReengagement } from "@/jobs/recruiterReengagement";

/**
 * GET /api/cron/recruiter-reengagement
 *
 * Daily sweep that emails lapsed and never-posted recruiters.
 * Protected by CRON_SECRET, matching the other cron endpoints.
 */

// Sends are throttled to stay under Resend's rate limit, so the run is
// wall-clock bound by recruiter count rather than CPU.
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
    const result = await runRecruiterReengagement();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[recruiter-reengagement cron] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
