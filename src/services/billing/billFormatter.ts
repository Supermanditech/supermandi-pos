import { formatMoney } from "../../utils/money";
import type { BillSnapshot } from "./billTypes";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildBillLines(snapshot: BillSnapshot): string[] {
  const currency = snapshot.currency || "INR";
  const lines = [
    "=================================",
    "       SuperMandi POS",
    "=================================",
    `Bill #: ${snapshot.billRef}`,
    `Date: ${new Date(snapshot.createdAt).toLocaleString()}`,
    `Payment: ${snapshot.paymentMode}`,
    "=================================",
    "ITEMS:"
  ];

  for (const item of snapshot.items) {
    const lineTotal = item.lineTotalMinor ?? item.priceMinor * item.quantity;
    lines.push(
      `${item.name}`,
      `  ${item.quantity} x ${formatMoney(item.priceMinor, currency)} = ${formatMoney(lineTotal, currency)}`
    );
  }

  lines.push(
    "=================================",
    `Subtotal: ${formatMoney(snapshot.subtotalMinor, currency)}`,
    `Discount: ${formatMoney(snapshot.discountMinor, currency)}`,
    `TOTAL: ${formatMoney(snapshot.totalMinor, currency)}`,
    "=================================",
    "Thank you for your business!",
    "================================="
  );

  return lines;
}

export function buildBillText(snapshot: BillSnapshot): string {
  return buildBillLines(snapshot).join("\n");
}

export function buildBillHtml(snapshot: BillSnapshot): string {
  const text = buildBillText(snapshot);
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: "Courier New", monospace; padding: 16px; }
          pre { font-size: 12px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <pre>${escapeHtml(text)}</pre>
      </body>
    </html>
  `;
}
