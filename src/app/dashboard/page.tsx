"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { io, Socket } from "socket.io-client";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PipelineStage =
  | "APPLIED"
  | "SEEN"
  | "SHORTLISTED"
  | "INTERVIEW"
  | "OFFER"
  | "REJECTED"
  | "EXPIRED";

type RejectionReason =
  | "PORTFOLIO_GAP"
  | "SALARY_MISMATCH"
  | "SPECIFIC_SKILL_MISSING"
  | "ROLE_FILLED"
  | "OVERQUALIFIED";

interface Application {
  id: string;
  stage: PipelineStage;
  submittedAt: string;
  updatedAt: string;
  isWithdrawn: boolean;
  rejectionReason: RejectionReason | null;
  recruiterNotes: string | null;
  jobPost: {
    id: string;
    title: string;
    city: string;
    location: string;
    jobType: string;
    recruiter: {
      id: string;
      name: string;
      companyName: string | null;
      responseRate: number;
      avgResponseTimeHours: number | null;
      recruiterVerified: boolean;
    };
  };
}

interface ApplicationDetail {
  id: string;
  stage: string;
  submittedAt: string;
  applicantName: string | null;
  applicantEmail: string | null;
  applicantPhone: string | null;
  yearsOfExperience: number | null;
  coverLetter: string | null;
  cvPublicId: string | null;
  cvFileName: string | null;
  jobPost: {
    id: string;
    title: string;
    city: string;
    jobType: string;
    recruiter: { name: string; companyName: string | null };
  };
}

interface UserProfile {
  id: string;
  name: string;
  skills: string[];
  experienceLevel: string | null;
  targetRoles: string[];
  openToOpportunities: boolean;
}

interface DemandSkill {
  skill: string;
  count: number;
}

// ─── Rejection reason labels ──────────────────────────────────────────────────

const REJECTION_REASON_LABEL: Record<RejectionReason, string> = {
  PORTFOLIO_GAP: "Portfolio Gap",
  SALARY_MISMATCH: "Salary Mismatch",
  SPECIFIC_SKILL_MISSING: "Specific Skill Missing",
  ROLE_FILLED: "Role Filled",
  OVERQUALIFIED: "Overqualified",
};

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGE_LABEL: Record<PipelineStage, string> = {
  APPLIED: "Applied",
  SEEN: "Seen",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview Scheduled",
  OFFER: "Offer Received",
  REJECTED: "Feedback Received",
  EXPIRED: "Expired",
};

const STAGE_CLASSES: Record<PipelineStage, string> = {
  APPLIED:
    "bg-surface text-muted border border-border",
  SEEN:
    "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  SHORTLISTED:
    "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  INTERVIEW:
    "bg-success/10 text-success border border-success/20",
  OFFER:
    "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  REJECTED:
    "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  EXPIRED:
    "bg-red-500/10 text-red-400 border border-red-500/20",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated 1 day ago";
  return `Updated ${days} days ago`;
}

function ResponseRateBadge({ rate }: { rate: number }) {
  const rounded = Math.round(rate);
  if (rounded >= 90) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20">
        ✓ {rounded}% Highly Responsive
      </span>
    );
  }
  if (rounded >= 70) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
        ~ {rounded}% Responsive
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
      ⚠ {rounded}% Low Responsiveness
    </span>
  );
}

// ─── Application Detail Modal ─────────────────────────────────────────────────

function ApplicationDetailModal({ applicationId, onClose }: { applicationId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cvLoading, setCvLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/applications/${applicationId}`)
      .then(r => r.json())
      .then(data => { if (!data.error) setDetail(data); })
      .finally(() => setLoading(false));
  }, [applicationId]);

  const handleViewCV = async () => {
    if (!detail?.cvPublicId) return;
    setCvLoading(true);
    const res = await fetch(`/api/upload/cv-url?publicId=${encodeURIComponent(detail.cvPublicId)}`);
    const data = await res.json();
    if (data.url) window.open(data.url, "_blank");
    setCvLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-border dark:border-border-dark bg-card dark:bg-card-dark rounded-t-2xl sm:rounded-t-2xl">
          <h2 className="text-base font-semibold text-foreground">My Application</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface dark:hover:bg-surface-dark transition-colors text-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !detail ? (
          <p className="text-center text-muted py-10">Failed to load details</p>
        ) : (
          <div className="p-5 space-y-5">
            {/* Job info */}
            <div className="rounded-xl bg-surface dark:bg-surface-dark p-4">
              <p className="text-xs text-muted mb-0.5">Applied to</p>
              <p className="font-semibold text-foreground">{detail.jobPost.title}</p>
              <p className="text-sm text-muted mt-0.5">
                {detail.jobPost.recruiter.companyName || detail.jobPost.recruiter.name} · {detail.jobPost.city}
              </p>
            </div>

            {/* Submitted info */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">What you submitted</h3>

              {detail.applicantName && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Full Name</span>
                  <span className="font-medium text-foreground">{detail.applicantName}</span>
                </div>
              )}
              {detail.applicantEmail && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Email</span>
                  <span className="font-medium text-foreground truncate ml-4">{detail.applicantEmail}</span>
                </div>
              )}
              {detail.applicantPhone && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Phone</span>
                  <span className="font-medium text-foreground">{detail.applicantPhone}</span>
                </div>
              )}
              {detail.yearsOfExperience != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Experience</span>
                  <span className="font-medium text-foreground">{detail.yearsOfExperience} year{detail.yearsOfExperience !== 1 ? "s" : ""}</span>
                </div>
              )}
              {detail.coverLetter && (
                <div className="text-sm">
                  <p className="text-muted mb-1.5">Cover Letter</p>
                  <p className="text-foreground leading-relaxed bg-surface dark:bg-surface-dark rounded-lg p-3 text-xs whitespace-pre-wrap">{detail.coverLetter}</p>
                </div>
              )}
              {detail.cvPublicId ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">CV / Resume</span>
                  <button
                    onClick={handleViewCV}
                    disabled={cvLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                  >
                    {cvLoading ? "Loading…" : `📄 ${detail.cvFileName || "View CV"}`}
                  </button>
                </div>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">CV / Resume</span>
                  <span className="text-muted italic">Not submitted</span>
                </div>
              )}
            </div>

            {/* Submitted at */}
            <p className="text-xs text-muted text-center pt-2 border-t border-border dark:border-border-dark">
              Submitted {new Date(detail.submittedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border dark:border-border-dark bg-card dark:bg-card-dark p-6 animate-pulse space-y-3">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-surface dark:bg-surface-dark" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-surface dark:bg-surface-dark" />
          <div className="h-3 w-1/3 rounded bg-surface dark:bg-surface-dark" />
        </div>
      </div>
      <div className="h-6 w-28 rounded-full bg-surface dark:bg-surface-dark" />
      <div className="h-3 w-40 rounded bg-surface dark:bg-surface-dark" />
    </div>
  );
}

// ─── Application Card ─────────────────────────────────────────────────────────

function ApplicationCard({ app, onViewDetail, onWithdraw }: { app: Application; onViewDetail: (id: string) => void; onWithdraw: (id: string) => void }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const { jobPost } = app;
  if (!jobPost || !jobPost.recruiter) return null;
  const companyName = jobPost.recruiter.companyName ?? jobPost.recruiter.name;
  const isRemote =
    jobPost.jobType === "REMOTE" ||
    jobPost.location.toLowerCase().includes("remote");
  const showFeedback =
    app.stage === "REJECTED" && app.rejectionReason != null;

  return (
    <div className="rounded-2xl border border-border dark:border-border-dark bg-card dark:bg-card-dark p-6 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/40 hover:-translate-y-0.5">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-11 h-11 flex-shrink-0 rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark flex items-center justify-center">
          <span className="text-lg font-bold text-muted">
            {companyName.charAt(0)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-foreground truncate">
            {jobPost.title}
          </h3>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-sm text-muted mt-0.5">
            <span className="font-medium">
              {companyName}
              {jobPost.recruiter.recruiterVerified && (
                <span className="ml-1 text-blue-400" title="Verified Company">
                  ✓
                </span>
              )}
            </span>
            <span className="hidden sm:inline">•</span>
            <span className={isRemote ? "text-success" : ""}>
              {isRemote ? "🌍 Remote" : `📍 ${jobPost.city}`}
            </span>
          </div>
        </div>
      </div>

      {/* Stage badge */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${STAGE_CLASSES[app.stage]}`}
        >
          {STAGE_LABEL[app.stage]}
        </span>
        <span className="text-xs text-muted">{timeAgo(app.updatedAt)}</span>
      </div>

      {/* Response rate */}
      <ResponseRateBadge rate={jobPost.recruiter.responseRate} />

      {/* Rejection feedback — Requirement 7.4 */}
      {showFeedback && (
        <div className="mt-4 border-t border-border dark:border-border-dark pt-3">
          <button
            onClick={() => setFeedbackOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-medium text-orange-400 hover:text-orange-300 transition-colors"
          >
            <span>{feedbackOpen ? "▾" : "▸"}</span>
            Feedback
          </button>
          {feedbackOpen && (
            <div className="mt-2 rounded-xl bg-orange-500/5 border border-orange-500/20 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Reason:</span>
                <span className="font-semibold text-orange-300">
                  {REJECTION_REASON_LABEL[app.rejectionReason!]}
                </span>
              </div>
              {app.recruiterNotes && (
                <div className="text-sm text-muted">
                  <span className="font-medium text-foreground">Notes: </span>
                  {app.recruiterNotes}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 pt-3 border-t border-border dark:border-border-dark flex items-center justify-between gap-3">
        <button
          onClick={() => onViewDetail(app.id)}
          className="text-xs text-primary hover:underline"
        >
          View submitted details →
        </button>
        {!app.isWithdrawn && !["OFFER","REJECTED","EXPIRED"].includes(app.stage) && (
          confirmWithdraw ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Withdraw?</span>
              <button
                onClick={() => { onWithdraw(app.id); setConfirmWithdraw(false); }}
                className="text-xs text-red-400 hover:text-red-300 font-medium"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmWithdraw(false)}
                className="text-xs text-muted hover:text-foreground"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmWithdraw(true)}
              className="text-xs text-red-400 hover:text-red-300 hover:underline"
            >
              Withdraw
            </button>
          )
        )}
        {app.isWithdrawn && (
          <span className="text-xs text-muted italic">Withdrawn</span>
        )}
      </div>
    </div>
  );
}

// ─── Skill Gap Report ─────────────────────────────────────────────────────────
// Requirement 7.5

function SkillGapReport() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [topSkills, setTopSkills] = useState<DemandSkill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => r.json()),
      fetch("/api/demand?timeRange=30").then((r) => r.json()),
    ])
      .then(([profileData, demandData]) => {
        if (profileData && !profileData.error) {
          setProfile(profileData as UserProfile);
        }
        if (demandData?.mode === "snapshot" && Array.isArray(demandData.data)) {
          setTopSkills((demandData.data as DemandSkill[]).slice(0, 10));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border dark:border-border-dark bg-card dark:bg-card-dark p-6 animate-pulse space-y-3">
        <div className="h-5 w-40 rounded bg-surface dark:bg-surface-dark" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 rounded-lg bg-surface dark:bg-surface-dark" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile || topSkills.length === 0) return null;

  const userSkillsLower = new Set(
    profile.skills.map((s) => s.toLowerCase())
  );
  const matchCount = topSkills.filter((s) =>
    userSkillsLower.has(s.skill.toLowerCase())
  ).length;

  return (
    <div className="rounded-2xl border border-border dark:border-border-dark bg-card dark:bg-card-dark p-6">
      <h2 className="text-lg font-semibold mb-1">Skill Gap Report</h2>
      <p className="text-sm text-muted mb-4">
        You have{" "}
        <span className="font-semibold text-foreground">
          {matchCount} of {topSkills.length}
        </span>{" "}
        top demanded skills
      </p>
      <ul className="space-y-2">
        {topSkills.map((item) => {
          const has = userSkillsLower.has(item.skill.toLowerCase());
          return (
            <li
              key={item.skill}
              className="flex items-center justify-between rounded-lg px-4 py-2.5 bg-surface dark:bg-surface-dark"
            >
              <span className="text-sm font-medium">{item.skill}</span>
              {has ? (
                <span className="text-success text-sm font-semibold">✓ Have it</span>
              ) : (
                <span className="text-red-400 text-sm font-semibold">✗ Gap</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session } = useSession();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; stage: string } | null>(null);
  const [socketConnected, setSocketConnected] = useState(true);
  const [detailAppId, setDetailAppId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Header entrance
    gsap.fromTo(".dash-header",
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, ease: "expo.out" }
    );
    // Nav pills stagger
    gsap.fromTo(".dash-nav-link",
      { y: 20, opacity: 0, scale: 0.9 },
      { y: 0, opacity: 1, scale: 1, duration: 0.5, stagger: 0.07, ease: "back.out(1.5)", delay: 0.3 }
    );
  }, { scope: containerRef, dependencies: [] });

  // Fetch applications on mount
  useEffect(() => {
    fetch("/api/applications")
      .then((r) => r.json())
      .then((data: Application[]) => {
        if (Array.isArray(data)) setApplications(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Socket.io: real-time stage updates
  const sessionUserId = session?.user?.id;
  useEffect(() => {
    if (!sessionUserId) return;

    const socket = io(window.location.origin, {
      path: "/api/socketio",
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on(
      "application:stage_changed",
      ({ applicationId, newStage, jobTitle }: { applicationId: string; newStage: PipelineStage; jobTitle?: string }) => {
        setApplications((prev) =>
          prev.map((app) =>
            app.id === applicationId
              ? { ...app, stage: newStage, updatedAt: new Date().toISOString() }
              : app
          )
        );
        if (jobTitle) {
          setToast({ message: jobTitle, stage: newStage });
          setTimeout(() => setToast(null), 5000);
        }
      }
    );

    socket.on("connect", () => {
      setSocketConnected(true);
      fetch("/api/applications")
        .then(r => r.json())
        .then((data: Application[]) => { if (Array.isArray(data)) setApplications(data); })
        .catch(() => {});
    });
    socket.on("disconnect", () => setSocketConnected(false));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionUserId]);

  const userName = session?.user?.name ?? "there";

  const handleWithdraw = async (id: string) => {
    const res = await fetch(`/api/applications/${id}/withdraw`, { method: "POST" });
    if (res.ok) {
      setApplications(prev => prev.map(a => a.id === id ? { ...a, isWithdrawn: true } : a));
    }
  };

  // Withdrawn applications are excluded from every tile — they are no longer
  // part of an active search, and counting them would overstate progress.
  const live = applications.filter((a) => !a.isWithdrawn);
  const atStage = (...stages: PipelineStage[]) =>
    live.filter((a) => stages.includes(a.stage)).length;

  const interviews = atStage("INTERVIEW");
  const offers = atStage("OFFER");
  const seekerStats: { label: string; value: number; tone?: string }[] = [
    { label: "Applied", value: live.length },
    { label: "In review", value: atStage("SEEN", "SHORTLISTED") },
    { label: "Interviews", value: interviews, tone: interviews > 0 ? "text-success" : undefined },
    { label: "Offers", value: offers, tone: offers > 0 ? "text-success" : undefined },
  ];

  return (
    <div ref={containerRef} className="min-h-screen bg-background pt-20 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="dash-header mb-5">
          <h1 className="text-2xl font-bold tracking-[-0.02em]">
            My Applications
          </h1>
          <p className="text-muted mt-1 text-sm">
            Hey {userName} — here&apos;s where all your applications stand.
          </p>
        </div>

        {/* Stat tiles — the shape of the search, before the list itself */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {seekerStats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold ${s.tone ?? "text-foreground"}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Nav links */}
        <nav className="flex flex-wrap gap-2 mb-8">
          <Link
            href="/dashboard/saved-jobs"
            className="dash-nav-link rounded-lg border border-border dark:border-border-dark px-4 py-2 text-sm font-medium text-muted hover:bg-surface dark:hover:bg-surface-dark transition-colors"
          >
            🔖 Saved Jobs
          </Link>
          <Link
            href="/dashboard/job-alerts"
            className="dash-nav-link rounded-lg border border-border dark:border-border-dark px-4 py-2 text-sm font-medium text-muted hover:bg-surface dark:hover:bg-surface-dark transition-colors"
          >
            🔔 Job Alerts
          </Link>
          <Link
            href="/dashboard/interviews"
            className="dash-nav-link rounded-lg border border-border dark:border-border-dark px-4 py-2 text-sm font-medium text-muted hover:bg-surface dark:hover:bg-surface-dark transition-colors"
          >
            📅 Interviews
          </Link>
          <Link
            href="/dashboard/analytics"
            className="dash-nav-link rounded-lg border border-border dark:border-border-dark px-4 py-2 text-sm font-medium text-muted hover:bg-surface dark:hover:bg-surface-dark transition-colors"
          >
            📊 Analytics
          </Link>
          <Link
            href="/dashboard/profile"
            className="dash-nav-link rounded-lg border border-border dark:border-border-dark px-4 py-2 text-sm font-medium text-muted hover:bg-surface dark:hover:bg-surface-dark transition-colors"
          >
            👤 My Profile
          </Link>
        </nav>

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-24 text-muted">
            <p className="text-5xl mb-4">📭</p>
            <p className="text-lg font-medium">No applications yet</p>
            <p className="text-sm mt-2">
              Browse{" "}
              <a href="/jobs" className="text-primary hover:underline">
                open roles
              </a>{" "}
              and apply to get started.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted mb-5">
              {applications.length} application{applications.length !== 1 ? "s" : ""}
              {" "}· stages update in real time
              <span className="inline-flex items-center gap-1 ml-2 text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Live
              </span>
            </p>
            {!socketConnected && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-2.5 text-sm text-yellow-400">
                <span>⚠</span>
                <span>Real-time updates paused — reconnecting…</span>
              </div>
            )}
            <div className="space-y-4">
              {applications.map((app) => (
                <ApplicationCard key={app.id} app={app} onViewDetail={setDetailAppId} onWithdraw={handleWithdraw} />
              ))}
            </div>
          </>
        )}

        {/* Skill Gap Report — always shown for applicants */}
        <div className="mt-10">
          <SkillGapReport />
        </div>

        {/* Stage change toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-card border border-border px-5 py-3.5 shadow-2xl max-w-sm">
            <p className="text-xs text-muted mb-0.5">Application status updated</p>
            <p className="text-sm font-medium text-white">{toast.message}</p>
            <p className="text-xs text-success mt-0.5">→ {toast.stage}</p>
          </div>
        )}
      </div>

      {detailAppId && (
        <ApplicationDetailModal
          applicationId={detailAppId}
          onClose={() => setDetailAppId(null)}
        />
      )}
    </div>
  );
}
