import { Resend } from "resend";

const resend = new Resend(process.env.EMAIL_SERVER_PASSWORD);
const FROM = process.env.EMAIL_FROM || "noreply@paktechjobs.com";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends an email. Never throws â€” a failed send is logged and reported via the
 * return value so callers can decide whether to record it.
 *
 * Returns true only when Resend accepted the message. The re-engagement system
 * relies on this: an EmailLog row is written only for a genuine send, so the
 * admin dashboard never overstates what actually went out.
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
    if (error) {
      console.error("[email] send rejected:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] send error:", error);
    return false;
  }
}

// â”€â”€ Email templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function stageChangeEmail(opts: {
  applicantName: string;
  jobTitle: string;
  company: string;
  newStage: string;
  applicationId: string;
}): string {
  const stageLabels: Record<string, string> = {
    SEEN: "Your application has been viewed",
    SHORTLISTED: "You've been shortlisted! ðŸŽ‰",
    INTERVIEW: "You've been invited to interview! ðŸŽ¯",
    OFFER: "You've received an offer! ðŸ†",
    REJECTED: "Application update",
  };
  const headline = stageLabels[opts.newStage] || "Application status updated";
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#0a66c2">${headline}</h2>
      <p>Hi ${opts.applicantName},</p>
      <p>Your application for <strong>${opts.jobTitle}</strong> at <strong>${opts.company}</strong> has been updated.</p>
      <p>New status: <strong>${opts.newStage}</strong></p>
      <a href="${process.env.NEXTAUTH_URL}/dashboard" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#0a66c2;color:white;border-radius:8px;text-decoration:none">View Application</a>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">PakTechJobs Â· Pakistan's #1 Tech Job Board</p>
    </div>
  `;
}

export function interviewInviteEmail(opts: {
  applicantName: string;
  jobTitle: string;
  company: string;
  slots: string[];
}): string {
  const slotList = opts.slots.map(s => `<li>${new Date(s).toLocaleString()}</li>`).join("");
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#0a66c2">Interview Invitation ðŸŽ¯</h2>
      <p>Hi ${opts.applicantName},</p>
      <p>You've been invited to interview for <strong>${opts.jobTitle}</strong> at <strong>${opts.company}</strong>.</p>
      <p>Please select one of the following time slots:</p>
      <ul>${slotList}</ul>
      <a href="${process.env.NEXTAUTH_URL}/dashboard/interviews" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#0a66c2;color:white;border-radius:8px;text-decoration:none">Select Time Slot</a>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">PakTechJobs Â· Pakistan's #1 Tech Job Board</p>
    </div>
  `;
}

export function offerEmail(opts: {
  applicantName: string;
  jobTitle: string;
  company: string;
}): string {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#f59e0b">Congratulations! You have an offer ðŸ†</h2>
      <p>Hi ${opts.applicantName},</p>
      <p><strong>${opts.company}</strong> has extended an offer for <strong>${opts.jobTitle}</strong>.</p>
      <a href="${process.env.NEXTAUTH_URL}/dashboard" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#f59e0b;color:white;border-radius:8px;text-decoration:none">View Details</a>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">PakTechJobs Â· Pakistan's #1 Tech Job Board</p>
    </div>
  `;
}
