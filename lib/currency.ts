/**
 * Currency handling for transaction amounts. Amounts are always stored and shown in their original currency.
 * No exchange-rate conversion is performed anywhere (see docs/architecture/CURRENCY_HANDLING_v1.md).
 */

/** Currencies offered by the Analysis form. PKR is the requested demo default. */
export const SELECTABLE_CURRENCIES = ["PKR", "USD", "EUR", "GBP", "AED", "SAR"] as const;
export type SelectableCurrency = (typeof SELECTABLE_CURRENCIES)[number];
export const DEFAULT_CURRENCY: SelectableCurrency = "PKR";

/** Shown wherever a record has no recorded currency (legacy records). Never assume PKR or USD. */
export const UNKNOWN_CURRENCY_LABEL = "UNKNOWN";

const ISO_4217_PATTERN = /^[A-Z]{3}$/;

/** Well-formed ISO 4217 alphabetic code. Mirrors the domain contract (`TransactionFactSchema.currency`). */
export function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && ISO_4217_PATTERN.test(value);
}

const numberFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string): Intl.NumberFormat | null {
  const cached = currencyFormatters.get(currency);
  if (cached) return cached;
  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(currency, formatter);
    return formatter;
  } catch {
    return null;
  }
}

/**
 * Format an amount in its original currency, e.g. "PKR 10,000.00".
 * Without a recorded currency the number is shown with an explicit UNKNOWN marker instead of a currency symbol.
 */
export function formatAmount(amount: number, currency: string | null | undefined): string {
  if (isCurrencyCode(currency)) {
    const formatter = currencyFormatter(currency);
    // Intl inserts a non-breaking space after the code; normalise for consistent text output.
    if (formatter) return formatter.format(amount).replace(/ /g, " ");
    return `${currency} ${numberFormatter.format(amount)}`;
  }
  return `${numberFormatter.format(amount)} ${UNKNOWN_CURRENCY_LABEL}`;
}
