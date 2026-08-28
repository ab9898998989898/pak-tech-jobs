"use client";

import { useState } from "react";
import { getPremiumToggleState } from "@/lib/enterpriseTier";
import type { EmployerTier } from "@/lib/enterpriseTier";

interface PremiumListingToggleProps {
  tier: EmployerTier;
  value: boolean;
  onChange: (v: boolean) => void;
}

/**
 * A toggle control for marking a job post as a premium listing.
 *
 * - FREE tier: disabled, with a "Contact sales" action beside it
 * - PRO / ENTERPRISE tier: enabled, wired to value/onChange
 *
 * The FREE state previously said "Contact Sales to Unlock" in a tooltip but
 * offered no way to do so. It now raises a tracked plan enquiry that alerts
 * the admin.
 */
export default function PremiumListingToggle({
  tier,
  value,
  onChange,
}: PremiumListingToggleProps) {
  const { disabled, tooltip } = getPremiumToggleState(tier);

  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function enquire() {
    setState("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/plan-enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "PREMIUM" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || res.status === 409) {
        // A duplicate means we already have their enquiry — same outcome for them.
        setState("sent");
        return;
      }
      setErrorMsg(data.error ?? "Could not send your enquiry");
      setState("error");
    } catch {
      setErrorMsg("Network error");
      setState("error");
    }
  }

  const toggle = (
    <label
      className={`inline-flex items-center gap-2.5 text-sm select-none ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => {
          if (!disabled) onChange(e.target.checked);
        }}
        className="accent-primary h-4 w-4"
        aria-label="Premium Listing"
      />
      <span className="font-medium text-foreground">Premium Listing</span>
      {disabled && (
        <span className="text-xs font-normal text-muted">(PRO / ENTERPRISE only)</span>
      )}
    </label>
  );

  if (!disabled) return toggle;

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <span title={tooltip ?? undefined} className="inline-block">
        {toggle}
      </span>

      {state === "sent" ? (
        <span className="text-xs font-medium text-success">
          Thanks — we&apos;ll be in touch about upgrading.
        </span>
      ) : (
        <button
          type="button"
          onClick={enquire}
          disabled={state === "sending"}
          className="rounded-full border border-primary px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary-light disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : "Contact sales"}
        </button>
      )}

      {state === "error" && <span className="text-xs text-red-500">{errorMsg}</span>}
    </div>
  );
}
