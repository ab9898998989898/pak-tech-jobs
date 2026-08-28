import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import crypto from "crypto";
import {
  notifyAdmins,
  adminEmailShell,
  adminTable,
  adminRow,
  adminCta,
  escapeHtml,
} from "@/lib/adminAlerts";

interface RegisterBody {
  email: string;
  password: string;
  name: string;
  role?: Role;
  companyName?: string;
  businessEmail?: string;
}

export async function POST(req: NextRequest) {
  let body: RegisterBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, password, name, role = Role.APPLICANT, companyName, businessEmail } = body;

  // Basic field validation
  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "email, password, and name are required" },
      { status: 400 }
    );
  }

  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  // Recruiter-specific requirements (Requirement 1.3)
  if (role === Role.RECRUITER) {
    if (!companyName || !businessEmail) {
      return NextResponse.json(
        { error: "Recruiters must provide a company name and business email" },
        { status: 400 }
      );
    }
    if (typeof businessEmail !== "string" || !businessEmail.includes("@")) {
      return NextResponse.json(
        { error: "Invalid business email address" },
        { status: 400 }
      );
    }
  }

  // Enforce unique email (Requirement 1.6)
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Generate email verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role,
      ...(role === Role.RECRUITER && {
        companyName,
        businessEmail,
        // Requirement 1.5 — new Recruiter accounts start unverified;
        // an Admin must approve the account before Job_Posts can be published.
        recruiterVerified: false,
      }),
    },
    select: { id: true, email: true, name: true, role: true },
  });

  // Send pending verification notification to recruiter
  if (role === Role.RECRUITER) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "RECRUITER_APPROVED", // reusing closest type
        title: "Account Under Review",
        body: "Your recruiter account is pending admin verification. You'll be notified once approved and can then start posting jobs.",
      },
    });

    // Tell the admin straight away — a recruiter cannot post until they are
    // approved, so an unnoticed signup is a stalled customer.
    await notifyAdmins({
      type: "RECRUITER_REGISTERED",
      title: "New recruiter registered",
      body: `${companyName} (${name}) signed up and needs verification.`,
      data: { userId: user.id },
      emailSubject: `New recruiter awaiting verification: ${companyName}`,
      emailHtml: adminEmailShell(`
        <h2 style="color:#0a66c2;margin-top:0">New recruiter registered</h2>
        <p>A recruiter account was created and is waiting for your approval.
           They cannot post a job until you verify them.</p>
        ${adminTable(
          [
            adminRow("Name", escapeHtml(name)),
            adminRow("Company", escapeHtml(companyName as string)),
            adminRow("Login email", escapeHtml(email)),
            adminRow("Business email", escapeHtml(businessEmail as string)),
            adminRow("Registered", new Date().toLocaleString("en-PK")),
          ].join("")
        )}
        ${adminCta("/admin", "Review in admin panel")}
      `),
    });
  }

  // Log verification link to console (no email service configured yet)
  const verificationUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/auth/verify-email?token=${verificationToken}&userId=${user.id}`;
  console.log(`[EMAIL VERIFICATION] Send to ${email}: ${verificationUrl}`);

  return NextResponse.json(
    {
      message: "Account created. Please check your email to verify your account.",
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    },
    { status: 201 }
  );
}
