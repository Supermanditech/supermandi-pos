// T-191: Daily Closing / Z-Report Screen
// Summary of day's sales, cash reconciliation, closing history
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { theme } from "../theme";
import { formatMoney } from "../utils/money";
import { useDailyClosingStore } from "../stores/dailyClosingStore";
import type { DailyClosingRecord } from "../services/dailyClosingService";
import { BackHeader } from "../components/ui/BackHeader";
import EmptyState from "../components/ui/EmptyState";

// =============================================================================
// HELPERS
// =============================================================================

function getTodayString(): string {
  const d = new Date();
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
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

  // UIUX-POS-003: Added missing useEffect dependencies
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
      Alert.alert(t("common.error"), error);
      clearError();
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
      return d.toISOString().split("T")[0];
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

  // Render history item
  const renderHistoryItem = useCallback((record: DailyClosingRecord) => {
    const isMatch = record.varianceMinor === 0;
    const varianceColor = isMatch ? theme.colors.success : theme.colors.error;

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
  }, []);

  return (
    <View style={styles.container}>
      <BackHeader title="Daily Closing" onBack={onBack} />

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeTab === "SUMMARY" && styles.tabActive]}
          onPress={() => setActiveTab("SUMMARY")}
        >
          <Text style={[styles.tabText, activeTab === "SUMMARY" && styles.tabTextActive]}>
            Summary
          </Text>
        </Pressable>
        <Pressable
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        >
          {/* Date picker */}
          <View style={styles.datePicker}>
            <Pressable style={styles.dateArrow} onPress={() => handleDateChange("prev")}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={theme.colors.primary} />
            </Pressable>
            <View style={styles.dateDisplay}>
              <Text style={styles.dateText}>{formatDateDDMMYYYY(selectedDate)}</Text>
              {isToday && <Text style={styles.dateTodayBadge}>Today</Text>}
            </View>
            <Pressable
              style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
              onPress={() => handleDateChange("next")}
              disabled={isToday}
            >
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={isToday ? theme.colors.textTertiary : theme.colors.primary}
              />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
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
                    <MaterialCommunityIcons name="cash" size={16} color={theme.colors.success} />
                    <Text style={styles.summaryLabel}>Cash</Text>
                  </View>
                  <Text style={styles.summaryValue}>
                    {formatMoney(summary.salesByPaymentType.cashMinor)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryRowIcon}>
                    <MaterialCommunityIcons name="cellphone-nfc" size={16} color={theme.colors.primary} />
                    <Text style={styles.summaryLabel}>UPI</Text>
                  </View>
                  <Text style={styles.summaryValue}>
                    {formatMoney(summary.salesByPaymentType.upiMinor)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryRowIcon}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color={theme.colors.warning} />
                    <Text style={styles.summaryLabel}>Due</Text>
                  </View>
                  <Text style={styles.summaryValue}>
                    {formatMoney(summary.salesByPaymentType.dueMinor)}
                  </Text>
                </View>

                {summary.refundsMinor > 0 && (
                  <>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Refunds</Text>
                      <Text style={[styles.summaryValue, { color: theme.colors.error }]}>
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
                  <Text style={[styles.summaryValue, { fontWeight: "700", color: theme.colors.textPrimary }]}>
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
                    style={styles.cashInput}
                    placeholder="0.00"
                    placeholderTextColor={theme.colors.textTertiary}
                    value={actualCash}
                    onChangeText={setActualCash}
                    keyboardType="decimal-pad"
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
                            ? theme.colors.successSoft
                            : theme.colors.errorSoft,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={varianceMinor === 0 ? "check-circle" : "alert-circle"}
                      size={20}
                      color={varianceMinor === 0 ? theme.colors.success : theme.colors.error}
                    />
                    <View>
                      <Text
                        style={[
                          styles.varianceText,
                          {
                            color:
                              varianceMinor === 0 ? theme.colors.success : theme.colors.error,
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
                style={[styles.closeDayButton, closing && styles.closeDayButtonDisabled]}
                onPress={handleCloseDay}
                disabled={closing || !hasValidCashInput}
              >
                {closing ? (
                  <ActivityIndicator size="small" color={theme.colors.textInverse} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check-bold" size={18} color={theme.colors.textInverse} />
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        >
          {historyLoading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    color: theme.colors.textSecondary,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textTertiary,
  },
  tabTextActive: {
    color: theme.colors.primary,
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    color: theme.colors.textPrimary,
  },
  dateTodayBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: theme.spacing.md,
  },
  summarySubTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textTertiary,
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
    color: theme.colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  summaryValueLarge: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.primaryDark,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.sm,
  },
  cashInputCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cashInputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  cashInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
  },
  cashInputPrefix: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.sm,
  },
  cashInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.textPrimary,
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
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  closeDayButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  closeDayButtonDisabled: {
    opacity: 0.6,
  },
  closeDayButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  // History styles
  historyCard: {
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.textPrimary,
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
    color: theme.colors.textSecondary,
  },
  historyValue: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  historyClosedBy: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
});
