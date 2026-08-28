import { NextRequest, NextResponse } from "next/server";
import { runExpireSubscriptions } from "@/jobs/expireSubscriptions";

/**
 * GET /api/cron/expire-subscriptions
 *
 * Nightly sweep that downgrades lapsed paid employers and warns those close to
 * expiry. Protected by CRON_SECRET, matching the other cron endpoints.
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
    const result = await runExpireSubscriptions();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[expire-subscriptions cron] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
