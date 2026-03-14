// T-192: Shift Management Screen
// Current shift info, start/end shift flows, shift history
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useTranslation } from "react-i18next";
import { theme, useThemeColors } from "../theme";
import { formatMoney } from "../utils/money";
import { useShiftStore } from "../stores/shiftStore";
import { useStaffSessionStore } from "../stores/staffSessionStore";
import type { Shift } from "../services/shiftService";
import { BackHeader } from "../components/ui/BackHeader";
import EmptyState from "../components/ui/EmptyState";

// =============================================================================
// HELPERS
// =============================================================================

function formatDateDDMMYYYY(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "--";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatTime12h(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "--";
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

function calculateDuration(startStr: string, endStr?: string | null): string {
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : new Date();
  if (isNaN(start.getTime())) return "--";
  const diffMs = end.getTime() - start.getTime();
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

// =============================================================================
// COMPONENT
// =============================================================================

type TabView = "CURRENT" | "HISTORY";

interface ShiftScreenProps {
  onBack?: () => void;
}

export default function ShiftScreen({ onBack }: ShiftScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const {
    currentShift,
    history,
    loading,
    historyLoading,
    starting,
    ending,
    error,
    fetchCurrentShift,
    fetchHistory,
    startShift,
    endShift,
    clearError,
  } = useShiftStore();

  const staffSession = useStaffSessionStore((s) => s.session);

  const [activeTab, setActiveTab] = useState<TabView>("CURRENT");
  const [refreshing, setRefreshing] = useState(false);

  // POS-035: Live duration ticker — re-render every 60s while shift is active
  const [, setTick] = useState(0);
  // ISSUE-112: Android hardware back button support
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack?.();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  useEffect(() => {
    if (!currentShift) return;
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, [currentShift]);

  // Start shift state
  const [openingCash, setOpeningCash] = useState("");

  // End shift state
  const [closingCash, setClosingCash] = useState("");
  const [endNotes, setEndNotes] = useState("");

  // UIUX-POS-003: All deps that are read inside the callback must be listed
  useEffect(() => {
    void fetchCurrentShift();
  }, [fetchCurrentShift]);

  useEffect(() => {
    if (activeTab === "HISTORY") {
      void fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  useEffect(() => {
    if (error) {
      Alert.alert(t("shift.errorTitle"), error);
      clearError();
    }
  }, [error, clearError]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    const promise =
      activeTab === "CURRENT" ? fetchCurrentShift() : fetchHistory();
    promise.finally(() => setRefreshing(false));
  }, [activeTab, fetchCurrentShift, fetchHistory]);

  // UIUX-POS-022: Confirm before starting shift (records opening cash + timestamp)
  const handleStartShift = useCallback(() => {
    const cashStr = openingCash.trim();
    const openingCashMinor = Math.round(parseFloat(cashStr) * 100);
    if (!cashStr || isNaN(openingCashMinor) || openingCashMinor < 0) {
      Alert.alert(t("shift.invalidAmount"), t("shift.enterOpeningCash"));
      return;
    }
    Alert.alert(
      t("shift.startShiftTitle"),
      t("shift.startShiftConfirm", { amount: `\u20B9${(openingCashMinor / 100).toFixed(2)}` }),
      [
        { text: t("shift.cancel"), style: "cancel" },
        {
          text: t("shift.start"),
          onPress: async () => {
            const success = await startShift({ openingCashMinor });
            if (success) {
              setOpeningCash("");
              Alert.alert(t("shift.shiftStarted"), t("shift.shiftStartedMessage"));
            }
          },
        },
      ]
    );
  }, [openingCash, startShift]);

  const handleEndShift = useCallback(async () => {
    if (!currentShift) return;
    const cashStr = closingCash.trim();
    const closingCashMinor = Math.round(parseFloat(cashStr) * 100);
    if (!cashStr || isNaN(closingCashMinor) || closingCashMinor < 0) {
      Alert.alert(t("shift.invalidAmount"), t("shift.enterValidClosingCash"));
      return;
    }

    // ISSUE-105: Warn on zero closing cash — likely a mistake
    const confirmMessage = closingCashMinor === 0
      ? t("shift.zeroCashWarning")
      : t("shift.endShiftConfirm");

    Alert.alert(
      t("shift.endShiftTitle"),
      confirmMessage,
      [
        { text: t("shift.cancel"), style: "cancel" },
        {
          text: t("shift.endShiftButton"),
          style: "destructive",
          onPress: async () => {
            const success = await endShift({
              closingCashMinor,
              notes: endNotes.trim() || undefined,
            });
            if (success) {
              setClosingCash("");
              setEndNotes("");
              Alert.alert(t("shift.shiftEnded"), t("shift.shiftEndedMessage"));
            }
          },
        },
      ]
    );
  }, [currentShift, closingCash, endNotes, endShift]);

  // Calculate variance for end shift
  const endVarianceMinor = currentShift?.expectedCashMinor
    ? Math.round(parseFloat(closingCash || "0") * 100) - currentShift.expectedCashMinor
    : 0;
  const hasValidClosingCash = closingCash.trim().length > 0 && !isNaN(parseFloat(closingCash));

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContent: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: theme.spacing.xl,
    },
    loadingText: {
      marginTop: theme.spacing.md,
      fontSize: 14,
      color: colors.textSecondary,
    },
    tabRow: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: theme.spacing.md,
      alignItems: "center",
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabActive: {
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textTertiary,
    },
    tabTextActive: {
      color: colors.primary,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
    },
    // Active shift styles
    activeShiftCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      borderLeftWidth: 4,
      borderLeftColor: colors.success,
      ...theme.shadows.sm,
    },
    activeShiftHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    activeShiftDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.success,
    },
    activeShiftTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.success,
      textTransform: "uppercase",
    },
    shiftInfoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: 4,
    },
    shiftInfoText: {
      fontSize: 14,
      color: colors.textPrimary,
    },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      ...theme.shadows.sm,
    },
    summaryTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
      marginBottom: theme.spacing.md,
    },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 6,
    },
    summaryRowIcon: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    summaryLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    summaryValue: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    summaryValueLarge: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.primaryDark,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: theme.spacing.sm,
    },
    // End shift form
    endShiftCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      borderTopWidth: 3,
      borderTopColor: colors.error,
      ...theme.shadows.sm,
    },
    endShiftTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.error,
      textTransform: "uppercase",
      marginBottom: theme.spacing.md,
    },
    formLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: theme.spacing.xs,
      marginTop: theme.spacing.md,
    },
    formInput: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      fontSize: 15,
      color: colors.textPrimary,
    },
    formTextArea: {
      minHeight: 80,
      textAlignVertical: "top",
    },
    cashInputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
    },
    cashInputPrefix: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textSecondary,
      marginRight: theme.spacing.sm,
    },
    cashInput: {
      flex: 1,
      fontSize: 20,
      fontWeight: "600",
      color: colors.textPrimary,
      paddingVertical: theme.spacing.md,
    },
    varianceBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
      padding: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
    },
    varianceText: {
      fontSize: 13,
      fontWeight: "600",
    },
    endShiftButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      backgroundColor: colors.error,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      marginTop: theme.spacing.lg,
    },
    endShiftButtonDisabled: {
      opacity: 0.6,
    },
    endShiftButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textInverse,
    },
    // Start shift styles
    startShiftContainer: {
      flex: 1,
      justifyContent: "center",
      paddingVertical: theme.spacing.xl,
    },
    startShiftCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      alignItems: "center",
      ...theme.shadows.sm,
    },
    startShiftTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
      marginTop: theme.spacing.md,
    },
    startShiftSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: theme.spacing.xs,
      marginBottom: theme.spacing.md,
    },
    startShiftButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.xl,
      borderRadius: theme.borderRadius.md,
      marginTop: theme.spacing.lg,
      width: "100%",
    },
    startShiftButtonDisabled: {
      opacity: 0.6,
    },
    startShiftButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textInverse,
    },
    // History styles
    historyCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      ...theme.shadows.sm,
    },
    historyHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.md,
    },
    historyStaffName: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    historyDate: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    historyBadge: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 4,
      borderRadius: theme.borderRadius.full,
    },
    historyBadgeText: {
      fontSize: 11,
      fontWeight: "700",
    },
    historyDetails: {
      gap: 4,
    },
    historyRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 4,
    },
    historyLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    historyValue: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    historyNotes: {
      fontSize: 12,
      color: colors.textTertiary,
      fontStyle: "italic",
      marginTop: theme.spacing.sm,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  }), [colors]);

  // Render shift history item
  const renderHistoryItem = useCallback((shift: Shift) => {
    const isMatch = shift.varianceMinor === 0;
    const varianceColor =
      shift.varianceMinor === null
        ? colors.textTertiary
        : isMatch
          ? colors.success
          : colors.error;

    return (
      <View key={shift.id} style={styles.historyCard}>
        <View style={styles.historyHeader}>
          <View>
            <Text style={styles.historyStaffName}>{shift.staffName}</Text>
            <Text style={styles.historyDate}>{formatDateDDMMYYYY(shift.startedAt)}</Text>
          </View>
          <View style={[styles.historyBadge, { backgroundColor: varianceColor + "15" }]}>
            <Text style={[styles.historyBadgeText, { color: varianceColor }]}>
              {shift.status === "ACTIVE" ? t("shift.active") : isMatch ? t("shift.match") : t("shift.mismatch")}
            </Text>
          </View>
        </View>

        <View style={styles.historyDetails}>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>{t("shift.time")}</Text>
            <Text style={styles.historyValue}>
              {formatTime12h(shift.startedAt)} -{" "}
              {shift.endedAt ? formatTime12h(shift.endedAt) : t("shift.ongoing")}
            </Text>
          </View>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>{t("shift.duration")}</Text>
            <Text style={styles.historyValue}>
              {calculateDuration(shift.startedAt, shift.endedAt)}
            </Text>
          </View>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>{t("shift.sales")}</Text>
            <Text style={styles.historyValue}>
              {t("shift.ordersWithTotal", { count: shift.salesCount, total: formatMoney(shift.salesTotalMinor) })}
            </Text>
          </View>
          {shift.varianceMinor !== null && (
            <View style={styles.historyRow}>
              <Text style={styles.historyLabel}>{t("shift.variance")}</Text>
              <Text style={[styles.historyValue, { color: varianceColor, fontWeight: "700" }]}>
                {shift.varianceMinor >= 0 ? "+" : ""}
                {formatMoney(shift.varianceMinor)}
              </Text>
            </View>
          )}
        </View>

        {shift.notes && (
          <Text style={styles.historyNotes}>{t("shift.notesLabel")}: {shift.notes}</Text>
        )}
      </View>
    );
  }, [colors, styles]);

  return (
    <View style={styles.container}>
      <BackHeader title={t("shift.title")} onBack={onBack} />

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <Pressable
          accessibilityRole="button"
          style={[styles.tab, activeTab === "CURRENT" && styles.tabActive]}
          onPress={() => setActiveTab("CURRENT")}
        >
          <Text style={[styles.tabText, activeTab === "CURRENT" && styles.tabTextActive]}>
            {t("shift.currentShift")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.tab, activeTab === "HISTORY" && styles.tabActive]}
          onPress={() => setActiveTab("HISTORY")}
        >
          <Text style={[styles.tabText, activeTab === "HISTORY" && styles.tabTextActive]}>
            {t("shift.history")}
          </Text>
        </Pressable>
      </View>

      {activeTab === "CURRENT" ? (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{t("shift.loadingShiftInfo")}</Text>
            </View>
          ) : currentShift ? (
            /* Active shift view */
            <>
              <View style={styles.activeShiftCard}>
                <View style={styles.activeShiftHeader}>
                  <View style={styles.activeShiftDot} />
                  <Text style={styles.activeShiftTitle}>{t("shift.activeShift")}</Text>
                </View>

                <View style={styles.shiftInfoRow}>
                  <MaterialCommunityIcons name="account" size={16} color={colors.textSecondary} />
                  <Text style={styles.shiftInfoText}>{currentShift.staffName}</Text>
                </View>
                <View style={styles.shiftInfoRow}>
                  <MaterialCommunityIcons name="clock-start" size={16} color={colors.textSecondary} />
                  <Text style={styles.shiftInfoText}>
                    {t("shift.startedAt", { time: formatTime12h(currentShift.startedAt), date: formatDateDDMMYYYY(currentShift.startedAt) })}
                  </Text>
                </View>
                <View style={styles.shiftInfoRow}>
                  <MaterialCommunityIcons name="timer-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.shiftInfoText}>
                    {t("shift.durationValue", { duration: calculateDuration(currentShift.startedAt) })}
                  </Text>
                </View>
                <View style={styles.shiftInfoRow}>
                  <MaterialCommunityIcons name="cash" size={16} color={colors.textSecondary} />
                  <Text style={styles.shiftInfoText}>
                    {t("shift.openingCashValue", { amount: formatMoney(currentShift.openingCashMinor) })}
                  </Text>
                </View>
              </View>

              {/* Shift summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>{t("shift.shiftSummary")}</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{t("shift.salesCount")}</Text>
                  <Text style={styles.summaryValue}>{currentShift.salesCount}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{t("shift.salesTotal")}</Text>
                  <Text style={styles.summaryValueLarge}>
                    {formatMoney(currentShift.salesTotalMinor)}
                  </Text>
                </View>
                {currentShift.salesByPaymentType && (
                  <>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryRowIcon}>
                        <MaterialCommunityIcons name="cash" size={16} color={colors.success} />
                        <Text style={styles.summaryLabel}>{t("shift.cash")}</Text>
                      </View>
                      <Text style={styles.summaryValue}>
                        {formatMoney(currentShift.salesByPaymentType.cashMinor)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryRowIcon}>
                        <MaterialCommunityIcons name="cellphone-nfc" size={16} color={colors.primary} />
                        <Text style={styles.summaryLabel}>{t("shift.upi")}</Text>
                      </View>
                      <Text style={styles.summaryValue}>
                        {formatMoney(currentShift.salesByPaymentType.upiMinor)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryRowIcon}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color={colors.warning} />
                        <Text style={styles.summaryLabel}>{t("shift.due")}</Text>
                      </View>
                      <Text style={styles.summaryValue}>
                        {formatMoney(currentShift.salesByPaymentType.dueMinor)}
                      </Text>
                    </View>
                    {currentShift.salesByPaymentType.cardMinor > 0 && (
                      <View style={styles.summaryRow}>
                        <View style={styles.summaryRowIcon}>
                          <MaterialCommunityIcons name="credit-card-outline" size={16} color={colors.accent} />
                          <Text style={styles.summaryLabel}>{t("shift.card")}</Text>
                        </View>
                        <Text style={styles.summaryValue}>
                          {formatMoney(currentShift.salesByPaymentType.cardMinor)}
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {currentShift.expectedCashMinor !== null && (
                  <>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { fontWeight: "700" }]}>{t("shift.expectedCash")}</Text>
                      <Text style={[styles.summaryValue, { fontWeight: "700" }]}>
                        {formatMoney(currentShift.expectedCashMinor)}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {/* End shift form */}
              <View style={styles.endShiftCard}>
                <Text style={styles.endShiftTitle}>{t("shift.endShiftTitle")}</Text>

                <Text style={styles.formLabel}>{t("shift.closingCashLabel")}</Text>
                <View style={styles.cashInputRow}>
                  <Text style={styles.cashInputPrefix}>₹</Text>
                  <TextInput
                    style={styles.cashInput}
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                    accessibilityLabel="Closing cash amount"
                    value={closingCash}
                    onChangeText={setClosingCash}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </View>

                {/* Variance */}
                {hasValidClosingCash && currentShift.expectedCashMinor !== null && (
                  <View
                    style={[
                      styles.varianceBox,
                      {
                        backgroundColor:
                          endVarianceMinor === 0
                            ? colors.successSoft
                            : colors.errorSoft,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={endVarianceMinor === 0 ? "check-circle" : "alert-circle"}
                      size={18}
                      color={endVarianceMinor === 0 ? colors.success : colors.error}
                    />
                    <Text
                      style={[
                        styles.varianceText,
                        {
                          color: endVarianceMinor === 0 ? colors.success : colors.error,
                        },
                      ]}
                    >
                      {endVarianceMinor === 0
                        ? t("shift.cashMatches")
                        : t("shift.varianceAmount", { amount: `${endVarianceMinor > 0 ? "+" : ""}${formatMoney(endVarianceMinor)}` })}
                    </Text>
                  </View>
                )}

                <Text style={styles.formLabel}>{t("shift.notesOptional")}</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  placeholder={t("shift.notesPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Shift end notes"
                  value={endNotes}
                  onChangeText={setEndNotes}
                  multiline
                  numberOfLines={3}
                />

                <Pressable
                  accessibilityRole="button"
                  style={[styles.endShiftButton, (ending || !hasValidClosingCash) && styles.endShiftButtonDisabled]}
                  onPress={handleEndShift}
                  disabled={ending || !hasValidClosingCash}
                >
                  {ending ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="clock-end" size={18} color={colors.textInverse} />
                      <Text style={styles.endShiftButtonText}>{t("shift.endShiftButton")}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            /* No active shift — Start shift flow */
            <View style={styles.startShiftContainer}>
              <View style={styles.startShiftCard}>
                <MaterialCommunityIcons name="clock-plus-outline" size={48} color={colors.primary} />
                <Text style={styles.startShiftTitle}>{t("shift.startYourShift")}</Text>
                <Text style={styles.startShiftSubtitle}>
                  {t("shift.enterOpeningCashToBegin", { name: staffSession?.name || t("shift.staff") })}
                </Text>

                <Text style={styles.formLabel}>{t("shift.openingCashLabel")}</Text>
                <View style={styles.cashInputRow}>
                  <Text style={styles.cashInputPrefix}>₹</Text>
                  <TextInput
                    style={styles.cashInput}
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                    accessibilityLabel="Opening cash amount"
                    value={openingCash}
                    onChangeText={setOpeningCash}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  style={[styles.startShiftButton, starting && styles.startShiftButtonDisabled]}
                  onPress={handleStartShift}
                  disabled={starting}
                >
                  {starting ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="clock-start" size={18} color={colors.textInverse} />
                      <Text style={styles.startShiftButtonText}>{t("shift.startShift")}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        /* History tab */
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {historyLoading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : history.length === 0 ? (
            <EmptyState
              icon="history"
              title={t("shift.noShiftHistory")}
              description={t("shift.noShiftHistoryDescription")}
            />
          ) : (
            history.map(renderHistoryItem)
          )}
        </ScrollView>
      )}
    </View>
  );
}

