"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ApplicationDetailPanel from "@/components/ApplicationDetailPanel";
import DedicatedSupportWidget from "@/components/DedicatedSupportWidget";
import type { EmployerTier } from "@/lib/enterpriseTier";

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
  jobPost: {
    id: string;
    title: string;
    city: string;
    location: string;
  };
  applicant: {
    id: string;
    name: string;
    email: string;
    skills: string[];
    experienceLevel: string | null;
    location: string | null;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KANBAN_STAGES: PipelineStage[] = [
  "APPLIED",
  "SEEN",
  "SHORTLISTED",
  "INTERVIEW",
  "OFFER",
];

const STAGE_LABEL: Record<PipelineStage, string> = {
  APPLIED: "Applied",
  SEEN: "Seen",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

// Low-opacity tints rather than fixed dark values, so each stage reads the
// same way on the light and dark grounds.
const STAGE_COLORS: Record<string, string> = {
  APPLIED: "border-border bg-surface",
  SEEN: "border-sky-500/30 bg-sky-500/[0.06]",
  SHORTLISTED: "border-purple-500/30 bg-purple-500/[0.06]",
  INTERVIEW: "border-emerald-500/30 bg-emerald-500/[0.06]",
  OFFER: "border-amber-500/30 bg-amber-500/[0.06]",
};

const STAGE_HEADER_COLORS: Record<string, string> = {
  APPLIED: "text-muted bg-surface",
  SEEN: "text-sky-700 dark:text-sky-400 bg-sky-500/10",
  SHORTLISTED: "text-purple-700 dark:text-purple-400 bg-purple-500/10",
  INTERVIEW: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10",
  OFFER: "text-amber-700 dark:text-amber-400 bg-amber-500/10",
};

const REJECTION_REASON_LABELS: Record<RejectionReason, string> = {
  PORTFOLIO_GAP: "Portfolio Gap",
  SALARY_MISMATCH: "Salary Mismatch",
  SPECIFIC_SKILL_MISSING: "Specific Skill Missing",
  ROLE_FILLED: "Role Filled",
  OVERQUALIFIED: "Overqualified",
};

const REJECTION_REASONS = Object.keys(
  REJECTION_REASON_LABELS
) as RejectionReason[];

// Next stage in the pipeline for drag-to-advance
const NEXT_STAGE: Partial<Record<PipelineStage, PipelineStage>> = {
  APPLIED: "SEEN",
  SEEN: "SHORTLISTED",
  SHORTLISTED: "INTERVIEW",
  INTERVIEW: "OFFER",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Rejection Modal ──────────────────────────────────────────────────────────

interface RejectionModalProps {
  onConfirm: (reason: RejectionReason, notes: string) => void;
  onCancel: () => void;
  loading: boolean;
}

function RejectionModal({ onConfirm, onCancel, loading }: RejectionModalProps) {
  const [reason, setReason] = useState<RejectionReason | "">("");
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Reject Application
        </h2>

        <label className="mb-1 block text-sm text-muted">
          Rejection Reason <span className="text-red-400">*</span>
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as RejectionReason)}
          className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">Select a reason…</option>
          {REJECTION_REASONS.map((r) => (
            <option key={r} value={r}>
              {REJECTION_REASON_LABELS[r]}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm text-muted">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Add any additional context for the applicant…"
          className="mb-6 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder-muted focus:border-primary focus:outline-none"
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => reason && onConfirm(reason as RejectionReason, notes)}
            disabled={!reason || loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Rejecting…" : "Confirm Rejection"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Application Card ─────────────────────────────────────────────────────────

interface CardProps {
  app: Application;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onCardClick: (id: string) => void;
}

function ApplicationCard({ app, selected, onToggleSelect, onDragStart, onCardClick }: CardProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(app.id)}
      onClick={() => onCardClick(app.id)}
      className={`cursor-grab rounded-lg border p-3 transition-all active:cursor-grabbing ${
        selected
          ? "border-primary/60 bg-primary/10"
          : "border-border bg-card hover:border-primary/40 hover:bg-surface"
      }`}
    >
      <div className="mb-2 flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(app.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-primary"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {app.applicant.name}
          </p>
          <p className="truncate text-xs text-muted">{app.jobPost.title}</p>
        </div>
      </div>

      {app.applicant.experienceLevel && (
        <span className="mb-2 inline-block rounded-full bg-surface px-2 py-0.5 text-xs text-foreground">
          {app.applicant.experienceLevel}
        </span>
      )}

      {app.applicant.skills.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {app.applicant.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              {skill}
            </span>
          ))}
          {app.applicant.skills.length > 3 && (
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">
              +{app.applicant.skills.length - 3}
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-muted">{timeAgo(app.submittedAt)}</p>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

interface ColumnProps {
  stage: PipelineStage;
  apps: Application[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (targetStage: PipelineStage) => void;
  dragOverStage: PipelineStage | null;
  setDragOverStage: (stage: PipelineStage | null) => void;
  onCardClick: (id: string) => void;
}

function KanbanColumn({
  stage,
  apps,
  selectedIds,
  onToggleSelect,
  onDragStart,
  onDrop,
  dragOverStage,
  setDragOverStage,
  onCardClick,
}: ColumnProps) {
  const isOver = dragOverStage === stage;

  return (
    <div
      className={`flex min-h-[400px] w-64 flex-shrink-0 flex-col rounded-xl border transition-all ${
        STAGE_COLORS[stage]
      } ${isOver ? "ring-2 ring-primary/50" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOverStage(stage);
      }}
      onDragLeave={() => setDragOverStage(null)}
      onDrop={() => {
        setDragOverStage(null);
        onDrop(stage);
      }}
    >
      {/* Column header */}
      <div
        className={`flex items-center justify-between rounded-t-xl px-3 py-2.5 ${STAGE_HEADER_COLORS[stage]}`}
      >
        <span className="text-sm font-semibold">{STAGE_LABEL[stage]}</span>
        <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs font-medium">
          {apps.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 webkit-removed">
        {apps.length === 0 ? (
          <p className="mt-4 text-center text-xs text-muted">No applications</p>
        ) : (
          apps.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              selected={selectedIds.has(app.id)}
              onToggleSelect={onToggleSelect}
              onDragStart={onDragStart}
              onCardClick={onCardClick}
            />
          ))
        )}
      </div>
    </div>
  );
}


// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecruiterDashboardPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Rejection modal state
  const [rejectionModal, setRejectionModal] = useState<{
    mode: "single" | "bulk";
    applicationId?: string;
  } | null>(null);
  const [rejecting, setRejecting] = useState(false);

  // Application detail panel
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  // Search/filter
  const [searchQuery, setSearchQuery] = useState("");

  // Enterprise tier profile
  const [userTier, setUserTier] = useState<EmployerTier>("FREE");
  const [accountManagerName, setAccountManagerName] = useState<string | null>(null);

  // Error toast
  const [toastError, setToastError] = useState<string | null>(null);

  // Board scroll indicator
  const boardRef = useRef<HTMLDivElement>(null);
  const [showScrollDots, setShowScrollDots] = useState(false);
  const [boardScrolling, setBoardScrolling] = useState(false);
  const boardScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBoardScroll = () => {
    setBoardScrolling(true);
    setShowScrollDots(true);
    if (boardScrollTimer.current) clearTimeout(boardScrollTimer.current);
    boardScrollTimer.current = setTimeout(() => setBoardScrolling(false), 1000);
  };

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const check = () => setShowScrollDots(el.scrollWidth > el.clientWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Fetch applications ──────────────────────────────────────────────────────

  const fetchApplications = useCallback(async () => {
    try {
      const res = await fetch("/api/applications");
      if (!res.ok) throw new Error("Failed to load applications");
      const data: Application[] = await res.json();
      setApplications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // ── Fetch profile (tier + account manager) ──────────────────────────────────

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          setUserTier(data.tier ?? "FREE");
          setAccountManagerName(data.accountManagerName ?? null);
        }
      })
      .catch(() => {/* non-critical — widget simply won't show */});
  }, []);

  // ── Group by stage ──────────────────────────────────────────────────────────

  const filteredApplications = searchQuery.trim()
    ? applications.filter(a => {
        const q = searchQuery.toLowerCase();
        return (
          a.applicant.name.toLowerCase().includes(q) ||
          a.applicant.skills.some(s => s.toLowerCase().includes(q)) ||
          a.jobPost.title.toLowerCase().includes(q)
        );
      })
    : applications;

  const grouped = KANBAN_STAGES.reduce<Record<PipelineStage, Application[]>>(
    (acc, stage) => {
      acc[stage] = filteredApplications.filter((a) => a.stage === stage);
      return acc;
    },
    {} as Record<PipelineStage, Application[]>
  );

  // ── Selection helpers ───────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ── Drag-to-advance ─────────────────────────────────────────────────────────

  const handleDrop = async (targetStage: PipelineStage) => {
    if (!draggingId) return;
    setDraggingId(null);

    const app = applications.find((a) => a.id === draggingId);
    if (!app) return;

    // Dropping onto the same stage — no-op
    if (app.stage === targetStage) return;

    // Only allow advancing to the next stage in sequence
    const expectedNext = NEXT_STAGE[app.stage];
    if (targetStage !== expectedNext) return;

    // Optimistic update
    setApplications((prev) =>
      prev.map((a) => (a.id === draggingId ? { ...a, stage: targetStage } : a))
    );

    try {
      const res = await fetch(`/api/applications/${draggingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: targetStage }),
      });
      if (!res.ok) {
        // Revert on failure
        await fetchApplications();
        setToastError("Failed to update stage. Please try again.");
        setTimeout(() => setToastError(null), 4000);
      }
    } catch {
      await fetchApplications();
      setToastError("Failed to update stage. Please try again.");
      setTimeout(() => setToastError(null), 4000);
    }
  };

  // ── Bulk advance ────────────────────────────────────────────────────────────

  const handleBulkAdvance = async () => {
    if (selectedIds.size === 0) return;

    // Determine the target stage: advance each selected app to its next stage
    // For simplicity, only advance apps that share a common next stage
    const selected = applications.filter((a) => selectedIds.has(a.id));
    const stages = [...new Set(selected.map((a) => a.stage))];

    if (stages.length !== 1) {
      alert("Please select applications from the same stage to bulk advance.");
      return;
    }

    const currentStage = stages[0];
    const nextStage = NEXT_STAGE[currentStage];
    if (!nextStage) {
      alert("These applications cannot be advanced further.");
      return;
    }

    // Optimistic update
    const ids = [...selectedIds];
    setApplications((prev) =>
      prev.map((a) => (ids.includes(a.id) ? { ...a, stage: nextStage } : a))
    );
    clearSelection();

    try {
      const res = await fetch("/api/applications/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationIds: ids,
          action: "advance",
          stage: nextStage,
        }),
      });
      if (!res.ok) await fetchApplications();
    } catch {
      await fetchApplications();
    }
  };

  // ── Rejection flow ──────────────────────────────────────────────────────────

  const handleRejectConfirm = async (reason: RejectionReason, notes: string) => {
    if (!rejectionModal) return;
    setRejecting(true);

    try {
      if (rejectionModal.mode === "single" && rejectionModal.applicationId) {
        const res = await fetch(
          `/api/applications/${rejectionModal.applicationId}/reject`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rejectionReason: reason,
              ...(notes && { recruiterNotes: notes }),
            }),
          }
        );
        if (res.ok) {
          setApplications((prev) =>
            prev.map((a) =>
              a.id === rejectionModal.applicationId
                ? { ...a, stage: "REJECTED" as PipelineStage }
                : a
            )
          );
        } else {
          await fetchApplications();
        }
      } else if (rejectionModal.mode === "bulk") {
        const ids = [...selectedIds];
        const res = await fetch("/api/applications/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationIds: ids,
            action: "reject",
            rejectionReason: reason,
            ...(notes && { recruiterNotes: notes }),
          }),
        });
        if (res.ok) {
          setApplications((prev) =>
            prev.map((a) =>
              ids.includes(a.id) ? { ...a, stage: "REJECTED" as PipelineStage } : a
            )
          );
          clearSelection();
        } else {
          await fetchApplications();
        }
      }
    } finally {
      setRejecting(false);
      setRejectionModal(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const selectedCount = selectedIds.size;

  // "Needs review" is the count still sitting untouched at APPLIED — the one
  // number a recruiter should act on, so it is highlighted when non-zero.
  const countAt = (stage: PipelineStage) =>
    applications.filter((a) => a.stage === stage).length;

  const needsReview = countAt("APPLIED");
  const statTiles: { label: string; value: number; tone?: string }[] = [
    {
      label: "Active",
      value: applications.filter((a) => KANBAN_STAGES.includes(a.stage)).length,
    },
    { label: "Needs review", value: needsReview, tone: needsReview > 0 ? "text-primary" : undefined },
    { label: "Shortlisted", value: countAt("SHORTLISTED") },
    { label: "Interviewing", value: countAt("INTERVIEW") },
  ];

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 py-6 sm:py-8">
      {/* Dedicated Support Widget (Enterprise only) */}
      <DedicatedSupportWidget tier={userTier} accountManagerName={accountManagerName} />

      {/* Header */}
      <div className="mb-6">
        {/* Top row: title + primary action */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-foreground">Pipeline</h1>
            <p className="mt-0.5 text-sm text-muted">
              Drag a candidate between columns to move them forward.
            </p>
          </div>
          <Link
            href="/recruiter/jobs/new"
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            Post a job
          </Link>
        </div>

        {/* Stat tiles — the pipeline at a glance, before the board itself */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statTiles.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold ${s.tone ?? "text-foreground"}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Nav links row — scrollable on mobile */}
        <div className="flex gap-2 overflow-x-auto webkit-removed pb-1">
          <Link href="/recruiter/jobs"
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface transition-colors">
            My Jobs
          </Link>
          <Link href="/recruiter/analytics"
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface transition-colors">
            Analytics
          </Link>
          <Link href="/recruiter/ai-tools"
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface transition-colors">
            🤖 AI Tools
          </Link>
        </div>

        {/* Search/filter */}
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or skill…"
            className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder-muted focus:border-primary focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-xs text-muted hover:text-foreground">Clear</button>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 sm:px-4 py-2.5">
            <span className="text-sm text-foreground mr-1">{selectedCount} selected</span>
            <button onClick={handleBulkAdvance}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark">
              Advance
            </button>
            <button onClick={() => setRejectionModal({ mode: "bulk" })}
              className="rounded-lg bg-red-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
              Reject
            </button>
            <button onClick={clearSelection} className="text-xs text-muted hover:text-foreground ml-auto">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Kanban board */}
      <div className="relative">
        <div
          ref={boardRef}
          onScroll={handleBoardScroll}
          className="flex gap-4 overflow-x-auto pb-6 webkit-removed"
        >
          {KANBAN_STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              apps={grouped[stage] ?? []}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onDragStart={(id) => setDraggingId(id)}
              onDrop={handleDrop}
              dragOverStage={dragOverStage}
              setDragOverStage={setDragOverStage}
              onCardClick={(id) => setSelectedAppId(id)}
            />
          ))}

          {/* Reject drop zone */}
          <div
            className={`flex min-h-[400px] w-48 flex-shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
              dragOverStage === "REJECTED"
                ? "border-red-500 bg-red-950/30"
                : "border-red-500/30 bg-red-950/10"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStage("REJECTED");
            }}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={() => {
              setDragOverStage(null);
              if (draggingId) {
                setRejectionModal({ mode: "single", applicationId: draggingId });
                setDraggingId(null);
              }
            }}
          >
            <span className="text-2xl">🚫</span>
            <span className="mt-2 text-sm font-medium text-red-400">
              Drop to Reject
            </span>
          </div>
        </div>

        {/* Horizontal scroll dots */}
        {showScrollDots && (
          <div
            className={`pointer-events-none absolute bottom-0 left-0 right-0 flex justify-center gap-2 pb-1 transition-opacity duration-500 ${
              boardScrolling ? "opacity-100" : "opacity-50"
            }`}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const center = 3;
              const dist = Math.abs(i - center);
              const size = dist === 0 ? 7 : dist === 1 ? 5 : dist === 2 ? 4 : 3;
              const opacity = dist === 0 ? 1 : dist === 1 ? 0.7 : dist === 2 ? 0.45 : 0.25;
              return (
                <span
                  key={i}
                  className="block rounded-full bg-primary transition-all duration-300"
                  style={{
                    width: size,
                    height: size,
                    opacity,
                    boxShadow: dist === 0 ? "0 0 8px rgba(52,211,153,0.9)" : "none",
                    marginTop: dist === 0 ? 0 : dist === 1 ? 1 : 2,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Rejection modal */}
      {rejectionModal && (
        <RejectionModal
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectionModal(null)}
          loading={rejecting}
        />
      )}

      {/* Error toast */}
      {toastError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-red-900/90 border border-red-500/40 px-5 py-3 text-sm text-red-200 shadow-xl">
          {toastError}
        </div>
      )}

      {/* Application detail panel */}
      {selectedAppId && (
        <ApplicationDetailPanel
          applicationId={selectedAppId}
          onClose={() => setSelectedAppId(null)}
          onStageChange={(id, newStage) => {
            setApplications(prev => prev.map(a => a.id === id ? { ...a, stage: newStage } : a));
            setSelectedAppId(null);
          }}
        />
      )}
    </div>
  );
}
