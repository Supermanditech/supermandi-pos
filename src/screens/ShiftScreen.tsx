// T-192: Shift Management Screen
// Current shift info, start/end shift flows, shift history
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

import { theme } from "../theme";
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
      Alert.alert("Error", error);
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
      Alert.alert("Invalid Amount", "Please enter the opening cash amount.");
      return;
    }
    Alert.alert(
      "Start Shift",
      `Start shift with opening cash of \u20B9${(openingCashMinor / 100).toFixed(2)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start",
          onPress: async () => {
            const success = await startShift({ openingCashMinor });
            if (success) {
              setOpeningCash("");
              Alert.alert("Shift Started", "Your shift has been started successfully.");
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
      Alert.alert("Invalid Amount", "Please enter the closing cash amount.");
      return;
    }

    Alert.alert(
      "End Shift",
      "Are you sure you want to end your current shift?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Shift",
          style: "destructive",
          onPress: async () => {
            const success = await endShift({
              closingCashMinor,
              notes: endNotes.trim() || undefined,
            });
            if (success) {
              setClosingCash("");
              setEndNotes("");
              Alert.alert("Shift Ended", "Your shift has been closed.");
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

  // Render shift history item
  const renderHistoryItem = useCallback((shift: Shift) => {
    const isMatch = shift.varianceMinor === 0;
    const varianceColor =
      shift.varianceMinor === null
        ? theme.colors.textTertiary
        : isMatch
          ? theme.colors.success
          : theme.colors.error;

    return (
      <View key={shift.id} style={styles.historyCard}>
        <View style={styles.historyHeader}>
          <View>
            <Text style={styles.historyStaffName}>{shift.staffName}</Text>
            <Text style={styles.historyDate}>{formatDateDDMMYYYY(shift.startedAt)}</Text>
          </View>
          <View style={[styles.historyBadge, { backgroundColor: varianceColor + "15" }]}>
            <Text style={[styles.historyBadgeText, { color: varianceColor }]}>
              {shift.status === "ACTIVE" ? "ACTIVE" : isMatch ? "MATCH" : "MISMATCH"}
            </Text>
          </View>
        </View>

        <View style={styles.historyDetails}>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Time</Text>
            <Text style={styles.historyValue}>
              {formatTime12h(shift.startedAt)} -{" "}
              {shift.endedAt ? formatTime12h(shift.endedAt) : "Ongoing"}
            </Text>
          </View>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Duration</Text>
            <Text style={styles.historyValue}>
              {calculateDuration(shift.startedAt, shift.endedAt)}
            </Text>
          </View>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Sales</Text>
            <Text style={styles.historyValue}>
              {shift.salesCount} orders ({formatMoney(shift.salesTotalMinor)})
            </Text>
          </View>
          {shift.varianceMinor !== null && (
            <View style={styles.historyRow}>
              <Text style={styles.historyLabel}>Variance</Text>
              <Text style={[styles.historyValue, { color: varianceColor, fontWeight: "700" }]}>
                {shift.varianceMinor >= 0 ? "+" : ""}
                {formatMoney(shift.varianceMinor)}
              </Text>
            </View>
          )}
        </View>

        {shift.notes && (
          <Text style={styles.historyNotes}>Notes: {shift.notes}</Text>
        )}
      </View>
    );
  }, []);

  return (
    <View style={styles.container}>
      <BackHeader title="Shift Management" onBack={onBack} />

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeTab === "CURRENT" && styles.tabActive]}
          onPress={() => setActiveTab("CURRENT")}
        >
          <Text style={[styles.tabText, activeTab === "CURRENT" && styles.tabTextActive]}>
            Current Shift
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

      {activeTab === "CURRENT" ? (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        >
          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Loading shift info...</Text>
            </View>
          ) : currentShift ? (
            /* Active shift view */
            <>
              <View style={styles.activeShiftCard}>
                <View style={styles.activeShiftHeader}>
                  <View style={styles.activeShiftDot} />
                  <Text style={styles.activeShiftTitle}>Active Shift</Text>
                </View>

                <View style={styles.shiftInfoRow}>
                  <MaterialCommunityIcons name="account" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.shiftInfoText}>{currentShift.staffName}</Text>
                </View>
                <View style={styles.shiftInfoRow}>
                  <MaterialCommunityIcons name="clock-start" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.shiftInfoText}>
                    Started at {formatTime12h(currentShift.startedAt)} ({formatDateDDMMYYYY(currentShift.startedAt)})
                  </Text>
                </View>
                <View style={styles.shiftInfoRow}>
                  <MaterialCommunityIcons name="timer-outline" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.shiftInfoText}>
                    Duration: {calculateDuration(currentShift.startedAt)}
                  </Text>
                </View>
                <View style={styles.shiftInfoRow}>
                  <MaterialCommunityIcons name="cash" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.shiftInfoText}>
                    Opening Cash: {formatMoney(currentShift.openingCashMinor)}
                  </Text>
                </View>
              </View>

              {/* Shift summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Shift Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Sales Count</Text>
                  <Text style={styles.summaryValue}>{currentShift.salesCount}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Sales Total</Text>
                  <Text style={styles.summaryValueLarge}>
                    {formatMoney(currentShift.salesTotalMinor)}
                  </Text>
                </View>
                {currentShift.salesByPaymentType && (
                  <>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryRowIcon}>
                        <MaterialCommunityIcons name="cash" size={16} color={theme.colors.success} />
                        <Text style={styles.summaryLabel}>Cash</Text>
                      </View>
                      <Text style={styles.summaryValue}>
                        {formatMoney(currentShift.salesByPaymentType.cashMinor)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryRowIcon}>
                        <MaterialCommunityIcons name="cellphone-nfc" size={16} color={theme.colors.primary} />
                        <Text style={styles.summaryLabel}>UPI</Text>
                      </View>
                      <Text style={styles.summaryValue}>
                        {formatMoney(currentShift.salesByPaymentType.upiMinor)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryRowIcon}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color={theme.colors.warning} />
                        <Text style={styles.summaryLabel}>Due</Text>
                      </View>
                      <Text style={styles.summaryValue}>
                        {formatMoney(currentShift.salesByPaymentType.dueMinor)}
                      </Text>
                    </View>
                  </>
                )}

                {currentShift.expectedCashMinor !== null && (
                  <>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { fontWeight: "700" }]}>Expected Cash</Text>
                      <Text style={[styles.summaryValue, { fontWeight: "700" }]}>
                        {formatMoney(currentShift.expectedCashMinor)}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {/* End shift form */}
              <View style={styles.endShiftCard}>
                <Text style={styles.endShiftTitle}>End Shift</Text>

                <Text style={styles.formLabel}>Closing Cash (₹)</Text>
                <View style={styles.cashInputRow}>
                  <Text style={styles.cashInputPrefix}>₹</Text>
                  <TextInput
                    style={styles.cashInput}
                    placeholder="0.00"
                    placeholderTextColor={theme.colors.textTertiary}
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
                            ? theme.colors.successSoft
                            : theme.colors.errorSoft,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={endVarianceMinor === 0 ? "check-circle" : "alert-circle"}
                      size={18}
                      color={endVarianceMinor === 0 ? theme.colors.success : theme.colors.error}
                    />
                    <Text
                      style={[
                        styles.varianceText,
                        {
                          color: endVarianceMinor === 0 ? theme.colors.success : theme.colors.error,
                        },
                      ]}
                    >
                      {endVarianceMinor === 0
                        ? "Cash matches"
                        : `Variance: ${endVarianceMinor > 0 ? "+" : ""}${formatMoney(endVarianceMinor)}`}
                    </Text>
                  </View>
                )}

                <Text style={styles.formLabel}>Notes (Optional)</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  placeholder="Any notes about the shift..."
                  placeholderTextColor={theme.colors.textTertiary}
                  value={endNotes}
                  onChangeText={setEndNotes}
                  multiline
                  numberOfLines={3}
                />

                <Pressable
                  style={[styles.endShiftButton, (ending || !hasValidClosingCash) && styles.endShiftButtonDisabled]}
                  onPress={handleEndShift}
                  disabled={ending || !hasValidClosingCash}
                >
                  {ending ? (
                    <ActivityIndicator size="small" color={theme.colors.textInverse} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="clock-end" size={18} color={theme.colors.textInverse} />
                      <Text style={styles.endShiftButtonText}>End Shift</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            /* No active shift — Start shift flow */
            <View style={styles.startShiftContainer}>
              <View style={styles.startShiftCard}>
                <MaterialCommunityIcons name="clock-plus-outline" size={48} color={theme.colors.primary} />
                <Text style={styles.startShiftTitle}>Start Your Shift</Text>
                <Text style={styles.startShiftSubtitle}>
                  {staffSession?.name || "Staff"}, enter your opening cash to begin.
                </Text>

                <Text style={styles.formLabel}>Opening Cash (₹)</Text>
                <View style={styles.cashInputRow}>
                  <Text style={styles.cashInputPrefix}>₹</Text>
                  <TextInput
                    style={styles.cashInput}
                    placeholder="0.00"
                    placeholderTextColor={theme.colors.textTertiary}
                    value={openingCash}
                    onChangeText={setOpeningCash}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </View>

                <Pressable
                  style={[styles.startShiftButton, starting && styles.startShiftButtonDisabled]}
                  onPress={handleStartShift}
                  disabled={starting}
                >
                  {starting ? (
                    <ActivityIndicator size="small" color={theme.colors.textInverse} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="clock-start" size={18} color={theme.colors.textInverse} />
                      <Text style={styles.startShiftButtonText}>Start Shift</Text>
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
              title="No shift history"
              description="Shift records will appear here after you complete your first shift."
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
  // Active shift styles
  activeShiftCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.success,
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
    backgroundColor: theme.colors.success,
  },
  activeShiftTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.success,
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
    color: theme.colors.textPrimary,
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
  // End shift form
  endShiftCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderTopWidth: 3,
    borderTopColor: theme.colors.error,
    ...theme.shadows.sm,
  },
  endShiftTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.error,
    textTransform: "uppercase",
    marginBottom: theme.spacing.md,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  formInput: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  formTextArea: {
    minHeight: 80,
    textAlignVertical: "top",
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
    backgroundColor: theme.colors.error,
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
    color: theme.colors.textInverse,
  },
  // Start shift styles
  startShiftContainer: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: theme.spacing.xl,
  },
  startShiftCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: "center",
    ...theme.shadows.sm,
  },
  startShiftTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
  },
  startShiftSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  startShiftButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
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
  historyStaffName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  historyDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
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
    color: theme.colors.textSecondary,
  },
  historyValue: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  historyNotes: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    fontStyle: "italic",
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
});
