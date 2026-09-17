/** All monetary values are stored as integer minor units (cents) to avoid float drift. */

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function dollarsToCents(dollars: number | undefined): number | undefined {
  return dollars === undefined ? undefined : Math.round(dollars * 100);
}

export function applyRate(cents: number, rate: number): number {
  return Math.round(cents * rate);
}
