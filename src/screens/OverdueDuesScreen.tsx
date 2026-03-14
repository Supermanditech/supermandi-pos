// T-193: Collection/Dunning for Overdue DUE Payments
// Screen listing overdue DUE payments with color coding, WhatsApp reminder, and payment link

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
// STG-397: Safe area handling for notched phones
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { theme, useThemeColors, type ColorPalette } from "../theme";
import { formatMoney } from "../utils/money";
import { formatDate } from "../i18n/formatters";
import { apiClient } from "../services/api/apiClient";
import { BackHeader } from "../components/ui/BackHeader";
import EmptyState from "../components/ui/EmptyState";
import { asError } from "../utils/errorUtils";

// =============================================================================
// TYPES
// =============================================================================

// STG-139: Aligned to match backend response field names from overduePayments.ts
interface OverdueDue {
  id: string;         // backend returns 'id' (sale id)
  billRef: string;
  customerName: string;
  customerPhone: string;
  totalMinor: number;
  outstandingMinor: number;
  paidAmountMinor: number;
  dueDate: string | null; // ISO date
  daysOverdue: number | null;
  createdAt: string;
}

// STG-137: Backend returns 'overdues' key, not 'dues'
interface OverdueDuesResponse {
  overdues: OverdueDue[];
  totalCount: number;
  totalOutstandingMinor: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Get severity color based on days overdue */
function getSeverityColor(daysOverdue: number, colors: ColorPalette): string {
  if (daysOverdue > 30) return colors.error;    // red — Critical
  if (daysOverdue > 7) return colors.warning;    // orange — Overdue
  return colors.warning;                          // STG-320: warning/orange for Due Soon items approaching deadline
}

/** Get severity label key */
function getSeverityLabelKey(daysOverdue: number): string {
  if (daysOverdue > 30) return "overdueDues.severityCritical";
  if (daysOverdue > 7) return "overdueDues.severityOverdue";
  return "overdueDues.severityDueSoon";
}

/** Format DD/MM/YYYY for Indian locale */
function formatIndianDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "--";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// =============================================================================
// API
// =============================================================================

async function fetchOverdueDues(): Promise<OverdueDue[]> {
  const response = await apiClient.get<OverdueDuesResponse>(
    "/api/v1/pos/payments/overdue"
  );
  // STG-137: Backend returns 'overdues' key
  return response.overdues;
}

// =============================================================================
// COMPONENT
// =============================================================================

interface OverdueDuesScreenProps {
  onBack?: () => void;
  onNavigateToPayment?: (saleId: string) => void;
}

export default function OverdueDuesScreen({
  onBack,
  onNavigateToPayment,
}: OverdueDuesScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  // STG-397: Safe area insets for notched phones
  const insets = useSafeAreaInsets();

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContent: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing.xl,
    },
    loadingText: {
      marginTop: theme.spacing.md,
      fontSize: 14,
      color: colors.textSecondary,
    },
    errorText: {
      marginTop: theme.spacing.md,
      fontSize: 14,
      color: colors.error,
      textAlign: "center",
    },
    retryButton: {
      marginTop: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: theme.borderRadius.md,
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textInverse,
    },
    summaryBar: {
      flexDirection: "row",
      alignItems: "center",
      margin: theme.spacing.md,
      padding: theme.spacing.md,
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      ...theme.shadows.sm,
    },
    summaryItem: {
      flex: 1,
      alignItems: "center",
    },
    summaryDivider: {
      width: 1,
      height: 40,
      backgroundColor: colors.border,
    },
    summaryLabel: {
      fontSize: 12,
      color: colors.textTertiary,
      marginBottom: 4,
    },
    summaryValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.error,
    },
    listContent: {
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      ...theme.shadows.sm,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.md,
    },
    cardHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: theme.spacing.xs,
    },
    customerName: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
      flex: 1,
    },
    severityBadge: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 4,
      borderRadius: theme.borderRadius.full,
    },
    severityText: {
      fontSize: 12,
      fontWeight: "600",
    },
    cardDetails: {
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    detailLabel: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    detailValue: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.textPrimary,
    },
    detailValueBold: {
      fontSize: 15,
      fontWeight: "700",
    },
    reminderSent: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      marginBottom: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 4,
      backgroundColor: colors.successSoft,
      borderRadius: theme.borderRadius.sm,
    },
    reminderSentText: {
      fontSize: 12,
      color: colors.success,
      fontWeight: "500",
    },
    cardActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    reminderButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.successSoft,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      gap: theme.spacing.xs,
      borderWidth: 1,
      borderColor: colors.success + "30",
    },
    reminderButtonText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.success,
    },
    paymentButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      gap: theme.spacing.xs,
    },
    paymentButtonText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textInverse,
    },
  }), [colors]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dues, setDues] = useState<OverdueDue[]>([]);
  const [error, setError] = useState<string | null>(null);
  // T-193: Track reminder timestamps in local state
  const [reminderSentMap, setReminderSentMap] = useState<
    Record<string, string>
  >({});

  const loadDues = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchOverdueDues();
      // Sort by days overdue descending (oldest first)
      const sorted = [...data].sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
      setDues(sorted);
    } catch (_e: unknown) {
    const e = asError(_e);
      if (__DEV__) console.error("[OverdueDuesScreen] Failed to load overdue dues:", e);
      setError(e?.message || t("overdueDues.loadFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDues();
  }, [loadDues]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadDues();
  }, [loadDues]);

  // T-193: Generate and share WhatsApp reminder message
  const handleSendReminder = useCallback(
    async (due: OverdueDue) => {
      const storeName = "SuperMandi"; // fallback store name
      const amountStr = formatMoney(due.outstandingMinor);
      const dateStr = due.dueDate ? formatIndianDate(due.dueDate) : t("overdueDues.notAvailable");
      const message = t("overdueDues.whatsappReminderTemplate", { name: due.customerName, amount: amountStr, date: dateStr, storeName });

      // ISSUE-099: Normalize phone to 91XXXXXXXXXX format without double-prefix
      let phone = due.customerPhone.replace(/\D/g, "");
      if (phone.startsWith("0")) phone = phone.slice(1); // strip leading 0
      if (phone.length === 10) phone = `91${phone}`;
      else if (!phone.startsWith("91")) phone = `91${phone}`;
      const phoneNumber = `+${phone}`;
      const whatsappUrl = `whatsapp://send?phone=${encodeURIComponent(
        phoneNumber
      )}&text=${encodeURIComponent(message)}`;

      try {
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (canOpen) {
          await Linking.openURL(whatsappUrl);
        } else {
          // Fallback to native share
          await Share.share({ message });
        }

        // Track reminder sent at
        setReminderSentMap((prev) => ({
          ...prev,
          [due.id]: new Date().toISOString(),
        }));
      } catch (e) {
        if (__DEV__) console.error("[OverdueDuesScreen] Share failed:", e);
        // Fallback to share API
        try {
          await Share.share({ message });
          setReminderSentMap((prev) => ({
            ...prev,
            [due.id]: new Date().toISOString(),
          }));
        } catch {
          Alert.alert(t("common.error"), t("overdueDues.reminderFailed"));
        }
      }
    },
    []
  );

  const handleRecordPayment = useCallback(
    (due: OverdueDue) => {
      if (onNavigateToPayment) {
        // STG-139: Backend returns 'id' which is the sale ID
        onNavigateToPayment(due.id);
      } else {
        Alert.alert(t("overdueDues.recordPayment"), t("overdueDues.navigateToPayment"));
      }
    },
    [onNavigateToPayment]
  );

  // STG-139: Use outstandingMinor instead of amountMinor
  const totalOverdue = dues.reduce((sum, d) => sum + d.outstandingMinor, 0);

  const renderDueItem = useCallback(
    ({ item }: { item: OverdueDue }) => {
      // STG-139: daysOverdue can be null if no due_date set
      const daysOverdue = item.daysOverdue ?? 0;
      const severityColor = getSeverityColor(daysOverdue, colors);
      const severityLabel = t(getSeverityLabelKey(daysOverdue));
      const reminderSent = reminderSentMap[item.id];

      return (
        <View style={styles.card}>
          {/* Header row */}
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <MaterialCommunityIcons
                name="account-outline"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.customerName} numberOfLines={1}>
                {item.customerName}
              </Text>
            </View>
            <View
              style={[
                styles.severityBadge,
                { backgroundColor: severityColor + "20" },
              ]}
            >
              <Text style={[styles.severityText, { color: severityColor }]}>
                {severityLabel}
              </Text>
            </View>
          </View>

          {/* Details */}
          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("overdueDues.phone")}</Text>
              <Text style={styles.detailValue}>+91 {item.customerPhone}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("overdueDues.billNumber")}</Text>
              <Text style={styles.detailValue}>{item.billRef}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("overdueDues.outstanding")}</Text>
              <Text style={[styles.detailValueBold, { color: severityColor }]}>
                {formatMoney(item.outstandingMinor)}
              </Text>
            </View>
            {item.dueDate && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t("overdueDues.dueDate")}</Text>
                <Text style={styles.detailValue}>
                  {formatIndianDate(item.dueDate)}
                </Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("overdueDues.daysOverdue")}</Text>
              <Text style={[styles.detailValueBold, { color: severityColor }]}>
                {t("overdueDues.daysCount", { count: daysOverdue })}
              </Text>
            </View>
          </View>

          {/* Reminder status */}
          {reminderSent && (
            <View style={styles.reminderSent}>
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={14}
                color={colors.success}
              />
              <Text style={styles.reminderSentText}>
                {t("overdueDues.reminderSent", { date: formatDate(reminderSent, "short") })}
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.cardActions}>
            <Pressable
              accessibilityRole="button"
              style={styles.reminderButton}
              onPress={() => handleSendReminder(item)}
            >
              <MaterialCommunityIcons
                name="whatsapp"
                size={16}
                color={colors.success}
              />
              <Text style={styles.reminderButtonText}>{t("overdueDues.sendReminder")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.paymentButton}
              onPress={() => handleRecordPayment(item)}
            >
              <MaterialCommunityIcons
                name="cash-register"
                size={16}
                color={colors.textInverse}
              />
              <Text style={styles.paymentButtonText}>{t("overdueDues.recordPayment")}</Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [handleSendReminder, handleRecordPayment, reminderSentMap]
  );

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <BackHeader title={t("overdueDues.title")} onBack={onBack} />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t("overdueDues.loading")}</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <BackHeader title={t("overdueDues.title")} onBack={onBack} />
        <View style={styles.centerContent}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={colors.error}
          />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => { setLoading(true); void loadDues(); }}>
            <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <BackHeader title={t("overdueDues.title")} onBack={onBack} />

      {/* Summary bar */}
      {dues.length > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t("overdueDues.totalOverdue")}</Text>
            <Text style={styles.summaryValue}>{formatMoney(totalOverdue)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t("overdueDues.customers")}</Text>
            <Text style={styles.summaryValue}>{dues.length}</Text>
          </View>
        </View>
      )}

      {/* Content */}
      {dues.length === 0 ? (
        <EmptyState
          icon="check-circle-outline"
          title={t("overdueDues.noOverdueDues")}
          description={t("overdueDues.allPaymentsUpToDate")}
        />
      ) : (
        <FlatList
          data={dues}
          keyExtractor={(item) => item.id}
          renderItem={renderDueItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

