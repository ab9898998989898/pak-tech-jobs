"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingRecruiter {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  businessEmail: string | null;
  createdAt: string;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  suspended: boolean;
  recruiterVerified: boolean;
  companyName: string | null;
  businessEmail: string | null;
  skills: string[];
  experienceLevel: string | null;
  location: string | null;
  _count: { jobPosts: number; applications: number };
}

interface AdminJob {
  id: string;
  title: string;
  city: string;
  jobType: string;
  experienceLevel: string;
  isActive: boolean;
  isClosed: boolean;
  createdAt: string;
  salaryMin: number;
  salaryMax: number;
  skills: string[];
  isPremium: boolean;
  isFeatured: boolean;
  featuredUntil: string | null;
  recruiter: { id: string; name: string; companyName: string | null; email: string };
  _count: { applications: number };
}

interface EnterpriseEmployer {
  id: string;
  name: string;
  companyName: string | null;
  subscriptionExpiry: string | null;
  maxRecruiterSeats: number;
  accountManagerName: string | null;
  hasCvAccess: boolean;
}

interface PromotionRequestRow {
  id: string;
  status: "PENDING" | "INVOICED" | "APPROVED" | "DECLINED";
  message: string | null;
  createdAt: string;
  packageDays: number | null;
  amountPkr: number | null;
  invoiceRef: string | null;
  invoicedAt: string | null;
  paidAt: string | null;
  jobPost: {
    id: string;
    title: string;
    city: string;
    jobType: string;
    experienceLevel: string;
    salaryMin: number;
    salaryMax: number;
    isFeatured: boolean;
    featuredUntil: string | null;
    _count: { applications: number };
  };
  recruiter: { id: string; name: string; email: string; companyName: string | null };
}

interface EmailLogRow {
  id: string;
  recipient: string;
  campaign: string;
  subject: string;
  sequenceStep: number;
  sentAt: string;
  user: { id: string; name: string; role: string; companyName: string | null };
}

interface ConversionStats {
  emailsSent: number;
  recipients: number;
  converted: number;
  conversionRate: number;
}

interface EmailLogResponse {
  windowDays: number;
  totals: Record<string, number>;
  conversions: Record<string, ConversionStats>;
  unsubscribed: number;
  rows: EmailLogRow[];
}

type Tab = "pending" | "recruiters" | "seekers" | "jobs" | "enterprise" | "emails";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" });
}

function fmtSalary(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

const JOB_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time", REMOTE: "Remote", CONTRACT: "Contract",
  INTERNSHIP: "Internship", PART_TIME: "Part-time",
};
const EXP_LABEL: Record<string, string> = {
  JUNIOR: "Junior", MID: "Mid", SENIOR: "Senior", LEAD: "Lead",
};

// ─── Reject Form ──────────────────────────────────────────────────────────────

function RejectForm({ onConfirm, onCancel, loading }: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 flex flex-col gap-2">
      <textarea
        rows={2}
        placeholder="Reason for rejection (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500/40"
      />
      <div className="flex gap-2">
        <button disabled={loading || !reason.trim()} onClick={() => onConfirm(reason.trim())}
          className="px-4 py-1.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50">
          {loading ? "Rejecting…" : "Confirm Reject"}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Suspend Form ─────────────────────────────────────────────────────────────

function SuspendForm({ onConfirm, onCancel, loading, action }: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
  action: "suspend" | "lift";
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 flex flex-col gap-2">
      <textarea
        rows={2}
        placeholder={`Reason to ${action} suspension (required)`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
      />
      <div className="flex gap-2">
        <button disabled={loading || !reason.trim()} onClick={() => onConfirm(reason.trim())}
          className="px-4 py-1.5 rounded-lg bg-yellow-500 text-white text-sm font-medium hover:bg-yellow-600 disabled:opacity-50">
          {loading ? "Updating…" : "Confirm"}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Pending Approvals Tab ────────────────────────────────────────────────────

function PendingTab({ recruiters, setRecruiters, onApprove }: {
  recruiters: PendingRecruiter[];
  setRecruiters: React.Dispatch<React.SetStateAction<PendingRecruiter[]>>;
  onApprove: (id: string) => void;
}) {
  function remove(id: string) { setRecruiters(p => p.filter(r => r.id !== id)); }

  return (
    <div className="space-y-4">
      {recruiters.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-medium">No pending verifications</p>
        </div>
      ) : recruiters.map(r => (
        <PendingRecruiterCard key={r.id} recruiter={r} onRemove={remove} onApprove={onApprove} />
      ))}
    </div>
  );
}

function PendingRecruiterCard({ recruiter, onRemove, onApprove }: { recruiter: PendingRecruiter; onRemove: (id: string) => void; onApprove: (id: string) => void }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    setApproving(true); setError("");
    try {
      const res = await fetch(`/api/admin/recruiters/${recruiter.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to approve");
      onRemove(recruiter.id);
      onApprove(recruiter.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setApproving(false); }
  }

  async function reject(reason: string) {
    setRejecting(true); setError("");
    try {
      const res = await fetch(`/api/admin/recruiters/${recruiter.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to reject");
      onRemove(recruiter.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); setRejecting(false); }
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-white">{recruiter.name}</span>
            {recruiter.companyName && <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">{recruiter.companyName}</span>}
          </div>
          <p className="text-xs text-gray-400">{recruiter.email}</p>
          {recruiter.businessEmail && <p className="text-xs text-gray-400">Business: {recruiter.businessEmail}</p>}
          <p className="text-xs text-gray-400">Registered {fmt(recruiter.createdAt)}</p>
        </div>
        {!rejectOpen && (
          <div className="flex gap-2">
            <button disabled={approving} onClick={approve}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              {approving ? "Approving…" : "Approve"}
            </button>
            <button onClick={() => setRejectOpen(true)}
              className="px-4 py-1.5 rounded-lg border border-red-500/40 text-red-400 text-sm font-medium hover:bg-red-500/10">
              Reject
            </button>
          </div>
        )}
      </div>
      {rejectOpen && <RejectForm onConfirm={reject} onCancel={() => setRejectOpen(false)} loading={rejecting} />}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── All Recruiters Tab ───────────────────────────────────────────────────────

function RecruitersTab({ users, setUsers }: { users: AdminUser[]; setUsers: React.Dispatch<React.SetStateAction<AdminUser[]>> }) {
  const recruiters = users.filter(u => u.role === "RECRUITER");
  const [search, setSearch] = useState("");
  const filtered = recruiters.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.email.toLowerCase().includes(search.toLowerCase()) ||
    (r.companyName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function updateUser(id: string, patch: Partial<AdminUser>) {
    setUsers(p => p.map(u => u.id === id ? { ...u, ...patch } : u));
  }

  return (
    <div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recruiters…"
        className="mb-4 w-full max-w-sm px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
      <div className="space-y-3">
        {filtered.length === 0 ? <p className="text-sm text-gray-400 py-10 text-center">No recruiters found</p>
          : filtered.map(r => <RecruiterRow key={r.id} user={r} onUpdate={updateUser} />)}
      </div>
    </div>
  );
}

function RecruiterRow({ user, onUpdate }: { user: AdminUser; onUpdate: (id: string, patch: Partial<AdminUser>) => void }) {
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [error, setError] = useState("");

  async function toggleSuspend(reason: string) {
    setSuspending(true); setError("");
    const action = user.suspended ? "lift" : "suspend";
    try {
      const res = await fetch(`/api/admin/suspension/${user.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      onUpdate(user.id, { suspended: !user.suspended });
      setSuspendOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setSuspending(false); }
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-white">{user.name}</span>
            {user.companyName && <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{user.companyName}</span>}
            {user.recruiterVerified
              ? <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full">✓ Verified</span>
              : <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full">Pending</span>}
            {user.suspended && <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">Suspended</span>}
          </div>
          <p className="text-xs text-gray-400">{user.email} {user.businessEmail ? `· ${user.businessEmail}` : ""}</p>
          <p className="text-xs text-gray-400">Joined {fmt(user.createdAt)} · {user._count.jobPosts} job posts</p>
        </div>
        {!suspendOpen && (
          <button onClick={() => setSuspendOpen(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${user.suspended ? "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" : "border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"}`}>
            {user.suspended ? "Lift Suspension" : "Suspend"}
          </button>
        )}
      </div>
      {suspendOpen && <SuspendForm onConfirm={toggleSuspend} onCancel={() => setSuspendOpen(false)} loading={suspending} action={user.suspended ? "lift" : "suspend"} />}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Job Seekers Tab ──────────────────────────────────────────────────────────

function SeekersTab({ users }: { users: AdminUser[] }) {
  const seekers = users.filter(u => u.role === "APPLICANT");
  const [search, setSearch] = useState("");
  const filtered = seekers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search job seekers…"
        className="mb-4 w-full max-w-sm px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Level</th>
              <th className="px-4 py-3 text-left">Location</th>
              <th className="px-4 py-3 text-left">Skills</th>
              <th className="px-4 py-3 text-left">Applications</th>
              <th className="px-4 py-3 text-left">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No job seekers found</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 font-medium text-white">{s.name}</td>
                <td className="px-4 py-3 text-gray-400">{s.email}</td>
                <td className="px-4 py-3 text-gray-400">{s.experienceLevel ? EXP_LABEL[s.experienceLevel] ?? s.experienceLevel : "—"}</td>
                <td className="px-4 py-3 text-gray-400">{s.location ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {s.skills.slice(0, 3).map(sk => (
                      <span key={sk} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs">{sk}</span>
                    ))}
                    {s.skills.length > 3 && <span className="text-xs text-gray-400">+{s.skills.length - 3}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400">{s._count.applications}</td>
                <td className="px-4 py-3 text-gray-400">{fmt(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Job Posts Tab ────────────────────────────────────────────────────────────

/** Mirrors isPromotionActive() in lib/promotedListings.ts. */
function isPromoted(j: AdminJob): boolean {
  if (!j.isFeatured) return false;
  if (!j.featuredUntil) return true;
  return new Date(j.featuredUntil).getTime() > Date.now();
}

function promotionLabel(j: AdminJob): string {
  if (!isPromoted(j)) return "—";
  if (!j.featuredUntil) return "No expiry";
  const days = Math.ceil((new Date(j.featuredUntil).getTime() - Date.now()) / 86400000);
  return days === 1 ? "1 day left" : `${days} days left`;
}

function JobsTab({ jobs, setJobs, requests, setRequests, focusJobId }: {
  jobs: AdminJob[];
  setJobs: React.Dispatch<React.SetStateAction<AdminJob[]>>;
  requests: PromotionRequestRow[];
  setRequests: React.Dispatch<React.SetStateAction<PromotionRequestRow[]>>;
  focusJobId: string | null;
}) {
  const [search, setSearch] = useState("");
  const [promotedOnly, setPromotedOnly] = useState(false);
  const [days, setDays] = useState(7);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  // Arriving from the "Review and promote" link in the admin email: filter to
  // that one job so it cannot be missed in a long list.
  const [focused, setFocused] = useState<string | null>(focusJobId);
  useEffect(() => setFocused(focusJobId), [focusJobId]);

  const focusedJob = focused ? jobs.find(j => j.id === focused) : undefined;

  const filtered = (focused ? jobs.filter(j => j.id === focused) : jobs).filter(j =>
    (!promotedOnly || isPromoted(j)) &&
    (j.title.toLowerCase().includes(search.toLowerCase()) ||
     j.city.toLowerCase().includes(search.toLowerCase()) ||
     (j.recruiter.companyName ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  const promotedCount = jobs.filter(isPromoted).length;
  // Both states are still the admin's problem: PENDING needs an invoice,
  // INVOICED needs the payment confirming.
  const pending = requests.filter(r => r.status === "PENDING" || r.status === "INVOICED");
  const awaitingPayment = requests.filter(r => r.status === "INVOICED").length;

  type ReviewAction = "invoice" | "mark-paid" | "approve" | "decline";

  async function reviewRequest(req: PromotionRequestRow, action: ReviewAction) {
    setReviewingId(req.id);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/promotion-requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "approve" ? { days } : {}),
          ...(action === "decline" && declineNote.trim() ? { note: declineNote.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error ?? "Could not update the request");
        return;
      }

      if (action === "invoice") {
        // Stays in the queue — it is now waiting on payment, not on a decision.
        setRequests(prev => prev.map(r => (r.id === req.id ? { ...r, ...data } : r)));
      } else {
        setRequests(prev => prev.filter(r => r.id !== req.id));
      }

      if ((action === "approve" || action === "mark-paid") && data.jobPost) {
        setJobs(prev => prev.map(j =>
          j.id === data.jobPost.id
            ? { ...j, isFeatured: data.jobPost.isFeatured, featuredUntil: data.jobPost.featuredUntil }
            : j
        ));
      }
      setDeclineNote("");
    } catch {
      setErrorMsg("Network error");
    } finally {
      setReviewingId(null);
    }
  }

  async function togglePromotion(job: AdminJob) {
    setBusyId(job.id);
    setErrorMsg("");
    const promoting = !isPromoted(job);
    try {
      const res = promoting
        ? await fetch("/api/featured-jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobPostId: job.id, days }),
          })
        : await fetch(`/api/featured-jobs?jobPostId=${encodeURIComponent(job.id)}`, {
            method: "DELETE",
          });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error ?? "Could not update promotion");
        return;
      }
      setJobs(prev => prev.map(j =>
        j.id === job.id
          ? { ...j, isFeatured: data.isFeatured, featuredUntil: data.featuredUntil }
          : j
      ));
    } catch {
      setErrorMsg("Network error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* Pending promotion requests — the queue an admin should clear first */}
      {pending.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-400">
            ★ {pending.length} promotion request{pending.length === 1 ? "" : "s"} open
            {awaitingPayment > 0 && (
              <span className="font-normal text-amber-400/70">
                · {awaitingPayment} awaiting payment
              </span>
            )}
          </h3>

          <div className="space-y-2">
            {pending.map(req => (
              <div key={req.id} className="rounded-lg border border-gray-700 bg-gray-900 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      onClick={() => setFocused(req.jobPost.id)}
                      className="text-left text-sm font-semibold text-white hover:text-emerald-400 hover:underline"
                      title="Show only this job below"
                    >
                      {req.jobPost.title}
                    </button>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {req.recruiter.companyName ?? req.recruiter.name} · {req.jobPost.city} ·{" "}
                      {JOB_TYPE_LABEL[req.jobPost.jobType] ?? req.jobPost.jobType} ·{" "}
                      {EXP_LABEL[req.jobPost.experienceLevel] ?? req.jobPost.experienceLevel}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      PKR {fmtSalary(req.jobPost.salaryMin)}–{fmtSalary(req.jobPost.salaryMax)} ·{" "}
                      {req.jobPost._count.applications} application
                      {req.jobPost._count.applications === 1 ? "" : "s"} · asked {fmt(req.createdAt)}
                    </p>

                    <p className="mt-1 text-xs">
                      <span className="text-gray-400">Wants </span>
                      <span className="font-semibold text-white">
                        {req.packageDays ?? "—"} days
                      </span>
                      {req.amountPkr != null && (
                        <>
                          <span className="text-gray-400"> for </span>
                          <span className="font-semibold text-amber-400">
                            PKR {req.amountPkr.toLocaleString("en-PK")}
                          </span>
                        </>
                      )}
                      {req.status === "INVOICED" && req.invoiceRef && (
                        <span className="ml-2 rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                          Invoice {req.invoiceRef} sent — unpaid
                        </span>
                      )}
                    </p>

                    {req.message && (
                      <p className="mt-1.5 border-l-2 border-gray-700 pl-2 text-xs italic text-gray-400">
                        “{req.message}”
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {req.status === "PENDING" ? (
                      <button
                        onClick={() => reviewRequest(req, "invoice")}
                        disabled={reviewingId === req.id}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                        title="Emails the recruiter an invoice with payment instructions"
                      >
                        {reviewingId === req.id ? "…" : "Send invoice"}
                      </button>
                    ) : (
                      <button
                        onClick={() => reviewRequest(req, "mark-paid")}
                        disabled={reviewingId === req.id}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                        title="Payment received — promote the listing now"
                      >
                        {reviewingId === req.id ? "…" : "Mark paid & promote"}
                      </button>
                    )}

                    {req.status === "PENDING" && (
                      <button
                        onClick={() => reviewRequest(req, "approve")}
                        disabled={reviewingId === req.id}
                        className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white disabled:opacity-50"
                        title="Promote without charging — for comps and goodwill"
                      >
                        Free · {days}d
                      </button>
                    )}

                    <button
                      onClick={() => reviewRequest(req, "decline")}
                      disabled={reviewingId === req.id}
                      className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <input
            value={declineNote}
            onChange={e => setDeclineNote(e.target.value)}
            placeholder="Optional reason, sent to the recruiter when declining…"
            className="mt-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
      )}

      {focused && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <span className="text-sm text-emerald-400">
            Showing one job{focusedJob ? `: ${focusedJob.title}` : ""}
          </span>
          <button
            onClick={() => setFocused(null)}
            className="ml-auto text-xs text-gray-400 hover:text-white"
          >
            Show all jobs
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs…"
          className="w-full max-w-sm px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />

        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input type="checkbox" checked={promotedOnly} onChange={e => setPromotedOnly(e.target.checked)}
            className="rounded border-gray-700 bg-gray-800 text-emerald-500 focus:ring-emerald-500/40" />
          Promoted only ({promotedCount})
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-400 ml-auto">
          Promote for
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="px-2 py-1 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </div>

      {errorMsg && (
        <p className="mb-3 text-sm text-red-400">{errorMsg}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Title</th>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-left">City</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Salary</th>
              <th className="px-4 py-3 text-left">Apps</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Promoted</th>
              <th className="px-4 py-3 text-left">Posted</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-500">No jobs found</td></tr>
            ) : filtered.map(j => {
              const promoted = isPromoted(j);
              return (
                <tr key={j.id} className={`transition-colors ${promoted ? "bg-emerald-500/5 hover:bg-emerald-500/10" : "hover:bg-gray-800/50"}`}>
                  <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate">{j.title}</td>
                  <td className="px-4 py-3 text-gray-400">{j.recruiter.companyName ?? j.recruiter.name}</td>
                  <td className="px-4 py-3 text-gray-400">{j.city}</td>
                  <td className="px-4 py-3 text-gray-400">{JOB_TYPE_LABEL[j.jobType] ?? j.jobType}</td>
                  <td className="px-4 py-3 text-gray-400">PKR {fmtSalary(j.salaryMin)}–{fmtSalary(j.salaryMax)}</td>
                  <td className="px-4 py-3 text-gray-400">{j._count.applications}</td>
                  <td className="px-4 py-3">
                    {j.isClosed
                      ? <span className="text-xs bg-gray-500/10 text-gray-400 px-2 py-0.5 rounded-full">Closed</span>
                      : j.isActive
                        ? <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full">Active</span>
                        : <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full">Inactive</span>}
                  </td>
                  <td className="px-4 py-3">
                    {promoted
                      ? <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">★ {promotionLabel(j)}</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{fmt(j.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => togglePromotion(j)}
                      disabled={busyId === j.id}
                      className={`px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50 ${
                        promoted
                          ? "border border-gray-700 text-gray-400 hover:text-white"
                          : "bg-emerald-500 text-white hover:bg-emerald-600"
                      }`}
                    >
                      {busyId === j.id ? "…" : promoted ? "Un-promote" : "Promote"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Enterprise Tab ───────────────────────────────────────────────────────────

function EnterpriseTab() {
  const [employers, setEmployers] = useState<EnterpriseEmployer[]>([]);
  const [loading, setLoading] = useState(true);

  // Activation form state
  const [employerId, setEmployerId] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [seats, setSeats] = useState("");
  const [accountManagerName, setAccountManagerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/enterprise/employers")
      .then(r => r.json())
      .then(setEmployers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMsg("");
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/enterprise/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerId: employerId.trim(),
          durationMonths: Number(durationMonths),
          seats: Number(seats),
          accountManagerName: accountManagerName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error ?? "Activation failed");
      } else {
        setSuccessMsg(`Enterprise activated for employer ${data.id}`);
        // Refresh the employer list
        fetch("/api/admin/enterprise/employers")
          .then(r => r.json())
          .then(setEmployers)
          .catch(() => {});
        // Reset form
        setEmployerId("");
        setDurationMonths("");
        setSeats("");
        setAccountManagerName("");
      }
    } catch {
      setErrorMsg("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Enterprise Employers Table */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Enterprise Employers</h2>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Company</th>
                  <th className="px-4 py-3 text-left">Expiry</th>
                  <th className="px-4 py-3 text-left">Seats</th>
                  <th className="px-4 py-3 text-left">Account Manager</th>
                  <th className="px-4 py-3 text-left">CV Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {employers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      No enterprise employers yet
                    </td>
                  </tr>
                ) : employers.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{emp.name}</td>
                    <td className="px-4 py-3 text-gray-400">{emp.companyName ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {emp.subscriptionExpiry
                        ? new Date(emp.subscriptionExpiry).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{emp.maxRecruiterSeats}</td>
                    <td className="px-4 py-3 text-gray-400">{emp.accountManagerName ?? "—"}</td>
                    <td className="px-4 py-3">
                      {emp.hasCvAccess
                        ? <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full">Yes</span>
                        : <span className="text-xs bg-gray-500/10 text-gray-400 px-2 py-0.5 rounded-full">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activation Form */}
      <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Activate Enterprise Package</h2>
        <form onSubmit={handleActivate} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Employer ID</label>
            <input
              required
              value={employerId}
              onChange={e => setEmployerId(e.target.value)}
              placeholder="cuid..."
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Duration (months, 1–60)</label>
            <input
              required
              type="number"
              min={1}
              max={60}
              value={durationMonths}
              onChange={e => setDurationMonths(e.target.value)}
              placeholder="12"
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Recruiter Seats (1–50)</label>
            <input
              required
              type="number"
              min={1}
              max={50}
              value={seats}
              onChange={e => setSeats(e.target.value)}
              placeholder="5"
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Account Manager Name (optional)</label>
            <input
              value={accountManagerName}
              onChange={e => setAccountManagerName(e.target.value)}
              placeholder="e.g. Ali Hassan"
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "Activating…" : "Activate Enterprise"}
          </button>
          {successMsg && <p className="text-sm text-emerald-400">{successMsg}</p>}
          {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
        </form>
      </div>
    </div>
  );
}

// ─── Emails Tab ───────────────────────────────────────────────────────────────

const CAMPAIGN_LABEL: Record<string, string> = {
  RECRUITER_LAPSED: "Lapsed poster",
  RECRUITER_NEVER_POSTED: "Never posted",
  SEEKER_JOB_DIGEST: "Seeker daily digest",
  SEEKER_WEEKLY_NEWSLETTER: "Seeker weekly newsletter",
};

const CAMPAIGN_COLOR: Record<string, string> = {
  RECRUITER_LAPSED: "bg-amber-500/10 text-amber-400",
  RECRUITER_NEVER_POSTED: "bg-sky-500/10 text-sky-400",
  SEEKER_JOB_DIGEST: "bg-emerald-500/10 text-emerald-400",
  SEEKER_WEEKLY_NEWSLETTER: "bg-violet-500/10 text-violet-400",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function EmailsTab() {
  const [data, setData] = useState<EmailLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState("");
  const [windowDays, setWindowDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ windowDays: String(windowDays), limit: "200" });
    if (campaign) params.set("campaign", campaign);
    fetch(`/api/admin/email-log?${params}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [campaign, windowDays]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!data) return <p className="text-gray-500 py-10 text-center">Could not load email activity.</p>;

  const lapsed = data.conversions.RECRUITER_LAPSED;
  const neverPosted = data.conversions.RECRUITER_NEVER_POSTED;

  return (
    <div className="space-y-8">
      {/* Conversion — did the nudge make them post? */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-white">Recruiter re-engagement</h2>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            Posted within
            <select
              value={windowDays}
              onChange={e => setWindowDays(Number(e.target.value))}
              className="px-2 py-1 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
            of the email
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Never posted — emailed"
            value={neverPosted?.recipients ?? 0}
            sub={`${neverPosted?.emailsSent ?? 0} emails sent`}
          />
          <StatCard
            label="Never posted — then posted"
            value={neverPosted?.converted ?? 0}
            sub={`${neverPosted?.conversionRate ?? 0}% conversion`}
          />
          <StatCard
            label="Lapsed — emailed"
            value={lapsed?.recipients ?? 0}
            sub={`${lapsed?.emailsSent ?? 0} emails sent`}
          />
          <StatCard
            label="Lapsed — then posted"
            value={lapsed?.converted ?? 0}
            sub={`${lapsed?.conversionRate ?? 0}% conversion`}
          />
        </div>
      </div>

      {/* Volume by campaign */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Total sent by campaign</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.keys(CAMPAIGN_LABEL).map(key => (
            <StatCard key={key} label={CAMPAIGN_LABEL[key]} value={data.totals[key] ?? 0} />
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {data.unsubscribed} user{data.unsubscribed === 1 ? " has" : "s have"} opted out of automated email.
        </p>
      </div>

      {/* Log */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-white">Send log</h2>
          <select
            value={campaign}
            onChange={e => setCampaign(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="">All campaigns</option>
            {Object.keys(CAMPAIGN_LABEL).map(key => (
              <option key={key} value={key}>{CAMPAIGN_LABEL[key]}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Sent</th>
                <th className="px-4 py-3 text-left">Recipient</th>
                <th className="px-4 py-3 text-left">Segment</th>
                <th className="px-4 py-3 text-left">Step</th>
                <th className="px-4 py-3 text-left">Subject</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {data.rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">No emails sent yet</td></tr>
              ) : data.rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {new Date(row.sentAt).toLocaleString("en-PK", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{row.user.name}</div>
                    <div className="text-xs text-gray-500">{row.recipient}</div>
                    {row.user.companyName && (
                      <div className="text-xs text-gray-500">{row.user.companyName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${CAMPAIGN_COLOR[row.campaign] ?? "bg-gray-700 text-gray-300"}`}>
                      {CAMPAIGN_LABEL[row.campaign] ?? row.campaign}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {row.campaign.startsWith("RECRUITER_") ? `${row.sequenceStep} of 3` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 max-w-xs truncate" title={row.subject}>
                    {row.subject}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pending");

  const [pending, setPending] = useState<PendingRecruiter[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  const [requests, setRequests] = useState<PromotionRequestRow[]>([]);
  const [focusJobId, setFocusJobId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/recruiters/pending")
      .then(r => r.json()).then(setPending).catch(() => {}).finally(() => setPendingLoading(false));
    fetch("/api/admin/users")
      .then(r => r.json()).then(setUsers).catch(() => {}).finally(() => setUsersLoading(false));
    fetch("/api/admin/jobs")
      .then(r => r.json()).then(setJobs).catch(() => {}).finally(() => setJobsLoading(false));
    fetch("/api/promotion-requests?status=PENDING")
      .then(r => r.json())
      .then(d => setRequests(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Deep link from the admin notification email: /admin?tab=jobs&job=<id>
  // lands on the Jobs tab with that listing isolated, ready to promote.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "jobs") setActiveTab("jobs");
    const job = params.get("job");
    if (job) {
      setActiveTab("jobs");
      setFocusJobId(job);
    }
  }, []);

  function handleApprove(id: string) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, recruiterVerified: true } : u));
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "pending", label: "Pending Approvals", badge: pendingLoading ? undefined : pending.length },
    { key: "recruiters", label: "Recruiters", badge: usersLoading ? undefined : users.filter(u => u.role === "RECRUITER").length },
    { key: "seekers", label: "Job Seekers", badge: usersLoading ? undefined : users.filter(u => u.role === "APPLICANT").length },
    { key: "jobs", label: "Job Posts", badge: requests.length > 0 ? requests.length : (jobsLoading ? undefined : jobs.length) },
    { key: "enterprise", label: "Enterprise" },
    { key: "emails", label: "Emails" },
  ];

  const isLoading = (activeTab === "pending" && pendingLoading) ||
    (["recruiters", "seekers"].includes(activeTab) && usersLoading) ||
    (activeTab === "jobs" && jobsLoading);

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">Admin Dashboard</h1>
          <p className="text-gray-400 mt-1 text-sm">Manage users, recruiters, and job posts.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-gray-800 border border-gray-700 mb-6 w-fit flex-wrap">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-gray-900 text-white shadow-sm border border-gray-600"
                  : "text-gray-400 hover:text-white"
              }`}>
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            {activeTab === "pending" && <PendingTab recruiters={pending} setRecruiters={setPending} onApprove={handleApprove} />}
            {activeTab === "recruiters" && <RecruitersTab users={users} setUsers={setUsers} />}
            {activeTab === "seekers" && <SeekersTab users={users} />}
            {activeTab === "jobs" && (
              <JobsTab
                jobs={jobs}
                setJobs={setJobs}
                requests={requests}
                setRequests={setRequests}
                focusJobId={focusJobId}
              />
            )}
            {activeTab === "enterprise" && <EnterpriseTab />}
            {activeTab === "emails" && <EmailsTab />}
          </>
        )}
      </div>
    </div>
  );
}
