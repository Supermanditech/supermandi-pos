import React, { useMemo, useState, useEffect } from "react";
import { View, Pressable, ScrollView, StyleSheet, Text, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";
import { printerService } from "../../services/printerService";
import { apiClient } from "../../services/api/apiClient";
import { isOnline } from "../../services/networkStatus";
import AsyncStorage from "@react-native-async-storage/async-storage";

// V3-067: Bill detail sub-screen — view bill items, reprint, WhatsApp share

type BillItem = { name: string; qty: number; priceMinor: number };

type Props = {
  saleId?: string;  // GCP-STG-0361: needed for invoice PDF download
  billRef: string;
  date: string;
  method: string;
  totalMinor: number;
  items: BillItem[];
  onClose: () => void;
};

export default function BillDetailScreenV3({ saleId, billRef, date, method, totalMinor, items, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const total = Math.round(totalMinor / 100);
  const [printing, setPrinting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // GCP-STG-0729: Check AsyncStorage cache for offline invoice metadata
  const [cachedMeta, setCachedMeta] = useState<{ createdAt?: string; paymentMethod?: string } | null>(null);
  useEffect(() => {
    if (!saleId) return;
    AsyncStorage.getItem(`invoice:${saleId}`).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        // Check TTL
        if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
          AsyncStorage.removeItem(`invoice:${saleId}`).catch(() => {});
          return;
        }
        setCachedMeta(parsed);
      } catch { /* ignore parse errors */ }
    }).catch(() => {});
  }, [saleId]);

  // GCP-STG-0361: Download invoice PDF
  const handleDownloadInvoice = async () => {
    if (!saleId) { showToast("Sale ID unavailable"); return; }
    const online = await isOnline();
    if (!online) { showToast("Offline — cannot download invoice"); return; }
    setDownloadingPdf(true);
    try {
      const baseUrl = (apiClient as any).baseUrl || (apiClient as any).baseURL || "";
      const token = (apiClient as any).token || "";
      const url = `${baseUrl}/api/v1/pos/sales/${saleId}/invoice/pdf`;
      if (Platform.OS === "web") {
        // Web: open in new tab
        window.open(url, "_blank");
      } else {
        // Mobile: use Linking to open the PDF URL (device browser / PDF viewer)
        await Linking.openURL(url);
      }
      showToast("Invoice PDF opened");
    } catch {
      showToast("Could not download invoice");
    }
    setDownloadingPdf(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable>
        <Text style={styles.headerTitle}>Bill Details</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.billCard}>
          <Text style={styles.billRef}>{billRef}</Text>
          <Text style={styles.billDate}>{date}</Text>
          <Text style={styles.billMethod}>{method}</Text>
        </View>

        <View style={styles.itemsSection}>
          <Text style={styles.sectionTitle}>ITEMS</Text>
          {/* GCP-STG-0430: Empty state when items array is empty */}
          {items.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 32 }}>
              <Text style={{ fontSize: 32, color: colors.textTertiary, marginBottom: 8 }}>📋</Text>
              <Text style={{ fontSize: 14, color: colors.textTertiary, fontWeight: "500" }}>Items not available offline</Text>
            </View>
          ) : items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemQty}>×{item.qty}</Text>
              <Text style={styles.itemPrice}>₹{Math.round(item.priceMinor * item.qty / 100)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>₹{total.toLocaleString("en-IN")}</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable style={[styles.printBtn, printing && { opacity: 0.5 }]} disabled={printing} onPress={async () => {
          setPrinting(true);
          try {
            await printerService.printReceipt(`Bill: ${billRef}\nTotal: ₹${total}`);
            showToast("Receipt printed");
          } catch { showToast("Print failed"); }
          setPrinting(false);
        }}>
          <Text style={styles.printText}>{printing ? "Printing..." : "🖨️ Reprint"}</Text>
        </Pressable>
        {/* GCP-STG-0361: Invoice PDF download button */}
        <Pressable
          style={[styles.invoiceBtn, downloadingPdf && { opacity: 0.5 }]}
          disabled={downloadingPdf || !saleId}
          onPress={handleDownloadInvoice}
          testID="invoice-pdf-btn"
        >
          <Text style={styles.invoiceText}>{downloadingPdf ? "Loading..." : "Invoice PDF"}</Text>
        </Pressable>
        <Pressable style={styles.waBtn} onPress={() => {
          const msg = encodeURIComponent(`*Bill: ${billRef}*\n${method}\n${items.length} items\n*Total: ₹${total.toLocaleString("en-IN")}*\n\nThank you!\n— SuperMandi POS`);
          Linking.openURL(`whatsapp://send?text=${msg}`).catch(() => showToast("WhatsApp not installed"));
        }}>
          <Text style={styles.waText}>WhatsApp</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    body: { flex: 1, padding: 14 },
    billCard: { padding: 18, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center", marginBottom: 14 },
    billRef: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
    billDate: { fontSize: 12, color: colors.textTertiary, marginTop: 4 },
    billMethod: { fontSize: 11, fontWeight: "700", color: colors.primary, marginTop: 4, backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 6 },
    itemsSection: { marginBottom: 14 },
    sectionTitle: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.5, marginBottom: 8 },
    itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    itemName: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    itemQty: { fontSize: 13, color: colors.textTertiary, width: 40, textAlign: "center" },
    itemPrice: { fontSize: 14, fontWeight: "700", width: 60, textAlign: "right" },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 2, borderTopColor: colors.textPrimary },
    totalLabel: { fontSize: 18, fontWeight: "900" },
    totalValue: { fontSize: 18, fontWeight: "900" },
    footer: { flexDirection: "row", gap: 8, padding: 14 },
    printBtn: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    printText: { fontSize: 14, fontWeight: "700", color: colors.primary },
    invoiceBtn: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: "#E65100", alignItems: "center" },
    invoiceText: { fontSize: 14, fontWeight: "700", color: "#fff" },
    waBtn: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: "#25D366", alignItems: "center" },
    waText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  });
}
