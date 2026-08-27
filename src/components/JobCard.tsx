"use client";

import Link from "next/link";

interface JobCardProps {
  slug: string;
  title: string;
  company: string;
  logoUrl?: string;
  location: string;
  salary?: string;
  experience?: string;
  datePosted: string;
  skills: string[];
  isFeatured?: boolean;
  isVerified?: boolean;
  isNew?: boolean;
  applyUrl?: string;
}

/**
 * Card used on the category and SEO landing pages.
 *
 * Kept visually in step with LiveJobCard — same radius, borders, badge
 * treatment and promoted styling — so a listing doesn't change appearance
 * depending on which page a visitor lands on.
 */
export default function JobCard({
  slug,
  title,
  company,
  logoUrl,
  location,
  salary,
  experience,
  datePosted,
  skills,
  isFeatured = false,
  isVerified = false,
  isNew = false,
  applyUrl,
}: JobCardProps) {
  const isRemote = location.toLowerCase().includes("remote");

  const shell = isFeatured
    ? "border-border border-l-[3px] border-l-accent bg-accent-soft dark:bg-card"
    : "border-border bg-card";

  return (
    <article
      className={`group relative flex flex-col rounded-lg border ${shell} p-5 transition-shadow duration-200 hover:shadow-[0_4px_16px_-4px_rgba(27,31,35,0.16)]`}
    >
      {(isFeatured || isNew) && (
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          {isFeatured && (
            <span className="rounded-[3px] bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-white">
              ★ Promoted
            </span>
          )}
          {isNew && (
            <span className="rounded-[3px] border border-success/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-success">
              New
            </span>
          )}
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`${company} logo`} className="h-full w-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-muted">{company.charAt(0)}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold leading-6 tracking-[-0.01em] text-primary">
            <Link href={`/jobs/${slug}`} className="focus:outline-none focus-visible:underline">
              <span className="absolute inset-0" aria-hidden="true" />
              {title}
            </Link>
          </h3>

          <p className="mt-0.5 text-sm font-medium text-foreground">
            {company}
            {isVerified && (
              <span className="ml-1 text-primary" title="Verified employer">
                ✓
              </span>
            )}
          </p>

          <p className="mt-0.5 text-xs text-muted">
            {isRemote ? "Remote" : location}
            {experience && <> &middot; {experience}</>}
          </p>
        </div>
      </div>

      {salary && <p className="mt-3 text-sm font-semibold text-foreground">{salary}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {skills.slice(0, 4).map((skill) => (
          <span
            key={skill}
            className="rounded bg-surface px-2 py-0.5 text-xs font-medium text-muted"
          >
            {skill}
          </span>
        ))}
        {skills.length > 4 && (
          <span className="text-xs text-muted">+{skills.length - 4} more</span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted">{datePosted}</span>

        {applyUrl ? (
          <a
            href={applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Apply now
          </a>
        ) : (
          <Link
            href={`/jobs/${slug}`}
            className="relative z-10 rounded-full border border-primary px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-light"
          >
            View job
          </Link>
        )}
      </div>
    </article>
  );
}
