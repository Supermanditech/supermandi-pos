export type MoneyCurrency = string;

export function minorToMajor(minor: number, fractionDigits = 2): number {
  const parsed = Number(minor);
  if (!Number.isFinite(parsed)) return 0;
  return parsed / Math.pow(10, fractionDigits);
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

export function formatMoney(minor: number, currency: MoneyCurrency = "INR", fractionDigits = 2): string {
  const safeMinor = Number.isFinite(Number(minor)) ? Number(minor) : 0;
  const major = minorToMajor(safeMinor, fractionDigits);
  if (typeof Intl !== "undefined" && typeof Intl.NumberFormat === "function") {
    try {
      const locale = currency === "INR" ? "en-IN" : "en-US";
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(major);
    } catch {
      // Fall back to simple formatting.
    }
  }
  const formatted = major.toFixed(fractionDigits);
  if (currency === "INR") {
    return `₹ ${formatInrGrouped(formatted)}`;
  }
  return `${currency} ${formatGrouped(formatted)}`;
}


