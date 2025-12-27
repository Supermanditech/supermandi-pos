export type MoneyCurrency = string;

export function minorToMajor(minor: number, fractionDigits = 2): number {
  return minor / Math.pow(10, fractionDigits);
}

export function formatMoney(minor: number, currency: MoneyCurrency = "INR", fractionDigits = 2): string {
  const major = minorToMajor(minor, fractionDigits);
  // Keep it simple and stable across RN runtimes (Intl can be inconsistent).
  return `${currency} ${major.toFixed(fractionDigits)}`;
}

