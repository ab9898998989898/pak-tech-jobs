"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isPromotionActive, daysRemaining } from "@/lib/promotedListings";
import {
  PROMOTION_PACKAGES,
  DEFAULT_PACKAGE_DAYS,
  formatPkr,
} from "@/lib/promotionPricing";

interface PromotionRequestSummary {
  id: string;
  status: "PENDING" | "INVOICED" | "APPROVED" | "DECLINED";
  createdAt: string;
  reviewNote: string | null;
  invoiceRef?: string | null;
  amountPkr?: number | null;
  packageDays?: number | null;
}

interface Job {
  id: string;
  title: string;
  city: string;
  location: string;
  jobType: string;
  experienceLevel: string;
  salaryMin: number;
  salaryMax: number;
  isActive: boolean;
  isClosed: boolean;
  createdAt: string;
  category: string[];
  skills: string[];
  isFeatured: boolean;
  featuredUntil: string | null;
  promotionRequests: PromotionRequestSummary[];
}

function promoted(job: Job): boolean {
  return isPromotionActive(
    { isFeatured: job.isFeatured, featuredUntil: job.featuredUntil ? new Date(job.featuredUntil) : null },
    new Date()
  );
}

function remaining(job: Job): number | null {
  return daysRemaining(
    { isFeatured: job.isFeatured, featuredUntil: job.featuredUntil ? new Date(job.featuredUntil) : null },
    new Date()
  );
}

// ─── Promotion request dialog ────────────────────────────────────────────────

function RequestPromotionDialog({ job, onClose, onSubmitted }: {
  job: Job;
  onClose: () => void;
  onSubmitted: (req: PromotionRequestSummary) => void;
}) {
  const [message, setMessage] = useState("");
  const [days, setDays] = useState<number>(DEFAULT_PACKAGE_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/promotion-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobPostId: job.id,
          packageDays: days,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not send the request");
        return;
      }
      onSubmitted(data as PromotionRequestSummary);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-foreground">Request promotion</h2>
        <p className="mt-1 text-sm text-muted">
          Feature <strong className="text-foreground">{job.title}</strong> above regular
          listings. Pick a package and we&apos;ll email you an invoice — the promotion
          starts once payment clears.
        </p>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm text-muted">Package</legend>
          <div className="space-y-2">
            {PROMOTION_PACKAGES.map((p) => (
              <label
                key={p.days}
                className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 transition-colors ${
                  days === p.days
                    ? "border-primary bg-primary-light"
                    : "border-border hover:bg-surface"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="package"
                    checked={days === p.days}
                    onChange={() => setDays(p.days)}
                    className="accent-primary"
                  />
                  <span className="text-sm font-medium text-foreground">{p.label}</span>
                  <span className="text-xs text-muted">({p.days} days)</span>
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {formatPkr(p.pricePkr)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 mb-1 block text-sm text-muted">
          Anything they should know? <span className="text-xs">(optional)</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. urgent backfill, we need candidates this week"
          className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder-muted focus:border-primary focus:outline-none"
        />

        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted hover:bg-surface hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RecruiterJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [promoteJob, setPromoteJob] = useState<Job | null>(null);

  useEffect(() => {
    fetch("/api/recruiter/jobs")
      .then((r) => r.json())
      .then((data) => setJobs(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== id));
      }
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-foreground">My Job Posts</h1>
          <p className="mt-0.5 text-sm text-muted">{jobs.length} total posts</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/applications/export"
            download
            className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            Export All CSV
          </a>
          <Link
            href="/recruiter/jobs/new"
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Post a job
          </Link>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-20">
          <p className="text-muted">No job posts yet.</p>
          <Link
            href="/recruiter/jobs/new"
            className="mt-4 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Post your first job
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isPromoted = promoted(job);
            const latest = job.promotionRequests?.[0];
            const pending = latest?.status === "PENDING";
            const invoiced = latest?.status === "INVOICED";
            const declined = latest?.status === "DECLINED" && !isPromoted;
            const days = remaining(job);

            return (
              <div
                key={job.id}
                className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border px-5 py-4 ${
                  isPromoted
                    ? "border-border border-l-[3px] border-l-accent bg-accent-soft dark:bg-card"
                    : "border-border bg-card"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-foreground">{job.title}</h2>

                    {job.isClosed ? (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">Closed</span>
                    ) : (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Active</span>
                    )}

                    {isPromoted && (
                      <span className="rounded-[3px] bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-white">
                        ★ Promoted{days !== null ? ` · ${days}d left` : ""}
                      </span>
                    )}

                    {pending && (
                      <span className="rounded-full border border-primary/30 bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">
                        Promotion requested
                      </span>
                    )}

                    {invoiced && (
                      <span className="rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent dark:bg-transparent">
                        Invoice sent — awaiting payment
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 text-xs text-muted">
                    {job.city} · {job.jobType.replace("_", " ")} · {job.experienceLevel}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    PKR {job.salaryMin.toLocaleString()} – {job.salaryMax.toLocaleString()}
                  </p>

                  {invoiced && latest?.invoiceRef && (
                    <p className="mt-1 text-xs text-muted">
                      Invoice <strong className="text-foreground">{latest.invoiceRef}</strong>
                      {latest.amountPkr ? ` · ${formatPkr(latest.amountPkr)}` : ""} — check your
                      email for payment details, and quote the reference on your transfer.
                    </p>
                  )}

                  {declined && (
                    <p className="mt-1 text-xs text-muted">
                      Last promotion request wasn&apos;t approved
                      {latest?.reviewNote ? `: ${latest.reviewNote}` : "."}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {!job.isClosed && !isPromoted && (
                    <button
                      onClick={() => setPromoteJob(job)}
                      disabled={pending || invoiced}
                      title={
                        invoiced
                          ? "Pay the invoice we emailed you to activate this promotion"
                          : pending
                          ? "An admin is reviewing your request"
                          : "Feature this listing above regular ones"
                      }
                      className="rounded-full border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {invoiced ? "Awaiting payment" : pending ? "Awaiting review" : "★ Promote"}
                    </button>
                  )}

                  <a
                    href={`/api/applications/export?jobPostId=${job.id}`}
                    download
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface hover:text-foreground"
                  >
                    CSV
                  </a>
                  <button
                    onClick={() => router.push(`/recruiter/jobs/${job.id}/edit`)}
                    disabled={job.isClosed}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Edit
                  </button>

                  {confirmDeleteId === job.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted">Sure?</span>
                      <button
                        onClick={() => handleDelete(job.id)}
                        disabled={deletingId === job.id}
                        className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingId === job.id ? "…" : "Yes"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(job.id)}
                      disabled={job.isClosed}
                      className="rounded-full border border-red-500/30 px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {promoteJob && (
        <RequestPromotionDialog
          job={promoteJob}
          onClose={() => setPromoteJob(null)}
          onSubmitted={(req) => {
            setJobs((prev) =>
              prev.map((j) => (j.id === promoteJob.id ? { ...j, promotionRequests: [req] } : j))
            );
            setPromoteJob(null);
          }}
        />
      )}
    </div>
  );
}
