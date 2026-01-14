// Locale-aware formatters - V3.0.10
// Currency, date, and number formatting based on selected language

import i18n from './index';

// =============================================================================
// LOCALE MAPPING
// =============================================================================

/**
 * Get the appropriate locale string for Intl APIs
 * Maps i18n language codes to full locale codes
 */
export function getIntlLocale(): string {
  const lang = i18n.language || 'en';
  switch (lang) {
    case 'hi':
      return 'hi-IN';
    case 'en':
    default:
      return 'en-IN';
  }
}

// =============================================================================
// CURRENCY FORMATTING
// =============================================================================

/**
 * Format currency amount from minor units (paise) to display string
 * Uses Indian number system for INR (lakhs/crores)
 */
export function formatCurrency(
  minorUnits: number,
  currency: string = 'INR',
  options?: {
    locale?: string;
    showSymbol?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  const {
    locale = getIntlLocale(),
    showSymbol = true,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options || {};

  const majorUnits = minorUnits / 100;

  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: showSymbol ? 'currency' : 'decimal',
      currency: showSymbol ? currency : undefined,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(majorUnits);

    return formatted;
  } catch (error) {
    // Fallback for unsupported environments
    const symbol = currency === 'INR' ? '₹' : currency;
    return showSymbol
      ? `${symbol}${majorUnits.toFixed(minimumFractionDigits)}`
      : majorUnits.toFixed(minimumFractionDigits);
  }
}

/**
 * Format number with Indian grouping (lakhs, crores)
 */
export function formatIndianNumber(value: number): string {
  const locale = getIntlLocale();
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return value.toLocaleString();
  }
}

// =============================================================================
// DATE FORMATTING
// =============================================================================

export type DateFormatStyle = 'short' | 'medium' | 'long' | 'full';

/**
 * Format date based on current locale
 */
export function formatDate(
  date: Date | string | number,
  style: DateFormatStyle = 'medium'
): string {
  const locale = getIntlLocale();
  const d = date instanceof Date ? date : new Date(date);

  if (isNaN(d.getTime())) {
    return '--';
  }

  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: style }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

/**
 * Format time based on current locale
 */
export function formatTime(
  date: Date | string | number,
  options?: {
    hour12?: boolean;
    showSeconds?: boolean;
  }
): string {
  const locale = getIntlLocale();
  const d = date instanceof Date ? date : new Date(date);
  const { hour12 = true, showSeconds = false } = options || {};

  if (isNaN(d.getTime())) {
    return '--';
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      second: showSeconds ? '2-digit' : undefined,
      hour12,
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

/**
 * Format date and time together
 */
export function formatDateTime(
  date: Date | string | number,
  options?: {
    dateStyle?: DateFormatStyle;
    timeStyle?: 'short' | 'medium';
  }
): string {
  const locale = getIntlLocale();
  const d = date instanceof Date ? date : new Date(date);
  const { dateStyle = 'medium', timeStyle = 'short' } = options || {};

  if (isNaN(d.getTime())) {
    return '--';
  }

  try {
    return new Intl.DateTimeFormat(locale, { dateStyle, timeStyle }).format(d);
  } catch {
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  }
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return i18n.t('time.justNow');
  }
  if (diffMins < 60) {
    return i18n.t('time.minutesAgo', { count: diffMins });
  }
  if (diffHours < 24) {
    return i18n.t('time.hoursAgo', { count: diffHours });
  }
  if (diffDays < 7) {
    return i18n.t('time.daysAgo', { count: diffDays });
  }

  return formatDate(d, 'medium');
}

// =============================================================================
// MONTH/DAY NAMES
// =============================================================================

/**
 * Get month name for current locale
 */
export function getMonthName(month: number, style: 'long' | 'short' = 'long'): string {
  const locale = getIntlLocale();
  const date = new Date(2000, month, 1);

  try {
    return new Intl.DateTimeFormat(locale, { month: style }).format(date);
  } catch {
    return date.toLocaleDateString(undefined, { month: style });
  }
}

/**
 * Get day name for current locale
 */
export function getDayName(day: number, style: 'long' | 'short' = 'long'): string {
  const locale = getIntlLocale();
  // Jan 4, 2000 was a Tuesday (day 2), so offset to get correct day
  const date = new Date(2000, 0, 2 + day);

  try {
    return new Intl.DateTimeFormat(locale, { weekday: style }).format(date);
  } catch {
    return date.toLocaleDateString(undefined, { weekday: style });
  }
}

// =============================================================================
// NUMBER FORMATTING
// =============================================================================

/**
 * Format number with locale-specific grouping
 */
export function formatNumber(
  value: number,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  const locale = getIntlLocale();
  const { minimumFractionDigits = 0, maximumFractionDigits = 2 } = options || {};

  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value);
  } catch {
    return value.toFixed(maximumFractionDigits);
  }
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 1): string {
  const locale = getIntlLocale();

  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value / 100);
  } catch {
    return `${value.toFixed(decimals)}%`;
  }
}
