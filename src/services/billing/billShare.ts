import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { BillSnapshot } from "./billTypes";
import { buildBillHtml } from "./billFormatter";

export async function generateBillPdf(snapshot: BillSnapshot): Promise<string> {
  const html = buildBillHtml(snapshot);
  const result = await Print.printToFileAsync({ html, base64: false });
  return result.uri;
}

export async function shareBillPdf(snapshot: BillSnapshot): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("sharing_unavailable");
  }

  const uri = await generateBillPdf(snapshot);
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: "Share SuperMandi bill"
  });
}
