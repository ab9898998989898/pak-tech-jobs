import { randomBytes } from "crypto";

/**
 * Pricing and invoice references for manually-billed promotions.
 *
 * There is no payment gateway. A recruiter picks a package, an admin issues an
 * invoice, the recruiter pays offline (bank transfer / JazzCash / Easypaisa),
 * and the admin marks it paid — which promotes the listing.
 */

export interface PromotionPackage {
  /** Stable identifier stored on the request. */
  days: number;
  label: string;
  pricePkr: number;
}

/**
 * Prices are in whole PKR. The chosen price is copied onto the request when it
 * is raised, so changing this table never rewrites an invoice already sent.
 */
export const PROMOTION_PACKAGES: readonly PromotionPackage[] = [
  { days: 7, label: "1 week", pricePkr: 3000 },
  { days: 14, label: "2 weeks", pricePkr: 5000 },
  { days: 30, label: "1 month", pricePkr: 9000 },
] as const;

export const DEFAULT_PACKAGE_DAYS = 7;

export function findPackage(days: unknown): PromotionPackage | null {
  if (typeof days !== "number" || !Number.isInteger(days)) return null;
  return PROMOTION_PACKAGES.find((p) => p.days === days) ?? null;
}

export function formatPkr(amount: number): string {
  return `PKR ${amount.toLocaleString("en-PK")}`;
}

/** Bytes of randomness in an invoice reference. */
const INVOICE_REF_BYTES = 5;

/**
 * Reference the recruiter quotes in their bank transfer, e.g. PTJ-4F2A9C1B7D.
 *
 * Uppercase hex, short enough to type into a transfer memo and read back over
 * the phone. Five bytes rather than three: `invoiceRef` is uniquely indexed, so
 * a collision hard-fails an invoice, and at 24 bits the birthday bound makes a
 * clash likelier than not within a few thousand references. At 40 bits it is
 * ~1 in a million across the same span, and the issuing route retries anyway.
 */
export function generateInvoiceRef(): string {
  return `PTJ-${randomBytes(INVOICE_REF_BYTES).toString("hex").toUpperCase()}`;
}

/** Distinct values a reference can take — used to justify the width in tests. */
export const INVOICE_REF_SPACE = 256 ** INVOICE_REF_BYTES;

export interface PaymentInstructions {
  bankName: string | null;
  accountTitle: string | null;
  accountNumber: string | null;
  easypaisa: string | null;
  /**
   * Account title for the wallet, when it differs from the bank account title.
   * Mobile wallets are often registered to a different name, and a payer who
   * sees one title above several methods will assume it covers all of them.
   */
  easypaisaTitle: string | null;
  jazzcash: string | null;
  jazzcashTitle: string | null;
  /** True when nothing is configured — the admin must set the env vars. */
  empty: boolean;
}

/**
 * Payment details come from the environment, not the repo, so account numbers
 * are never committed.
 */
export function paymentInstructions(): PaymentInstructions {
  const clean = (v: string | undefined) => {
    const t = v?.trim();
    return t && t.length > 0 ? t : null;
  };

  const details = {
    bankName: clean(process.env.PAYMENT_BANK_NAME),
    accountTitle: clean(process.env.PAYMENT_ACCOUNT_TITLE),
    accountNumber: clean(process.env.PAYMENT_ACCOUNT_NUMBER),
    easypaisa: clean(process.env.PAYMENT_EASYPAISA),
    easypaisaTitle: clean(process.env.PAYMENT_EASYPAISA_TITLE),
    jazzcash: clean(process.env.PAYMENT_JAZZCASH),
    jazzcashTitle: clean(process.env.PAYMENT_JAZZCASH_TITLE),
  };

  return {
    ...details,
    // A title with no matching number is not a usable payment method, so the
    // block only counts as populated when an actual destination is set.
    empty:
      details.bankName === null &&
      details.accountNumber === null &&
      details.easypaisa === null &&
      details.jazzcash === null,
  };
}
