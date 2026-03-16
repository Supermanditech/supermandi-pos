import { Linking } from "react-native";
import { showToast } from "../../utils/showToast";
import type { PurchaseCartItem } from "../../components/v3/PurchaseCartSummaryV3";

// STG-566: Generate and send purchase order via WhatsApp to supplier
// Formats items into a clean text message with totals, opens WhatsApp deep link

export interface PurchaseOrderParams {
  supplierName: string;
  supplierPhone?: string;
  invoiceRef: string;
  items: PurchaseCartItem[];
  storeName: string;
}

export function formatPurchaseOrder(params: PurchaseOrderParams): string {
  const { supplierName, invoiceRef, items, storeName } = params;
  const lines: string[] = [
    `*Purchase Order*`,
    `From: ${storeName}`,
    `To: ${supplierName}`,
    `Ref: ${invoiceRef}`,
    `Date: ${new Date().toLocaleDateString("en-IN")}`,
    ``,
    `*Items:*`,
  ];

  let subtotal = 0;
  items.forEach((item, i) => {
    const units = item.qtyCases * item.caseSize;
    const lineTotal = units * item.ptrMinor;
    subtotal += lineTotal;
    lines.push(`${i + 1}. ${item.name}`);
    lines.push(`   ${item.qtyCases} case${item.qtyCases > 1 ? "s" : ""} × ${item.caseSize} ${item.unit} = ${units} ${item.unit}`);
    lines.push(`   ₹${(item.ptrMinor / 100).toFixed(2)}/unit · Total: ₹${Math.round(lineTotal / 100).toLocaleString("en-IN")}`);
  });

  const gst = items.reduce((s, i) => {
    const taxable = i.qtyCases * i.caseSize * i.ptrMinor;
    return s + Math.round(taxable * i.gstPct / 100);
  }, 0);

  lines.push(``);
  lines.push(`*Subtotal:* ₹${Math.round(subtotal / 100).toLocaleString("en-IN")}`);
  if (gst > 0) lines.push(`*GST:* ₹${Math.round(gst / 100).toLocaleString("en-IN")}`);
  lines.push(`*Grand Total:* ₹${Math.round((subtotal + gst) / 100).toLocaleString("en-IN")}`);
  lines.push(``);
  lines.push(`— Sent from SuperMandi POS`);

  return lines.join("\n");
}

export async function sendPurchaseOrderWhatsApp(params: PurchaseOrderParams): Promise<boolean> {
  const message = formatPurchaseOrder(params);
  const encoded = encodeURIComponent(message);

  const phoneParam = params.supplierPhone ? `phone=91${params.supplierPhone.replace(/\D/g, "").slice(-10)}&` : "";
  const url = `whatsapp://send?${phoneParam}text=${encoded}`;

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      showToast("WhatsApp not installed");
      return false;
    }
    await Linking.openURL(url);
    showToast("Order sent on WhatsApp");
    return true;
  } catch {
    showToast("Failed to open WhatsApp");
    return false;
  }
}
