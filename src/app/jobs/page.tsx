"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import Link from "next/link";
import LiveJobCard, { LiveJob } from "@/components/LiveJobCard";

const JOB_TYPES = [
  { value: "", label: "Any" },
  { value: "FULL_TIME", label: "Full-time" },
  { value: "REMOTE", label: "Remote" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERNSHIP", label: "Internship" },
  { value: "PART_TIME", label: "Part-time" },
];

const EXPERIENCE_LEVELS = [
  { value: "", label: "Any" },
  { value: "JUNIOR", label: "Junior" },
  { value: "MID", label: "Mid" },
  { value: "SENIOR", label: "Senior" },
  { value: "LEAD", label: "Lead" },
];

const RESPONSE_RATES = [
  { value: "", label: "Any" },
  { value: "70", label: "70%+" },
  { value: "80", label: "80%+" },
  { value: "90", label: "90%+" },
];

interface Filters {
  q: string;
  city: string;
  jobType: string;
  experienceLevel: string;
  salaryMin: string;
  salaryMax: string;
  responseRate: string;
}

const DEFAULT_FILTERS: Filters = {
  q: "",
  city: "",
  jobType: "",
  experienceLevel: "",
  salaryMin: "",
  salaryMax: "",
  responseRate: "",
};

function buildQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.city) params.set("city", filters.city);
  if (filters.jobType) params.set("jobType", filters.jobType);
  if (filters.experienceLevel) params.set("experienceLevel", filters.experienceLevel);
  if (filters.salaryMin) params.set("salaryMin", filters.salaryMin);
  if (filters.salaryMax) params.set("salaryMax", filters.salaryMax);
  if (filters.responseRate) params.set("responseRate", filters.responseRate);
  return params.toString();
}

export default function JobsPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [jobs, setJobs] = useState<LiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveCount, setLiveCount] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce filter changes by 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters]);

  // Fetch jobs when debounced filters change
  const fetchJobs = useCallback(async (f: Filters) => {
    setLoading(true);
    try {
      const qs = buildQuery(f);
      const res = await fetch(`/api/jobs${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: LiveJob[] = await res.json();
      setJobs(data);
      setLiveCount(data.length);
    } catch {
      // keep previous results on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs(debouncedFilters);
  }, [debouncedFilters, fetchJobs]);

  // Socket.io: listen for jobs:count_updated
  useEffect(() => {
    const socket = io(window.location.origin, {
      path: "/api/socketio",
      reconnectionAttempts: 3,
      reconnectionDelay: 3000,
    });
    socketRef.current = socket;

    socket.on("jobs:count_updated", ({ activeCount }: { activeCount: number }) => {
      setLiveCount(activeCount);
      // Re-fetch to get the latest listings
      fetchJobs(debouncedFilters);
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  const displayCount = liveCount ?? jobs.length;

  return (
    <div className="min-h-screen bg-background pt-24 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* Hero — a search header, not a landing banner. Blue field on the warm
            page ground; the job list is what people came for. */}
        <div className="mb-8 rounded-lg bg-[#0a3d6e] px-6 py-10 text-white md:px-12 md:py-12">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-[28px] font-bold leading-9 tracking-[-0.02em] md:text-[32px] md:leading-10">
              Tech Jobs in Pakistan 2026
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-5 text-white/70">
              Software engineering, AI, DevOps, React and Node.js roles in Lahore,
              Karachi, Islamabad and Remote — every listing shows the recruiter&apos;s
              response rate.
            </p>
            <div className="relative mt-6">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search by title, skill, or keyword…"
                value={filters.q}
                onChange={(e) => setFilter("q", e.target.value)}
                className="w-full rounded-full border border-white/25 bg-white/10 py-3 pl-11 pr-4 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/60"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* Filter Sidebar */}
          <aside className="w-full lg:w-[264px] flex-shrink-0">
            <div className="sticky top-20 bg-card border border-border rounded-lg p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm uppercase tracking-wide text-muted">Filters</h2>
                <button
                  onClick={clearFilters}
                  className="text-xs text-primary hover:underline"
                >
                  Clear all
                </button>
              </div>

              {/* City */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">City</label>
                <input
                  type="text"
                  placeholder="e.g. Lahore"
                  value={filters.city}
                  onChange={(e) => setFilter("city", e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Job Type */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Job Type</label>
                <select
                  value={filters.jobType}
                  onChange={(e) => setFilter("jobType", e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {JOB_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Experience Level */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Experience Level</label>
                <select
                  value={filters.experienceLevel}
                  onChange={(e) => setFilter("experienceLevel", e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {EXPERIENCE_LEVELS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Salary Range */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Salary Range (USD/yr)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.salaryMin}
                    onChange={(e) => setFilter("salaryMin", e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    min={0}
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.salaryMax}
                    onChange={(e) => setFilter("salaryMax", e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    min={0}
                  />
                </div>
              </div>

              {/* Min Response Rate */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Min Response Rate</label>
                <select
                  value={filters.responseRate}
                  onChange={(e) => setFilter("responseRate", e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {RESPONSE_RATES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </aside>

          {/* Job Listings */}
          <main className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold tracking-[-0.01em]">
                {loading ? "Loading…" : `${displayCount} job${displayCount !== 1 ? "s" : ""} found`}
              </h2>
              {liveCount !== null && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Live
                </span>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-52 rounded-lg bg-card animate-pulse border border-border"
                  />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="rounded-lg border border-border bg-card py-16 text-center">
                <p className="mb-3 text-3xl">🔍</p>
                <p className="font-semibold text-foreground">No jobs match your filters</p>
                <p className="mt-1 text-sm text-muted">Try widening the salary range or clearing a filter.</p>
                <button
                  onClick={clearFilters}
                  className="mt-4 rounded-full border border-primary px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-light"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <LiveJobCard key={job.id} job={job} />
                ))}
              </div>
            )}
          </main>

          {/* Insight rail — surfaces data the platform already collects rather
              than sitting empty. Hidden below 1280px to keep the list readable. */}
          <aside className="hidden xl:block w-[240px] flex-shrink-0">
            <div className="sticky top-20 space-y-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Why response rates?
                </h3>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Every employer here is scored on how often and how quickly they
                  reply to applicants. Filter by it to avoid listings that go
                  nowhere.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Explore
                </h3>
                <div className="mt-2 flex flex-col gap-1.5">
                  <Link href="/market/salaries" className="text-xs font-medium text-primary hover:underline">
                    Salary benchmarks →
                  </Link>
                  <Link href="/market/demand" className="text-xs font-medium text-primary hover:underline">
                    In-demand skills →
                  </Link>
                  <Link href="/dashboard/job-alerts" className="text-xs font-medium text-primary hover:underline">
                    Create a job alert →
                  </Link>
                </div>
              </div>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}
