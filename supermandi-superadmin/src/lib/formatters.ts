/**
 * TZ-FORMAT-001 + CURRENCY-FORMAT-001: Shared formatters for SuperAdmin
 * All dates use Asia/Kolkata timezone. All currency uses INR.
 */

const TZ = 'Asia/Kolkata';
const LOCALE = 'en-IN';

// ── Date Formatters ─────────────────────────────────────────────────────────

/** Format date: "5 Feb 2026" */
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
}

/** Format date+time: "5 Feb 2026, 4:30 PM" */
export function formatDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(LOCALE, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: TZ,
  });
}

// ── Currency Formatters ─────────────────────────────────────────────────────

const currencyFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format minor-unit (paise) amount as INR: 12345 → "₹123.45" */
export function formatCurrency(paise: number): string {
  return currencyFmt.format((paise || 0) / 100);
}
