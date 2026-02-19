import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fetchBillSnapshot } from "../services/api/billingApi";
import type { BillSnapshot } from "../services/billing/billTypes";
import { buildBillText } from "../services/billing/billFormatter";
import { shareBillPdf, shareBillWhatsApp } from "../services/billing/billShare";
import { printerService } from "../services/printerService";
import { formatMoney } from "../utils/money";
import { formatDateTime } from "../i18n/formatters";
import { theme } from "../theme";
// T-122: Standardized back header
import { BackHeader } from "../components/ui/BackHeader";
import { asError } from "../utils/errorUtils";

type RootStackParamList = {
  BillDetail: { saleId: string; billRef?: string };
};

type Nav = NativeStackNavigationProp<RootStackParamList, "BillDetail">;
type Rt = RouteProp<RootStackParamList, "BillDetail">;

export default function BillDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { saleId, billRef } = route.params;

  const [snapshot, setSnapshot] = useState<BillSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [whatsapping, setWhatsapping] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchBillSnapshot(saleId);
        if (!active) return;
        if (!result) {
          setError("Bill not found.");
          setSnapshot(null);
          return;
        }
        setSnapshot(result);
      } catch (_e: unknown) {
    const e = asError(_e);
        if (!active) return;
        setError(e?.message ? String(e.message) : "Failed to load bill.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [saleId]);

  const handleShare = async () => {
    if (!snapshot || sharing) return;
    setSharing(true);
    try {
      await shareBillPdf(snapshot);
    } catch (_e: unknown) {
    const e = asError(_e);
      const message = e?.message ? String(e.message) : "share_failed";
      if (message === "sharing_unavailable") {
        Alert.alert("Share unavailable", "Sharing is not available on this device.");
      } else {
        Alert.alert("Share failed", "Unable to share this bill.");
      }
    } finally {
      setSharing(false);
    }
  };

  // GO-LIVE-246: Add confirmation before reprint
  const handlePrint = () => {
    if (!snapshot || printing) return;
    Alert.alert(
      "Reprint Bill",
      "Are you sure you want to reprint this bill?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Print",
          onPress: async () => {
            setPrinting(true);
            try {
              await printerService.printReceipt(buildBillText(snapshot));
              Alert.alert("Print queued", "Bill sent to printer.");
            } catch (_e: unknown) {
    const e = asError(_e);
              const message = e?.message ? String(e.message) : "print_failed";
              if (message.toLowerCase().includes("paper")) {
                Alert.alert("Printer error", "Printer is out of paper.");
              } else if (message.toLowerCase().includes("connected")) {
                Alert.alert("Printer error", "Printer not connected.");
              } else {
                Alert.alert("Print failed", "Unable to print this bill.");
              }
            } finally {
              setPrinting(false);
            }
          },
        },
      ]
    );
  };

  const handleWhatsApp = async () => {
    if (!snapshot || whatsapping) return;
    setWhatsapping(true);
    try {
      await shareBillWhatsApp(snapshot);
    } catch (_e: unknown) {
    const e = asError(_e);
      const message = e?.message ? String(e.message) : "whatsapp_failed";
      if (message === "whatsapp_not_installed") {
        Alert.alert("WhatsApp not found", "Please install WhatsApp to share bills.");
      } else {
        Alert.alert("Share failed", "Unable to share via WhatsApp.");
      }
    } finally {
      setWhatsapping(false);
    }
  };

  const header = snapshot ? (
    <View style={styles.summaryCard}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Bill Ref</Text>
        <Text style={styles.summaryValue}>{snapshot.billRef || billRef || "--"}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Status</Text>
        <Text style={styles.summaryValue}>{snapshot.status || snapshot.paymentMode}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Payment</Text>
        <Text style={styles.summaryValue}>{snapshot.paymentMode}</Text>
      </View>
      <Text style={styles.summaryMeta}>{formatDateTime(new Date(snapshot.createdAt))}</Text>
    </View>
  ) : null;

  const footer = snapshot ? (
    <View style={styles.footer}>
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionButton, styles.actionSecondary, printing && styles.actionButtonDisabled]}
          onPress={handlePrint}
          disabled={printing}
        >
          <MaterialCommunityIcons name="printer-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.actionText}>{printing ? "..." : "Print"}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.actionWhatsApp, whatsapping && styles.actionButtonDisabled]}
          onPress={handleWhatsApp}
          disabled={whatsapping}
        >
          <MaterialCommunityIcons name="whatsapp" size={18} color={theme.colors.textInverse} />
          <Text style={styles.actionTextPrimary}>{whatsapping ? "..." : "WhatsApp"}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.actionPrimary, sharing && styles.actionButtonDisabled]}
          onPress={handleShare}
          disabled={sharing}
        >
          <MaterialCommunityIcons name="share-variant" size={18} color={theme.colors.textInverse} />
          <Text style={styles.actionTextPrimary}>{sharing ? "..." : "Share"}</Text>
        </Pressable>
      </View>

      <View style={styles.totalsCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>
            {formatMoney(snapshot.subtotalMinor, snapshot.currency)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Discount</Text>
          <Text style={styles.summaryValue}>
            {formatMoney(snapshot.discountMinor, snapshot.currency)}
          </Text>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {formatMoney(snapshot.totalMinor, snapshot.currency)}
          </Text>
        </View>
      </View>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      {/* T-122: Standardized back header with Android BackHandler */}
      <BackHeader title="Bill Details" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : snapshot ? (
        <FlatList
          data={snapshot.items}
          keyExtractor={(item) => item.variantId ?? `${item.name}-${item.barcode ?? "na"}`}
          renderItem={({ item }) => (
            <View style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>
                  {item.barcode ?? "No barcode"} - Qty {item.quantity}
                </Text>
              </View>
              <View style={styles.itemTotals}>
                <Text style={styles.itemTotal}>
                  {formatMoney(item.lineTotalMinor, snapshot.currency)}
                </Text>
                <Text style={styles.itemUnit}>
                  {formatMoney(item.priceMinor, snapshot.currency)} each
                </Text>
              </View>
            </View>
          )}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          contentContainerStyle={styles.listContent}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 48,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  summaryMeta: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  listContent: {
    paddingBottom: 24,
    gap: 12,
  },
  itemRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemInfo: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  itemMeta: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  itemTotals: {
    alignItems: "flex-end",
    gap: 2,
  },
  itemTotal: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primaryDark,
  },
  itemUnit: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  footer: {
    gap: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionSecondary: {
    backgroundColor: theme.colors.surfaceAlt,
  },
  actionPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  actionWhatsApp: {
    backgroundColor: "#25D366",
    borderColor: "#25D366",
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  actionTextPrimary: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  totalsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 6,
  },
  totalRow: {
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.primaryDark,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  error: {
    color: theme.colors.error,
  },
});
