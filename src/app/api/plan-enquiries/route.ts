import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  notifyAdmins,
  adminEmailShell,
  adminTable,
  adminRow,
  adminCta,
  escapeHtml,
} from "@/lib/adminAlerts";

/**
 * "Contact sales" for the paid tiers.
 *
 * The Premium toggle already told FREE recruiters to "Contact Sales to Unlock"
 * but gave them no way to do it. This turns that dead end into a tracked
 * enquiry that alerts the admin.
 */

const MAX_MESSAGE_LENGTH = 500;

// GET — recruiters see their own enquiries; admins see the open queue.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const statusParam = req.nextUrl.searchParams.get("status");
  const status = statusParam === "OPEN" || statusParam === "CLOSED" ? statusParam : undefined;

  const enquiries = await prisma.planEnquiry.findMany({
    where: {
      ...(isAdmin ? {} : { recruiterId: session.user.id }),
      ...(status ? { status } : isAdmin ? { status: "OPEN" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      kind: true,
      message: true,
      status: true,
      createdAt: true,
      handledAt: true,
      recruiter: {
        select: { id: true, name: true, email: true, companyName: true, tier: true },
      },
    },
  });

  return NextResponse.json(enquiries);
}

// POST — a recruiter asks about upgrading.
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

  const { kind, message } = body as { kind?: unknown; message?: unknown };

  if (kind !== "PREMIUM" && kind !== "ENTERPRISE") {
    return NextResponse.json(
      { error: 'kind must be "PREMIUM" or "ENTERPRISE"' },
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

  // One open enquiry per recruiter per tier — repeat clicks should not create
  // a queue of duplicates for the admin to wade through.
  const existing = await prisma.planEnquiry.findFirst({
    where: { recruiterId: session.user.id, kind, status: "OPEN" },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "We already have your enquiry and will be in touch shortly" },
      { status: 409 }
    );
  }

  const recruiter = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, companyName: true, tier: true },
  });

  const enquiry = await prisma.planEnquiry.create({
    data: { recruiterId: session.user.id, kind, message: note },
    select: { id: true, kind: true, status: true, createdAt: true },
  });

  const company = recruiter?.companyName || recruiter?.name || "A recruiter";

  await notifyAdmins({
    type: "PLAN_ENQUIRY",
    title: `${kind} enquiry`,
    body: `${company} is asking about the ${kind} plan.`,
    data: { planEnquiryId: enquiry.id, kind },
    emailSubject: `${kind} plan enquiry from ${company}`,
    emailHtml: adminEmailShell(`
      <h2 style="color:#0a66c2;margin-top:0">${kind} plan enquiry</h2>
      <p><strong>${escapeHtml(company)}</strong> wants to talk about upgrading.</p>
      ${adminTable(
        [
          adminRow("Company", escapeHtml(company)),
          adminRow("Contact", escapeHtml(recruiter?.name ?? "")),
          adminRow("Email", escapeHtml(recruiter?.email ?? "")),
          adminRow("Current tier", escapeHtml(recruiter?.tier ?? "FREE")),
          adminRow("Interested in", kind),
        ].join("")
      )}
      ${
        note
          ? `<blockquote style="margin:16px 0 0;padding:10px 14px;border-left:3px solid #0a66c2;background:#f4f7fb;font-size:13px">${escapeHtml(note)}</blockquote>`
          : ""
      }
      ${adminCta("/admin", "Open admin panel")}
    `),
  });

  return NextResponse.json(enquiry, { status: 201 });
}
