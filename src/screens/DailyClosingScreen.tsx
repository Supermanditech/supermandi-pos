// T-191: Daily Closing / Z-Report Screen
// Summary of day's sales, cash reconciliation, closing history
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
import { useDailyClosingStore } from "../stores/dailyClosingStore";
import type { DailyClosingRecord } from "../services/dailyClosingService";
import { BackHeader } from "../components/ui/BackHeader";
import EmptyState from "../components/ui/EmptyState";

// =============================================================================
// HELPERS
// =============================================================================

function getTodayString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function formatDateDDMMYYYY(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatISODateDDMMYYYY(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "--";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// =============================================================================
// COMPONENT
// =============================================================================

type TabView = "SUMMARY" | "HISTORY";

interface DailyClosingScreenProps {
  onBack?: () => void;
}

export default function DailyClosingScreen({ onBack }: DailyClosingScreenProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const {
    summary,
    history,
    loading,
    historyLoading,
    closing,
    error,
    fetchSummary,
    fetchHistory,
    closeDay,
    clearError,
  } = useDailyClosingStore();

  const [activeTab, setActiveTab] = useState<TabView>("SUMMARY");
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [actualCash, setActualCash] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // ISSUE-112: Android hardware back button support
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack?.();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  // UIUX-POS-003: All deps that are read inside the callback must be listed
  useEffect(() => {
    void fetchSummary(selectedDate);
  }, [selectedDate, fetchSummary]);

  useEffect(() => {
    if (activeTab === "HISTORY") {
      void fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  useEffect(() => {
    if (error) {
      Alert.alert(t("common.error"), error, [{ text: "OK", onPress: clearError }]);
    }
  }, [error, t, clearError]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    const promise =
      activeTab === "SUMMARY"
        ? fetchSummary(selectedDate)
        : fetchHistory();
    promise.finally(() => setRefreshing(false));
  }, [activeTab, selectedDate, fetchSummary, fetchHistory]);

  const handleDateChange = useCallback((direction: "prev" | "next") => {
    setSelectedDate((prev) => {
      const d = new Date(prev + "T00:00:00");
      if (direction === "prev") {
        d.setDate(d.getDate() - 1);
      } else {
        d.setDate(d.getDate() + 1);
      }
      // Don't allow future dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d > today) return prev;
      return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    });
  }, []);

  const isToday = selectedDate === getTodayString();

  const handleCloseDay = useCallback(async () => {
    const cashStr = actualCash.trim();
    const actualCashMinor = Math.round(parseFloat(cashStr) * 100);
    if (!cashStr || isNaN(actualCashMinor) || actualCashMinor < 0) {
      Alert.alert("Invalid Amount", "Please enter the actual cash amount.");
      return;
    }

    Alert.alert(
      t("menu.dailyClosing"),
      `${t("common.confirm")}? ${formatDateDDMMYYYY(selectedDate)}`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("menu.dailyClosing"),
          style: "destructive",
          onPress: async () => {
            const success = await closeDay({
              date: selectedDate,
              actualCashMinor,
            });
            if (success) {
              setActualCash("");
              Alert.alert(t("common.success"), t("common.done"));
            }
          },
        },
      ]
    );
  }, [actualCash, selectedDate, closeDay]);

  // Calculate variance
  const varianceMinor = summary
    ? (Math.round(parseFloat(actualCash || "0") * 100)) - summary.expectedCashMinor
    : 0;
  const hasValidCashInput = actualCash.trim().length > 0 && !isNaN(parseFloat(actualCash));

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Render history item
  const renderHistoryItem = useCallback((record: DailyClosingRecord) => {
    const isMatch = record.varianceMinor === 0;
    const varianceColor = isMatch ? colors.success : colors.error;

    return (
      <View key={record.id} style={styles.historyCard}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyDate}>{formatDateDDMMYYYY(record.date)}</Text>
          <View style={[styles.historyBadge, { backgroundColor: varianceColor + "15" }]}>
            <Text style={[styles.historyBadgeText, { color: varianceColor }]}>
              {isMatch ? "MATCH" : "MISMATCH"}
            </Text>
          </View>
        </View>
        <View style={styles.historyDetails}>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Expected Cash</Text>
            <Text style={styles.historyValue}>{formatMoney(record.expectedCashMinor)}</Text>
          </View>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Actual Cash</Text>
            <Text style={styles.historyValue}>{formatMoney(record.actualCashMinor)}</Text>
          </View>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Variance</Text>
            <Text style={[styles.historyValue, { color: varianceColor, fontWeight: "700" }]}>
              {record.varianceMinor >= 0 ? "+" : ""}
              {formatMoney(record.varianceMinor)}
            </Text>
          </View>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Total Sales</Text>
            <Text style={styles.historyValue}>{formatMoney(record.totalSalesMinor)}</Text>
          </View>
        </View>
        <Text style={styles.historyClosedBy}>
          Closed by {record.closedByStaffName} at{" "}
          {formatISODateDDMMYYYY(record.closedAt)}
        </Text>
      </View>
    );
  }, [colors, styles]);

  return (
    <View style={styles.container}>
      <BackHeader title="Daily Closing" onBack={onBack} />

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <Pressable
          accessibilityRole="button"
          style={[styles.tab, activeTab === "SUMMARY" && styles.tabActive]}
          onPress={() => setActiveTab("SUMMARY")}
        >
          <Text style={[styles.tabText, activeTab === "SUMMARY" && styles.tabTextActive]}>
            Summary
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.tab, activeTab === "HISTORY" && styles.tabActive]}
          onPress={() => setActiveTab("HISTORY")}
        >
          <Text style={[styles.tabText, activeTab === "HISTORY" && styles.tabTextActive]}>
            History
          </Text>
        </Pressable>
      </View>

      {activeTab === "SUMMARY" ? (
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
          {/* Date picker */}
          <View style={styles.datePicker}>
            <Pressable accessibilityRole="button" style={styles.dateArrow} onPress={() => handleDateChange("prev")}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={colors.primary} />
            </Pressable>
            <View style={styles.dateDisplay}>
              <Text style={styles.dateText}>{formatDateDDMMYYYY(selectedDate)}</Text>
              {isToday && <Text style={styles.dateTodayBadge}>Today</Text>}
            </View>
            <Pressable
              accessibilityRole="button"
              style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
              onPress={() => handleDateChange("next")}
              disabled={isToday}
            >
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={isToday ? colors.textTertiary : colors.primary}
              />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading summary...</Text>
            </View>
          ) : summary ? (
            <>
              {/* Sales summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Sales Summary</Text>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Sales</Text>
                  <Text style={styles.summaryValueLarge}>{formatMoney(summary.totalSalesMinor)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Transactions</Text>
                  <Text style={styles.summaryValue}>{summary.transactionCount}</Text>
                </View>

                <View style={styles.summaryDivider} />
                <Text style={styles.summarySubTitle}>By Payment Type</Text>

                <View style={styles.summaryRow}>
                  <View style={styles.summaryRowIcon}>
                    <MaterialCommunityIcons name="cash" size={16} color={colors.success} />
                    <Text style={styles.summaryLabel}>Cash</Text>
                  </View>
                  <Text style={styles.summaryValue}>
                    {formatMoney(summary.salesByPaymentType.cashMinor)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryRowIcon}>
                    <MaterialCommunityIcons name="cellphone-nfc" size={16} color={colors.primary} />
                    <Text style={styles.summaryLabel}>UPI</Text>
                  </View>
                  <Text style={styles.summaryValue}>
                    {formatMoney(summary.salesByPaymentType.upiMinor)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryRowIcon}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color={colors.warning} />
                    <Text style={styles.summaryLabel}>Due</Text>
                  </View>
                  <Text style={styles.summaryValue}>
                    {formatMoney(summary.salesByPaymentType.dueMinor)}
                  </Text>
                </View>
                {summary.salesByPaymentType.cardMinor > 0 && (
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryRowIcon}>
                      <MaterialCommunityIcons name="credit-card-outline" size={16} color={colors.accent} />
                      <Text style={styles.summaryLabel}>Card</Text>
                    </View>
                    <Text style={styles.summaryValue}>
                      {formatMoney(summary.salesByPaymentType.cardMinor)}
                    </Text>
                  </View>
                )}

                {summary.refundsMinor > 0 && (
                  <>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Refunds</Text>
                      <Text style={[styles.summaryValue, { color: colors.error }]}>
                        -{formatMoney(summary.refundsMinor)}
                      </Text>
                    </View>
                  </>
                )}

                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Opening Cash</Text>
                  <Text style={styles.summaryValue}>{formatMoney(summary.openingCashMinor)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { fontWeight: "700" }]}>Expected Cash</Text>
                  <Text style={[styles.summaryValue, { fontWeight: "700", color: colors.textPrimary }]}>
                    {formatMoney(summary.expectedCashMinor)}
                  </Text>
                </View>
              </View>

              {/* Actual cash input */}
              <View style={styles.cashInputCard}>
                <Text style={styles.cashInputLabel}>Enter Actual Cash</Text>
                <View style={styles.cashInputRow}>
                  <Text style={styles.cashInputPrefix}>₹</Text>
                  <TextInput
                    testID="daily-closing-cash-input"
                    style={styles.cashInput}
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                    value={actualCash}
                    onChangeText={setActualCash}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </View>

                {/* Variance display */}
                {hasValidCashInput && (
                  <View
                    style={[
                      styles.varianceBox,
                      {
                        backgroundColor:
                          varianceMinor === 0
                            ? colors.successSoft
                            : colors.errorSoft,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={varianceMinor === 0 ? "check-circle" : "alert-circle"}
                      size={20}
                      color={varianceMinor === 0 ? colors.success : colors.error}
                    />
                    <View>
                      <Text
                        style={[
                          styles.varianceText,
                          {
                            color:
                              varianceMinor === 0 ? colors.success : colors.error,
                          },
                        ]}
                      >
                        {varianceMinor === 0
                          ? "Cash matches expected amount"
                          : `Variance: ${varianceMinor > 0 ? "+" : ""}${formatMoney(varianceMinor)}`}
                      </Text>
                      {varianceMinor !== 0 && (
                        <Text style={styles.varianceHint}>
                          {varianceMinor > 0 ? "Excess cash" : "Short cash"}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </View>

              {/* Close day button */}
              <Pressable
                testID="daily-closing-submit-btn"
                accessibilityRole="button"
                style={[styles.closeDayButton, closing && styles.closeDayButtonDisabled]}
                onPress={handleCloseDay}
                disabled={closing || !hasValidCashInput}
              >
                {closing ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check-bold" size={18} color={colors.textInverse} />
                    <Text style={styles.closeDayButtonText}>Close Day</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : (
            <EmptyState
              icon="calendar-blank"
              title="No data available"
              description="No sales data found for the selected date."
            />
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
              title="No closing history"
              description="Daily closing records will appear here after you close your first day."
            />
          ) : (
            history.map(renderHistoryItem)
          )}
        </ScrollView>
      )}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

function createStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
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
  datePicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  dateArrow: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  dateArrowDisabled: {
    opacity: 0.4,
  },
  dateDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  dateText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  dateTodayBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
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
  summarySubTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textTertiary,
    marginBottom: theme.spacing.sm,
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
  cashInputCard: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cashInputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: theme.spacing.sm,
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
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  varianceText: {
    fontSize: 14,
    fontWeight: "600",
  },
  varianceHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  closeDayButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  closeDayButtonDisabled: {
    opacity: 0.6,
  },
  closeDayButtonText: {
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
  historyDate: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
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
  historyClosedBy: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
}); }
