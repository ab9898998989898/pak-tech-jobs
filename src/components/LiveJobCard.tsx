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

function ResponseRateBadge({ rate }: { rate: number }) {
  if (rate >= 90) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
        ✓ {rate}% Highly Responsive
      </span>
    );
  }
  if (rate >= 70) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">
        ~ {rate}% Responsive
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
      ⚠ {rate}% Low Responsiveness
    </span>
  );
}

function formatJobType(jt: string) {
  return jt.replace(/_/g, "-").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatExperience(el: string) {
  return el.charAt(0) + el.slice(1).toLowerCase();
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

  return (
    <div
      className={
        isPromoted
          ? "group relative flex flex-col p-6 rounded-2xl border-2 border-primary/40 bg-primary/[0.04] dark:bg-primary/[0.07] ring-1 ring-primary/10 shadow-md transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-primary/60"
          : "group relative flex flex-col p-6 rounded-2xl border border-border dark:border-border-dark bg-card dark:bg-card-dark transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-primary/50"
      }
    >
      {/* Top-right badges: Promoted, Premium and/or External */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
        {isPromoted && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/30">
            ★ Promoted
          </span>
        )}
        {job.isPremium && (
          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            ⭐ Premium
          </span>
        )}
        {isAggregated && (
          <span className="text-[10px] font-medium text-muted bg-surface dark:bg-surface-dark px-2 py-0.5 rounded-full border border-border dark:border-border-dark">
            External
          </span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-11 h-11 flex-shrink-0 rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark flex items-center justify-center">
          <span className="text-lg font-bold text-muted">{companyName.charAt(0)}</span>
        </div>
        <div className="flex-1 min-w-0 pr-16">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
              {isAggregated ? (
                <a
                  href={job.applyUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus:outline-none hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {job.title}
                </a>
              ) : (
                <Link href={`/jobs/${job.id}`} className="focus:outline-none">
                  <span className="absolute inset-0" aria-hidden="true" />
                  {job.title}
                </Link>
              )}
            </h3>
          </div>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-sm text-muted">
            <span className="font-medium text-muted-foreground">
              {companyName}
              {job.recruiter.recruiterVerified && (
                <span className="ml-1 text-blue-500" title="Verified Company">✓</span>
              )}
            </span>
            <span className="hidden sm:inline">•</span>
            <span className={isRemote ? "text-emerald-500" : ""}>
              {isRemote ? "🌍 Remote" : `📍 ${job.city}`}
            </span>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-3 text-sm mb-3">
        <span className="flex items-center gap-1 text-foreground">
          <span className="text-muted">💰</span>
          <span className="font-medium">
            PKR {job.salaryMin.toLocaleString()} – {job.salaryMax.toLocaleString()}
          </span>
        </span>
        <span className="flex items-center gap-1 text-muted">
          <span>⏳</span>
          {formatExperience(job.experienceLevel)}
        </span>
        <span className="flex items-center gap-1 text-muted">
          <span>💼</span>
          {formatJobType(job.jobType)}
        </span>
      </div>

      {/* Response Rate — only for recruiter-posted jobs */}
      {!isAggregated && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <ResponseRateBadge rate={Math.round(job.recruiter.responseRate)} />
          <span className="text-xs text-muted">
            {job.recruiter.avgResponseTimeHours != null
              ? `Avg. response: ${job.recruiter.avgResponseTimeHours}h`
              : "Avg. response: N/A"}
          </span>
        </div>
      )}

      {/* Skills */}
      <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-border dark:border-border-dark relative z-10">
        {job.skills.slice(0, 4).map((skill) => (
          <span
            key={skill}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary"
          >
            {skill}
          </span>
        ))}
        {job.skills.length > 4 && (
          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-surface dark:bg-surface-dark text-muted">
            +{job.skills.length - 4}
          </span>
        )}

        {/* Apply button — external for aggregated, internal for recruiter jobs */}
        {isAggregated ? (
          <a
            href={job.applyUrl!}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto flex-shrink-0 px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            Apply Now →
          </a>
        ) : (
          <Link
            href={`/jobs/${job.id}`}
            className="ml-auto flex-shrink-0 px-4 py-1.5 rounded-lg border border-border dark:border-border-dark text-xs font-medium text-foreground hover:bg-surface dark:hover:bg-surface-dark transition-colors"
          >
            View Job
          </Link>
        )}
      </div>
    </div>
  );
}
