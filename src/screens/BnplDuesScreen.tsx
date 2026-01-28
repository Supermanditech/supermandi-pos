// SM-020: BnplDuesScreen
// Screen showing active BNPL drawdowns with pay button

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../theme";
import { formatMoney } from "../utils/money";
import * as bnplApi from "../services/api/bnplApi";
import type { BnplDrawdown } from "../services/api/bnplApi";

// =============================================================================
// TYPES
// =============================================================================

interface BnplDuesScreenProps {
  onBack?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function BnplDuesScreen({ onBack }: BnplDuesScreenProps) {
  const insets = useSafeAreaInsets();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drawdowns, setDrawdowns] = useState<BnplDrawdown[]>([]);
  const [summary, setSummary] = useState<{
    totalOutstanding: number;
    creditLimit: number;
    availableCredit: number;
    bnplEnabled: boolean;
  } | null>(null);

  // Payment modal state
  const [paymentModal, setPaymentModal] = useState<{
    visible: boolean;
    drawdown: BnplDrawdown | null;
    mode: "UPI" | "CASH" | null;
    repaymentId: string | null;
    upiDeepLink: string | null;
    utrInput: string;
    paying: boolean;
    // GL-RJ-008: Auto-polling state
    isPolling: boolean;
    pollingStatus: string | null;
  }>({
    visible: false,
    drawdown: null,
    mode: null,
    repaymentId: null,
    upiDeepLink: null,
    utrInput: "",
    paying: false,
    isPolling: false,
    pollingStatus: null,
  });

  // Load data
  const loadData = useCallback(async () => {
    try {
      const response = await bnplApi.getActiveBnpl();
      setDrawdowns(response.drawdowns);
      setSummary({
        totalOutstanding: response.totalOutstanding,
        creditLimit: response.creditLimit,
        availableCredit: response.availableCredit,
        bnplEnabled: response.bnplEnabled,
      });
    } catch (error) {
      console.error("[BnplDuesScreen] Failed to load data:", error);
      Alert.alert("Error", "Failed to load BNPL dues. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  // Open payment modal
  const handlePayDrawdown = useCallback((drawdown: BnplDrawdown) => {
    setPaymentModal({
      visible: true,
      drawdown,
      mode: null,
      repaymentId: null,
      upiDeepLink: null,
      utrInput: "",
      paying: false,
      isPolling: false,
      pollingStatus: null,
    });
  }, []);

  // GL-RJ-008: Start auto-polling for UPI payment status
  const startAutoPolling = useCallback(
    async (drawdownId: string, repaymentId: string) => {
      setPaymentModal((prev) => ({
        ...prev,
        isPolling: true,
        pollingStatus: "Waiting for payment...",
      }));

      try {
        const result = await bnplApi.pollBnplPaymentStatus(drawdownId, repaymentId, {
          intervalMs: 3000,
          maxAttempts: 60, // 3 minutes
          onStatusUpdate: (status) => {
            if (status.status === "processing") {
              setPaymentModal((prev) => ({
                ...prev,
                pollingStatus: "Processing payment...",
              }));
            } else if (status.status === "pending") {
              setPaymentModal((prev) => ({
                ...prev,
                pollingStatus: "Waiting for payment...",
              }));
            }
          },
        });

        // Payment completed automatically
        setPaymentModal((prev) => ({
          ...prev,
          isPolling: false,
          pollingStatus: null,
        }));

        Alert.alert("Payment Confirmed", "Your BNPL payment has been confirmed automatically.", [
          {
            text: "OK",
            onPress: () => {
              setPaymentModal((prev) => ({ ...prev, visible: false }));
              void loadData();
            },
          },
        ]);
      } catch (error: any) {
        console.warn("[BnplDuesScreen] Auto-polling stopped:", error);
        // Polling timed out or failed - user can still enter UTR manually
        setPaymentModal((prev) => ({
          ...prev,
          isPolling: false,
          pollingStatus: null,
        }));
        // Don't show error - just let user enter UTR manually
      }
    },
    [loadData]
  );

  // Select payment mode
  const handleSelectPaymentMode = useCallback(
    async (mode: "UPI" | "CASH") => {
      if (!paymentModal.drawdown) return;

      setPaymentModal((prev) => ({ ...prev, mode, paying: true }));

      try {
        const response = await bnplApi.payBnpl(paymentModal.drawdown.id, mode);

        if (mode === "UPI") {
          setPaymentModal((prev) => ({
            ...prev,
            repaymentId: response.repaymentId,
            upiDeepLink: response.upiCollect?.deepLink ?? null,
            paying: false,
          }));
          // Open UPI deep link
          if (response.upiCollect?.deepLink) {
            const canOpen = await Linking.canOpenURL(response.upiCollect.deepLink);
            if (canOpen) {
              await Linking.openURL(response.upiCollect.deepLink);
            }
          }
          // GL-RJ-008: Start auto-polling for payment status
          void startAutoPolling(paymentModal.drawdown.id, response.repaymentId);
        } else if (mode === "CASH") {
          // Cash payment is immediately completed
          Alert.alert(
            "Payment Recorded",
            "Cash payment has been recorded successfully.",
            [
              {
                text: "OK",
                onPress: () => {
                  setPaymentModal((prev) => ({ ...prev, visible: false }));
                  void loadData();
                },
              },
            ]
          );
        }
      } catch (error) {
        console.error("[BnplDuesScreen] Payment failed:", error);
        Alert.alert("Payment Failed", "Failed to initiate payment. Please try again.");
        setPaymentModal((prev) => ({ ...prev, paying: false }));
      }
    },
    [paymentModal.drawdown, loadData, startAutoPolling]
  );

  // Confirm UPI payment with UTR
  const handleConfirmUpiPayment = useCallback(async () => {
    if (!paymentModal.drawdown || !paymentModal.repaymentId || !paymentModal.utrInput) {
      Alert.alert("Enter UTR", "Please enter the UPI transaction reference (UTR).");
      return;
    }

    setPaymentModal((prev) => ({ ...prev, paying: true }));

    try {
      await bnplApi.confirmBnplPayment(
        paymentModal.drawdown.id,
        paymentModal.repaymentId,
        paymentModal.utrInput
      );

      Alert.alert("Payment Confirmed", "Your BNPL payment has been confirmed.", [
        {
          text: "OK",
          onPress: () => {
            setPaymentModal((prev) => ({ ...prev, visible: false }));
            void loadData();
          },
        },
      ]);
    } catch (error) {
      console.error("[BnplDuesScreen] Confirm payment failed:", error);
      Alert.alert("Confirmation Failed", "Failed to confirm payment. Please try again.");
      setPaymentModal((prev) => ({ ...prev, paying: false }));
    }
  }, [paymentModal, loadData]);

  // Close payment modal
  const handleClosePaymentModal = useCallback(() => {
    setPaymentModal({
      visible: false,
      drawdown: null,
      mode: null,
      repaymentId: null,
      upiDeepLink: null,
      utrInput: "",
      paying: false,
      isPolling: false,
      pollingStatus: null,
    });
  }, []);

  // Render drawdown item
  const renderDrawdownItem = useCallback(
    (drawdown: BnplDrawdown) => {
      const statusColor = bnplApi.getBnplStatusColor(drawdown.status, drawdown.isOverdue);
      const statusLabel = bnplApi.getBnplStatusLabel(drawdown.status, drawdown.daysRemaining);

      return (
        <View key={drawdown.id} style={styles.drawdownCard}>
          <View style={styles.drawdownHeader}>
            <View style={styles.drawdownSupplier}>
              <MaterialCommunityIcons
                name="store-outline"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.supplierName} numberOfLines={1}>
                {drawdown.supplierName}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>

          <View style={styles.drawdownDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Order</Text>
              <Text style={styles.detailValue}>
                {drawdown.orderNumber ?? `PO-${drawdown.id.slice(0, 8)}`}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount Due</Text>
              <Text style={styles.amountDue}>{formatMoney(drawdown.principalMinor)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Due Date</Text>
              <Text style={[styles.detailValue, drawdown.isOverdue && styles.overdueDate]}>
                {bnplApi.formatDueDate(drawdown.dueDate)}
              </Text>
            </View>
          </View>

          <Pressable
            style={[styles.payButton, drawdown.isOverdue && styles.payButtonOverdue]}
            onPress={() => handlePayDrawdown(drawdown)}
          >
            <MaterialCommunityIcons
              name="credit-card-outline"
              size={16}
              color={theme.colors.textInverse}
            />
            <Text style={styles.payButtonText}>Pay Now</Text>
          </Pressable>
        </View>
      );
    },
    [handlePayDrawdown]
  );

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading BNPL Dues...</Text>
      </View>
    );
  }

  // Empty state
  const isEmpty = drawdowns.length === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={theme.colors.textPrimary}
            />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>BNPL Dues</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Summary Card */}
      {summary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Outstanding</Text>
              <Text style={styles.summaryValueLarge}>
                {formatMoney(summary.totalOutstanding)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Available Credit</Text>
              <Text style={styles.summaryValue}>{formatMoney(summary.availableCredit)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Credit Limit</Text>
              <Text style={styles.summaryValue}>{formatMoney(summary.creditLimit)}</Text>
            </View>
          </View>
          <View style={styles.creditBar}>
            <View
              style={[
                styles.creditUsed,
                {
                  width: `${Math.min(
                    100,
                    ((summary.creditLimit - summary.availableCredit) / summary.creditLimit) * 100
                  )}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.creditHint}>
            {Math.round(
              ((summary.creditLimit - summary.availableCredit) / summary.creditLimit) * 100
            )}
            % of credit used
          </Text>
        </View>
      )}

      {/* Content */}
      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={64}
            color={theme.colors.success}
          />
          <Text style={styles.emptyTitle}>No Outstanding Dues</Text>
          <Text style={styles.emptyText}>
            You don't have any active BNPL payments. All dues are paid.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <Text style={styles.sectionTitle}>
            Active Dues ({drawdowns.length})
          </Text>
          {drawdowns.map(renderDrawdownItem)}
        </ScrollView>
      )}

      {/* Payment Modal */}
      <Modal
        visible={paymentModal.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClosePaymentModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.closeButton} onPress={handleClosePaymentModal}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>Pay BNPL Due</Text>
            <View style={styles.headerRight} />
          </View>

          {paymentModal.drawdown && (
            <View style={styles.modalContent}>
              {/* Amount to pay */}
              <View style={styles.paymentAmountCard}>
                <Text style={styles.paymentAmountLabel}>Amount to Pay</Text>
                <Text style={styles.paymentAmountValue}>
                  {formatMoney(paymentModal.drawdown.principalMinor)}
                </Text>
                <Text style={styles.paymentSupplier}>
                  {paymentModal.drawdown.supplierName}
                </Text>
              </View>

              {/* Payment mode selection */}
              {!paymentModal.mode && (
                <View style={styles.modeSelection}>
                  <Text style={styles.modeLabel}>Select Payment Mode</Text>
                  <Pressable
                    style={styles.modeButton}
                    onPress={() => handleSelectPaymentMode("UPI")}
                    disabled={paymentModal.paying}
                  >
                    <MaterialCommunityIcons
                      name="qrcode"
                      size={24}
                      color={theme.colors.primary}
                    />
                    <Text style={styles.modeButtonText}>Pay via UPI</Text>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={theme.colors.textTertiary}
                    />
                  </Pressable>
                  <Pressable
                    style={styles.modeButton}
                    onPress={() => handleSelectPaymentMode("CASH")}
                    disabled={paymentModal.paying}
                  >
                    <MaterialCommunityIcons
                      name="cash"
                      size={24}
                      color={theme.colors.success}
                    />
                    <Text style={styles.modeButtonText}>Pay with Cash</Text>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={theme.colors.textTertiary}
                    />
                  </Pressable>
                </View>
              )}

              {/* UPI confirmation */}
              {paymentModal.mode === "UPI" && paymentModal.repaymentId && (
                <View style={styles.upiConfirmSection}>
                  {/* GL-RJ-008: Show polling status */}
                  {paymentModal.isPolling && (
                    <View style={styles.pollingStatus}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                      <Text style={styles.pollingStatusText}>
                        {paymentModal.pollingStatus || "Waiting for payment..."}
                      </Text>
                    </View>
                  )}

                  <Text style={styles.upiInstructions}>
                    {paymentModal.isPolling
                      ? "Complete the payment in your UPI app. Payment will be confirmed automatically."
                      : "Complete the payment in your UPI app, then enter the UTR (transaction reference) below to confirm."}
                  </Text>

                  {/* Manual UTR entry - shown when not polling or as fallback */}
                  {!paymentModal.isPolling && (
                    <>
                      <View style={styles.manualEntryDivider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or enter manually</Text>
                        <View style={styles.dividerLine} />
                      </View>
                      <TextInput
                        style={styles.utrInput}
                        placeholder="Enter UTR / Transaction Reference"
                        placeholderTextColor={theme.colors.textTertiary}
                        value={paymentModal.utrInput}
                        onChangeText={(text) =>
                          setPaymentModal((prev) => ({ ...prev, utrInput: text }))
                        }
                        autoCapitalize="characters"
                      />
                      <Pressable
                        style={[
                          styles.confirmButton,
                          (!paymentModal.utrInput || paymentModal.paying) &&
                            styles.confirmButtonDisabled,
                        ]}
                        onPress={handleConfirmUpiPayment}
                        disabled={!paymentModal.utrInput || paymentModal.paying}
                      >
                        {paymentModal.paying ? (
                          <ActivityIndicator size="small" color={theme.colors.textInverse} />
                        ) : (
                          <>
                            <MaterialCommunityIcons
                              name="check"
                              size={18}
                              color={theme.colors.textInverse}
                            />
                            <Text style={styles.confirmButtonText}>Confirm Payment</Text>
                          </>
                        )}
                      </Pressable>
                    </>
                  )}

                  {paymentModal.upiDeepLink && (
                    <Pressable
                      style={styles.reopenUpiButton}
                      onPress={() => {
                        if (paymentModal.upiDeepLink) {
                          void Linking.openURL(paymentModal.upiDeepLink);
                        }
                      }}
                    >
                      <MaterialCommunityIcons
                        name="refresh"
                        size={16}
                        color={theme.colors.primary}
                      />
                      <Text style={styles.reopenUpiText}>Re-open UPI App</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {paymentModal.paying && !paymentModal.repaymentId && (
                <View style={styles.processingContainer}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                  <Text style={styles.processingText}>Processing payment...</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>
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
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  headerRight: {
    width: 40,
  },
  summaryCard: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.sm,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.border,
  },
  summaryLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  summaryValueLarge: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.warning,
  },
  creditBar: {
    height: 6,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 3,
    marginTop: theme.spacing.md,
    overflow: "hidden",
  },
  creditUsed: {
    height: "100%",
    backgroundColor: theme.colors.warning,
    borderRadius: 3,
  },
  creditHint: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: "center",
    marginTop: theme.spacing.xs,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  drawdownCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  drawdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  drawdownSupplier: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: theme.spacing.xs,
  },
  supplierName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  drawdownDetails: {
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
    color: theme.colors.textTertiary,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  amountDue: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  overdueDate: {
    color: theme.colors.error,
  },
  payButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  payButtonOverdue: {
    backgroundColor: theme.colors.error,
  },
  payButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: "center",
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  modalContent: {
    padding: theme.spacing.md,
  },
  paymentAmountCard: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  paymentAmountLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  paymentAmountValue: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.accent,
  },
  paymentSupplier: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  modeSelection: {
    gap: theme.spacing.md,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  modeButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  upiConfirmSection: {
    gap: theme.spacing.md,
  },
  upiInstructions: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  utrInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.success,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  confirmButtonDisabled: {
    backgroundColor: theme.colors.textTertiary,
    opacity: 0.6,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  reopenUpiButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
  },
  reopenUpiText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  processingContainer: {
    alignItems: "center",
    padding: theme.spacing.xl,
  },
  processingText: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  // GL-RJ-008: Auto-polling styles
  pollingStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.accentSoft,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  pollingStatusText: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.primary,
  },
  manualEntryDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: theme.spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    paddingHorizontal: theme.spacing.sm,
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
});

export default BnplDuesScreen;
