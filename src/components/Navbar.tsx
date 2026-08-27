"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import NotificationBell from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

const navLinks = [
  { href: "/salaries", label: "Salaries" },
  { href: "/tools", label: "Tools" },
  { href: "/resources", label: "Resources" },
  { href: "/courses", label: "Courses" },
];

const jobsMenu = {
  browse: [
    { href: "/jobs", label: "All Jobs" },
    { href: "/remote-jobs", label: "Remote Jobs" },
    { href: "/jobs-in-lahore", label: "Jobs in Lahore" },
    { href: "/jobs-in-karachi", label: "Jobs in Karachi" },
  ],
  skills: [
    { href: "/react-jobs-pakistan", label: "React Jobs" },
    { href: "/nodejs-jobs-pakistan", label: "Node.js Jobs" },
    { href: "/mern-jobs-pakistan", label: "MERN Stack" },
    { href: "/ai-jobs-pakistan", label: "AI & ML Jobs" },
    { href: "/devops-jobs-pakistan", label: "DevOps Jobs" },
  ],
  entry: [
    { href: "/internships-pakistan", label: "Internships" },
    { href: "/fresh-graduate-it-jobs", label: "Fresh Graduate" },
  ],
};

function getDashboardHref(role?: string) {
  if (role === "RECRUITER") return "/recruiter/dashboard";
  if (role === "ADMIN") return "/admin";
  return "/dashboard";
}

/** Shared item styling for the desktop dropdown and the mobile sheet. */
const menuItem =
  "block rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface hover:text-primary";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [jobsDropdownOpen, setJobsDropdownOpen] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  /** Top-level link with a LinkedIn-style underline on the active route. */
  const topLink = (href: string) =>
    `relative flex h-14 items-center px-3 text-sm font-medium transition-colors ${
      isActive(href)
        ? "text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:rounded-full after:bg-primary"
        : "text-muted hover:text-foreground"
    }`;

  return (
    // The bottom hairline is a shadow, not a border: a border would add 1px to
    // the nav's height and push content under the fixed bar, since `main` only
    // offsets by the 56px content height.
    <nav className="fixed inset-x-0 top-0 z-50 bg-card shadow-[0_1px_0_0_var(--border)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-2">

          <div className="flex items-center gap-1">
            <Link href="/" className="group mr-2 flex items-center">
              <Logo size="md" className="transition-opacity group-hover:opacity-85" />
            </Link>

            {/* Desktop Nav */}
            <div className="hidden items-center md:flex">
              <div
                className="relative"
                onMouseEnter={() => setJobsDropdownOpen(true)}
                onMouseLeave={() => setJobsDropdownOpen(false)}
              >
                <button
                  className={`${topLink("/jobs")} gap-1`}
                  aria-expanded={jobsDropdownOpen}
                  aria-haspopup="true"
                >
                  Jobs
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {jobsDropdownOpen && (
                  <div className="absolute left-0 z-50 w-60 rounded-lg border border-border bg-card p-1.5 shadow-lg">
                    {jobsMenu.browse.map((l) => (
                      <Link key={l.href} href={l.href} className={menuItem}>
                        {l.label}
                      </Link>
                    ))}

                    <div className="my-1.5 border-t border-border" />
                    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      By skill
                    </p>
                    {jobsMenu.skills.map((l) => (
                      <Link key={l.href} href={l.href} className={menuItem}>
                        {l.label}
                      </Link>
                    ))}

                    <div className="my-1.5 border-t border-border" />
                    {jobsMenu.entry.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        className="block rounded-md px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-light"
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className={topLink(link.href)}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Auth / role-aware actions */}
          <div className="hidden items-center gap-1 md:flex">
            <Link
              href="/register?role=recruiter"
              className="mr-1 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Post a job — free
            </Link>

            {session?.user ? (
              <>
                <Link
                  href={getDashboardHref(session.user.role as string)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
                >
                  Dashboard
                </Link>
                <ThemeToggle />
                <NotificationBell />
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <ThemeToggle />
                <Link
                  href="/login"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="rounded-full border border-primary px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-light"
                >
                  Register
                </Link>
              </>
            )}
          </div>

          {/* Mobile */}
          <div className="flex items-center gap-1 md:hidden">
            <NotificationBell />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="rounded-md p-2 text-foreground transition-colors hover:bg-surface"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="max-h-[80vh] overflow-y-auto border-t border-border bg-card md:hidden">
          <div className="space-y-4 px-4 py-4">
            <div>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Jobs directory
              </p>
              {[...jobsMenu.browse, ...jobsMenu.skills].map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setMobileOpen(false)} className={menuItem}>
                  {l.label}
                </Link>
              ))}
              {jobsMenu.entry.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm font-semibold text-primary hover:bg-primary-light"
                >
                  {l.label}
                </Link>
              ))}
            </div>

            <div className="border-t border-border pt-3">
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Tools &amp; guides
              </p>
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className={menuItem}>
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-xs text-muted">Theme</span>
                <ThemeToggle />
              </div>

              <Link
                href="/register?role=recruiter"
                onClick={() => setMobileOpen(false)}
                className="mb-2 block rounded-full bg-primary px-4 py-2 text-center text-sm font-semibold text-white"
              >
                Post a job — free
              </Link>

              {session?.user ? (
                <>
                  <Link
                    href={getDashboardHref(session.user.role as string)}
                    onClick={() => setMobileOpen(false)}
                    className={menuItem}
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      signOut({ callbackUrl: "/" });
                    }}
                    className={`${menuItem} w-full text-left`}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMobileOpen(false)} className={menuItem}>
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-md px-3 py-2 text-sm font-semibold text-primary hover:bg-primary-light"
                  >
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
