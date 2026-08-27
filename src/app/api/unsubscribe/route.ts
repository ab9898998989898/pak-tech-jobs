import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/unsubscribe  { token }
 *
 * Public, token-authenticated opt-out from automated re-engagement mail.
 * Deliberately requires no session — an unsubscribe link that demands a login
 * is one spam filters and CAN-SPAM both treat as a non-answer.
 *
 * Transactional mail (application updates, interview invites) is unaffected.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = (body as { token?: unknown }).token;
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // The token is a 256-bit random value stored unique on the user, so a direct
  // lookup is the authentication step.
  const user = await prisma.user.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, marketingEmailsEnabled: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  if (user.marketingEmailsEnabled) {
    await prisma.user.update({
      where: { id: user.id },
      data: { marketingEmailsEnabled: false },
    });
  }

  return NextResponse.json({ ok: true, unsubscribed: true });
}

/**
 * PUT /api/unsubscribe  { token }
 *
 * Re-subscribe, for the "unsubscribed by mistake" case on the confirmation page.
 */
export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = (body as { token?: unknown }).token;
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { marketingEmailsEnabled: true },
  });

  return NextResponse.json({ ok: true, unsubscribed: false });
}
