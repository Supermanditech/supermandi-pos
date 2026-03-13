import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useTranslation } from "react-i18next";
import { fetchBillSnapshot } from "../services/api/billingApi";
import type { BillSnapshot } from "../services/billing/billTypes";
import { buildBillText } from "../services/billing/billFormatter";
import { shareBillPdf, shareBillWhatsApp } from "../services/billing/billShare";
import { printerService } from "../services/printerService";
import { formatMoney } from "../utils/money";
import { formatDateTime } from "../i18n/formatters";
import { theme, useThemeColors } from "../theme";
// T-122: Standardized back header
import { BackHeader } from "../components/ui/BackHeader";
import { asError } from "../utils/errorUtils";

type RootStackParamList = {
  BillDetail: { saleId: string; billRef?: string };
};

type Nav = NativeStackNavigationProp<RootStackParamList, "BillDetail">;
type Rt = RouteProp<RootStackParamList, "BillDetail">;

export default function BillDetailScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { saleId, billRef } = route.params;

  const [snapshot, setSnapshot] = useState<BillSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
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
          setError(t("billDetail.billNotFound"));
          setSnapshot(null);
          return;
        }
        setSnapshot(result);
      } catch (_e: unknown) {
    const e = asError(_e);
        if (!active) return;
        setError(e?.message ? String(e.message) : t("billDetail.loadFailed"));
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
        Alert.alert(t("billDetail.shareUnavailableTitle"), t("billDetail.shareUnavailableMessage"));
      } else {
        Alert.alert(t("billDetail.shareFailedTitle"), t("billDetail.shareFailedMessage"));
      }
    } finally {
      setSharing(false);
    }
  };

  // GO-LIVE-246: Add confirmation before reprint
  const handlePrint = () => {
    if (!snapshot || printing) return;
    Alert.alert(
      t("billDetail.reprintTitle"),
      t("billDetail.reprintMessage"),
      [
        { text: t("billDetail.cancel"), style: "cancel" },
        {
          text: t("billDetail.print"),
          onPress: async () => {
            setPrinting(true);
            try {
              await printerService.printReceipt(buildBillText(snapshot));
              Alert.alert(t("billDetail.printQueued"), t("billDetail.printQueuedMessage"));
            } catch (_e: unknown) {
    const e = asError(_e);
              const message = e?.message ? String(e.message) : "print_failed";
              if (message.toLowerCase().includes("paper")) {
                Alert.alert(t("billDetail.printerErrorTitle"), t("billDetail.printerOutOfPaper"));
              } else if (message.toLowerCase().includes("connected")) {
                Alert.alert(t("billDetail.printerErrorTitle"), t("billDetail.printerNotConnected"));
              } else {
                Alert.alert(t("billDetail.printFailedTitle"), t("billDetail.printFailedMessage"));
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
        Alert.alert(t("billDetail.whatsappNotFoundTitle"), t("billDetail.whatsappNotFoundMessage"));
      } else {
        Alert.alert(t("billDetail.shareFailedTitle"), t("billDetail.whatsappFailedMessage"));
      }
    } finally {
      setWhatsapping(false);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
      color: colors.primary,
      fontWeight: "700",
    },
    headerSpacer: {
      width: 48,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
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
      color: colors.textSecondary,
    },
    summaryValue: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    summaryMeta: {
      marginTop: 4,
      fontSize: 12,
      color: colors.textSecondary,
    },
    listContent: {
      paddingBottom: 24,
      gap: 12,
    },
    itemRow: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
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
      color: colors.textPrimary,
    },
    itemMeta: {
      marginTop: 2,
      fontSize: 12,
      color: colors.textSecondary,
    },
    itemTotals: {
      alignItems: "flex-end",
      gap: 2,
    },
    itemTotal: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.primaryDark,
    },
    itemUnit: {
      fontSize: 11,
      color: colors.textSecondary,
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
      borderColor: colors.border,
    },
    actionSecondary: {
      backgroundColor: colors.surfaceAlt,
    },
    actionPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    actionWhatsApp: {
      backgroundColor: colors.whatsapp,
      borderColor: colors.whatsapp,
    },
    actionButtonDisabled: {
      opacity: 0.6,
    },
    actionText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    actionTextPrimary: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textInverse,
    },
    totalsCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 6,
    },
    totalRow: {
      marginTop: 4,
    },
    totalLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    totalValue: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.primaryDark,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    loadingText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    error: {
      color: colors.error,
    },
  }), [colors]);

  const header = snapshot ? (
    <View style={styles.summaryCard}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{t("billDetail.billRef")}</Text>
        <Text style={styles.summaryValue}>{snapshot.billRef || billRef || "--"}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{t("billDetail.status")}</Text>
        <Text style={styles.summaryValue}>{snapshot.status || snapshot.paymentMode}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{t("billDetail.payment")}</Text>
        <Text style={styles.summaryValue}>{snapshot.paymentMode}</Text>
      </View>
      <Text style={styles.summaryMeta}>{formatDateTime(new Date(snapshot.createdAt))}</Text>
    </View>
  ) : null;

  const footer = snapshot ? (
    <View style={styles.footer}>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          style={[styles.actionButton, styles.actionSecondary, printing && styles.actionButtonDisabled]}
          onPress={handlePrint}
          disabled={printing}
        >
          <MaterialCommunityIcons name="printer-outline" size={18} color={colors.primary} />
          <Text style={styles.actionText}>{printing ? "..." : t("billDetail.print")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.actionButton, styles.actionWhatsApp, whatsapping && styles.actionButtonDisabled]}
          onPress={handleWhatsApp}
          disabled={whatsapping}
        >
          <MaterialCommunityIcons name="whatsapp" size={18} color={colors.textInverse} />
          <Text style={styles.actionTextPrimary}>{whatsapping ? "..." : t("billDetail.whatsapp")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.actionButton, styles.actionPrimary, sharing && styles.actionButtonDisabled]}
          onPress={handleShare}
          disabled={sharing}
        >
          <MaterialCommunityIcons name="share-variant" size={18} color={colors.textInverse} />
          <Text style={styles.actionTextPrimary}>{sharing ? "..." : t("billDetail.share")}</Text>
        </Pressable>
      </View>

      <View style={styles.totalsCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{t("billDetail.subtotal")}</Text>
          <Text style={styles.summaryValue}>
            {formatMoney(snapshot.subtotalMinor, snapshot.currency)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{t("billDetail.discount")}</Text>
          <Text style={styles.summaryValue}>
            {formatMoney(snapshot.discountMinor, snapshot.currency)}
          </Text>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>{t("billDetail.total")}</Text>
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
      <BackHeader title={t("billDetail.title")} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{t("billDetail.loading")}</Text>
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
                  {item.barcode ?? t("billDetail.noBarcode")} - {t("billDetail.qty")} {item.quantity}
                </Text>
              </View>
              <View style={styles.itemTotals}>
                <Text style={styles.itemTotal}>
                  {formatMoney(item.lineTotalMinor, snapshot.currency)}
                </Text>
                <Text style={styles.itemUnit}>
                  {formatMoney(item.priceMinor, snapshot.currency)} {t("billDetail.each")}
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
