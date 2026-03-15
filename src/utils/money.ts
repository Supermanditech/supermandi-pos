import i18n from '../i18n';

export type MoneyCurrency = string;

export function minorToMajor(minor: number, fractionDigits = 2): number {
  const parsed = Number(minor);
  if (!Number.isFinite(parsed)) return 0;
  return parsed / Math.pow(10, fractionDigits);
}

/**
 * Get the locale for formatting based on currency and i18n language
 * For INR, we always use Indian locale (en-IN or hi-IN) for proper lakhs/crores grouping
 */
function getFormattingLocale(currency: string): string {
  const lang = i18n.language || 'en';
  if (currency === 'INR') {
    return lang === 'hi' ? 'hi-IN' : 'en-IN';
  }
  return lang === 'hi' ? 'hi' : 'en-US';
}

const formatGrouped = (value: string): string => {
  const [integerPart, fractionPart] = value.split(".");
  const sign = integerPart.startsWith("-") ? "-" : "";
  const digits = sign ? integerPart.slice(1) : integerPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${fractionPart ? `.${fractionPart}` : ""}`;
};

const formatInrGrouped = (value: string): string => {
  const [integerPart, fractionPart] = value.split(".");
  const sign = integerPart.startsWith("-") ? "-" : "";
  const digits = sign ? integerPart.slice(1) : integerPart;
  if (digits.length <= 3) {
    return `${sign}${digits}${fractionPart ? `.${fractionPart}` : ""}`;
  }
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const restGrouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${sign}${restGrouped},${last3}${fractionPart ? `.${fractionPart}` : ""}`;
};

// LIVE.POS.AMOUNT_PRECISION_AND_CAP.001: Max displayable amount (100 crore = 1 billion paise)
const MAX_AMOUNT_MINOR = 1_000_000_000_00; // 100 crore INR in paise

// STG-513: Exported validation — callers should check before accepting user input
export function isAmountWithinLimit(amountMinor: number): boolean {
  return Number.isFinite(amountMinor) && Math.abs(amountMinor) <= MAX_AMOUNT_MINOR;
}

export function formatMoney(minor: number | null | undefined, currency: MoneyCurrency = "INR", fractionDigits = 2): string {
  // STG-116: null/undefined returns em dash for display safety
  if (minor === null || minor === undefined) return "—";
  const safeMinor = Number.isFinite(Number(minor)) ? Number(minor) : 0;
  // LIVE.POS.AMOUNT_PRECISION_AND_CAP.001: Cap and round to prevent floating point display issues
  // STG-513: Warn in dev if amount exceeds cap (don't silently truncate)
  if (__DEV__ && Math.abs(safeMinor) > MAX_AMOUNT_MINOR) {
    console.warn(`[formatMoney] Amount ${safeMinor} exceeds MAX_AMOUNT_MINOR (${MAX_AMOUNT_MINOR}). Value will be capped.`);
  }
  const cappedMinor = Math.min(Math.abs(safeMinor), MAX_AMOUNT_MINOR) * (safeMinor < 0 ? -1 : 1);
  const roundedMinor = Math.round(cappedMinor);
  const major = minorToMajor(roundedMinor, fractionDigits);
  let result: string;
  if (typeof Intl !== "undefined" && typeof Intl.NumberFormat === "function") {
    try {
      const locale = getFormattingLocale(currency);
      result = new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(major);
    } catch {
      // Fall back to simple formatting.
      const formatted = major.toFixed(fractionDigits);
      result = currency === "INR"
        ? `₹ ${formatInrGrouped(formatted)}`
        : `${currency} ${formatGrouped(formatted)}`;
    }
  } else {
    const formatted = major.toFixed(fractionDigits);
    result = currency === "INR"
      ? `₹ ${formatInrGrouped(formatted)}`
      : `${currency} ${formatGrouped(formatted)}`;
  }
  // STG-117: Smart formatting — drop .00 on round amounts for cleaner display
  if (fractionDigits === 2 && major === Math.floor(major)) {
    result = result.replace(/\.00\b/, '');
  }
  return result;
}


