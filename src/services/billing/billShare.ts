import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Share, Platform, Linking } from "react-native";
import type { BillSnapshot } from "./billTypes";
import { buildBillHtml, buildBillText } from "./billFormatter";

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

export async function shareBillText(snapshot: BillSnapshot): Promise<void> {
  const text = buildBillText(snapshot);
  await Share.share({
    message: text,
    title: `SuperMandi Bill ${snapshot.billRef}`
  });
}

export async function shareBillWhatsApp(snapshot: BillSnapshot, phone?: string): Promise<void> {
  const text = buildBillText(snapshot);
  const encodedText = encodeURIComponent(text);

  let url: string;
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, "");
    url = `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`;
  } else {
    url = `whatsapp://send?text=${encodedText}`;
  }

  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error("whatsapp_not_installed");
  }

  await Linking.openURL(url);
}
