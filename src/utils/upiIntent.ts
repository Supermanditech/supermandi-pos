export type UpiIntentInput = {
  upiVpa: string | null | undefined;
  storeName: string | null | undefined;
  amountMinor: number;
  transactionId: string;
  note?: string;
};

// Supermandi POS generates standard UPI intent QR.
// Payments go directly to retailer. Supermandi never handles funds.
export function buildUpiIntent(input: UpiIntentInput): string | null {
  if (!input) return null;
  const vpa = typeof input.upiVpa === "string" ? input.upiVpa.trim() : "";
  const transactionId = typeof input.transactionId === "string" ? input.transactionId.trim() : "";
  if (!vpa || !transactionId) return null;

  const name =
    typeof input.storeName === "string" && input.storeName.trim()
      ? input.storeName.trim()
      : "SuperMandi Store";

  const amountMinor = Number.isFinite(input.amountMinor) ? input.amountMinor : 0;
  const amountMajor = (Math.max(0, amountMinor) / 100).toFixed(2);
  const note = input.note ?? "Supermandi POS Sale";

  return (
    "upi://pay" +
    `?pa=${encodeURIComponent(vpa)}` +
    `&pn=${encodeURIComponent(name)}` +
    `&am=${amountMajor}` +
    "&cu=INR" +
    `&tr=${encodeURIComponent(transactionId)}` +
    `&tn=${encodeURIComponent(note)}`
  );
}
