"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type State = "working" | "unsubscribed" | "resubscribed" | "invalid" | "error";

function UnsubscribeInner() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>("working");
  const [busy, setBusy] = useState(false);

  // The opt-out runs from client JS on mount rather than from the GET itself:
  // corporate link scanners and inbox previewers fetch every URL in an email,
  // and would otherwise unsubscribe people who never clicked.
  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        setState(res.ok ? "unsubscribed" : res.status === 404 ? "invalid" : "error");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function resubscribe() {
    setBusy(true);
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(res.ok ? "resubscribed" : "error");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center shadow-sm">
        {state === "working" && (
          <p className="text-gray-600 dark:text-gray-400">Updating your preferences…</p>
        )}

        {state === "unsubscribed" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              You&apos;ve been unsubscribed
            </h1>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              You won&apos;t receive job digests or re-engagement emails from
              PakTechJobs any more. You&apos;ll still get essential updates about
              your applications and interviews.
            </p>
            <button
              onClick={resubscribe}
              disabled={busy}
              className="mt-6 text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
            >
              {busy ? "Working…" : "Unsubscribed by mistake? Resubscribe"}
            </button>
          </>
        )}

        {state === "resubscribed" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              You&apos;re resubscribed
            </h1>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Job digests and updates will start arriving again.
            </p>
          </>
        )}

        {state === "invalid" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              This link isn&apos;t valid
            </h1>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              It may have already been used or replaced. You can manage email
              preferences from your dashboard instead.
            </p>
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Something went wrong
            </h1>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              We couldn&apos;t update your preferences. Please try again, or
              contact us and we&apos;ll sort it out.
            </p>
          </>
        )}

        <div className="mt-8 border-t border-gray-100 dark:border-gray-800 pt-5">
          <Link
            href="/jobs"
            className="text-sm text-gray-500 hover:text-emerald-600 dark:text-gray-500"
          >
            Browse jobs on PakTechJobs
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeInner />
    </Suspense>
  );
}
