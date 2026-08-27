"use client";

import Link from "next/link";

export interface LiveJob {
  id: string;
  title: string;
  city: string;
  location: string;
  jobType: string;
  experienceLevel: string;
  salaryMin: number;
  salaryMax: number;
  skills: string[];
  createdAt: string;
  applyUrl?: string | null;
  isPremium?: boolean;
  isFeatured?: boolean;
  featuredUntil?: string | null;
  recruiter: {
    id: string;
    name: string;
    companyName: string | null;
    responseRate: number;
    avgResponseTimeHours: number | null;
    recruiterVerified: boolean;
  };
}

/**
 * Response rate rendered as a star mark plus a plain-language label.
 *
 * The rating language is deliberate: a percentage alone reads as a statistic,
 * where stars read as a judgement a person can act on at a glance.
 */
function ResponseRate({ rate }: { rate: number }) {
  const stars = Math.max(1, Math.round((rate / 100) * 5));
  const tone =
    rate >= 90
      ? "text-success"
      : rate >= 70
      ? "text-accent"
      : "text-muted";
  const label = rate >= 90 ? "Highly responsive" : rate >= 70 ? "Responsive" : "Slow to respond";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-accent text-xs tracking-[0.08em]" aria-hidden="true">
        {"★".repeat(stars)}
        <span className="opacity-30">{"★".repeat(5 - stars)}</span>
      </span>
      <span className={`text-xs font-semibold ${tone}`}>
        {rate}% {label}
      </span>
    </span>
  );
}

function formatJobType(jt: string) {
  return jt.replace(/_/g, "-").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatExperience(el: string) {
  return el.charAt(0) + el.slice(1).toLowerCase();
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "1 month ago" : `${months} months ago`;
}

export default function LiveJobCard({ job }: { job: LiveJob }) {
  const isRemote = job.jobType === "REMOTE" || job.location.toLowerCase().includes("remote");
  const companyName = job.recruiter.companyName ?? job.recruiter.name;
  const isAggregated = !!job.applyUrl;

  // Mirrors isPromotionActive() — a promotion that lapsed since the nightly
  // expiry cron ran must stop showing as promoted straight away.
  const isPromoted =
    !!job.isFeatured &&
    (!job.featuredUntil || new Date(job.featuredUntil).getTime() > Date.now());

  const shell = isPromoted
    ? "border-border border-l-[3px] border-l-accent bg-accent-soft dark:bg-card"
    : "border-border bg-card";

  return (
    <article
      className={`group relative flex flex-col rounded-lg border ${shell} p-5 transition-shadow duration-200 hover:shadow-[0_4px_16px_-4px_rgba(27,31,35,0.16)]`}
    >
      {/* Status badges */}
      {(isPromoted || job.isPremium || isAggregated) && (
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          {isPromoted && (
            <span className="rounded-[3px] bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-white">
              ★ Promoted
            </span>
          )}
          {job.isPremium && (
            <span className="rounded-[3px] border border-accent/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-accent">
              Premium
            </span>
          )}
          {isAggregated && (
            <span className="rounded-[3px] border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-muted">
              External
            </span>
          )}
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Company mark */}
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
          <span className="text-lg font-bold text-muted">{companyName.charAt(0)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-6 tracking-[-0.01em] text-primary">
            {isAggregated ? (
              <a
                href={job.applyUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline focus:outline-none focus-visible:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {job.title}
              </a>
            ) : (
              <Link href={`/jobs/${job.id}`} className="focus:outline-none focus-visible:underline">
                <span className="absolute inset-0" aria-hidden="true" />
                {job.title}
              </Link>
            )}
          </h3>

          <p className="mt-0.5 text-sm font-medium text-foreground">
            {companyName}
            {job.recruiter.recruiterVerified && (
              <span className="ml-1 text-primary" title="Verified employer">
                ✓
              </span>
            )}
          </p>

          <p className="mt-0.5 text-xs text-muted">
            {isRemote ? "Remote" : job.city} &middot; {formatJobType(job.jobType)} &middot;{" "}
            {formatExperience(job.experienceLevel)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm font-semibold text-foreground">
        PKR {job.salaryMin.toLocaleString()} &ndash; {job.salaryMax.toLocaleString()}
      </p>

      {/* Response rate — recruiter-posted jobs only; aggregated listings have no recruiter to rate */}
      {!isAggregated && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ResponseRate rate={Math.round(job.recruiter.responseRate)} />
          {job.recruiter.avgResponseTimeHours != null && (
            <span className="text-xs text-muted">
              &middot; replies in ~{job.recruiter.avgResponseTimeHours}h
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {job.skills.slice(0, 4).map((skill) => (
          <span
            key={skill}
            className="rounded bg-surface px-2 py-0.5 text-xs font-medium text-muted"
          >
            {skill}
          </span>
        ))}
        {job.skills.length > 4 && (
          <span className="text-xs text-muted">+{job.skills.length - 4} more</span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted">{timeAgo(job.createdAt)}</span>

        {isAggregated ? (
          <a
            href={job.applyUrl!}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Apply now
          </a>
        ) : (
          <Link
            href={`/jobs/${job.id}`}
            className="relative z-10 rounded-full border border-primary px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-light"
          >
            View job
          </Link>
        )}
      </div>
    </article>
  );
}
