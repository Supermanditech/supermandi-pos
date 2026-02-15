// SM-020: BnplDuesScreen
// Screen showing active BNPL drawdowns with pay button
// GO-LIVE-192: Added AbortController for proper polling cleanup

import React, { useCallback, useEffect, useRef, useState } from "react";
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
// T-109: Branded empty state
import EmptyState from "../components/ui/EmptyState";

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

  // GO-LIVE-240: Dispute modal state
  const [disputeModal, setDisputeModal] = useState<{
    visible: boolean;
    drawdown: BnplDrawdown | null;
    reason: string;
    description: string;
    submitting: boolean;
  }>({
    visible: false,
    drawdown: null,
    reason: "",
    description: "",
    submitting: false,
  });

  // GO-LIVE-192: AbortController ref for cancelling polling on modal close
  const pollingAbortControllerRef = useRef<AbortController | null>(null);

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

  // GO-LIVE-192: Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingAbortControllerRef.current) {
        pollingAbortControllerRef.current.abort();
        pollingAbortControllerRef.current = null;
      }
    };
  }, []);

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
  // GO-LIVE-192: Use AbortController for proper cleanup on modal close
  const startAutoPolling = useCallback(
    async (drawdownId: string, repaymentId: string) => {
      // GO-LIVE-192: Abort any existing polling before starting new one
      if (pollingAbortControllerRef.current) {
        pollingAbortControllerRef.current.abort();
      }
      pollingAbortControllerRef.current = new AbortController();

      setPaymentModal((prev) => ({
        ...prev,
        isPolling: true,
        pollingStatus: "Waiting for payment...",
      }));

      try {
        const result = await bnplApi.pollBnplPaymentStatus(drawdownId, repaymentId, {
          intervalMs: 3000,
          maxAttempts: 60, // 3 minutes
          signal: pollingAbortControllerRef.current.signal, // GO-LIVE-192: Pass signal for cancellation
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
        pollingAbortControllerRef.current = null;
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
        // GO-LIVE-192: Check if error was due to abort (user closed modal)
        if (error?.message === "Payment polling cancelled") {
          console.log("[BnplDuesScreen] Polling cancelled by user");
        } else {
          console.warn("[BnplDuesScreen] Auto-polling stopped:", error);
        }
        // Polling timed out or failed - user can still enter UTR manually
        pollingAbortControllerRef.current = null;
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
  // GO-LIVE-192: Abort any ongoing polling when modal closes
  const handleClosePaymentModal = useCallback(() => {
    // Abort any active polling
    if (pollingAbortControllerRef.current) {
      pollingAbortControllerRef.current.abort();
      pollingAbortControllerRef.current = null;
    }
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

  // GO-LIVE-240: Open dispute modal
  const handleOpenDispute = useCallback((drawdown: BnplDrawdown) => {
    setDisputeModal({
      visible: true,
      drawdown,
      reason: "",
      description: "",
      submitting: false,
    });
  }, []);

  // GO-LIVE-240: Submit dispute
  const handleSubmitDispute = useCallback(async () => {
    if (!disputeModal.drawdown || !disputeModal.reason) {
      Alert.alert("Select Reason", "Please select a reason for your dispute.");
      return;
    }

    setDisputeModal((prev) => ({ ...prev, submitting: true }));

    try {
      // Call dispute API (or mock it)
      await bnplApi.submitBnplDispute?.(
        disputeModal.drawdown.id,
        disputeModal.reason,
        disputeModal.description
      );

      Alert.alert(
        "Dispute Submitted",
        "Your dispute has been submitted. Our team will review it and contact you within 2-3 business days.",
        [
          {
            text: "OK",
            onPress: () => {
              setDisputeModal({ visible: false, drawdown: null, reason: "", description: "", submitting: false });
              void loadData();
            },
          },
        ]
      );
    } catch (error) {
      // AUDIT-POS-003: Show error alert on failure — not false success
      console.error("[BnplDuesScreen] Dispute submission failed:", error);
      Alert.alert("Dispute Failed", "Could not submit your dispute. Please try again.", [
        {
          text: "Retry",
          onPress: () => setDisputeModal((prev) => ({ ...prev, submitting: false })),
        },
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => setDisputeModal({ visible: false, drawdown: null, reason: "", description: "", submitting: false }),
        },
      ]);
    }
  }, [disputeModal, loadData]);

  // GO-LIVE-240: Close dispute modal
  const handleCloseDisputeModal = useCallback(() => {
    setDisputeModal({ visible: false, drawdown: null, reason: "", description: "", submitting: false });
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

          {/* GO-LIVE-240: Actions row with Pay and Dispute buttons */}
          <View style={styles.actionButtonsRow}>
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
            <Pressable
              style={styles.disputeButton}
              onPress={() => handleOpenDispute(drawdown)}
            >
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={16}
                color={theme.colors.warning}
              />
              <Text style={styles.disputeButtonText}>Dispute</Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [handlePayDrawdown, handleOpenDispute]
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
      {/* T-109: Branded empty state */}
      {isEmpty ? (
        <EmptyState
          icon="check-circle-outline"
          title="No outstanding dues"
          description="You don't have any active BNPL payments. All dues are paid."
        />
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
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

      {/* GO-LIVE-240: Dispute Modal */}
      <Modal
        visible={disputeModal.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseDisputeModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.closeButton} onPress={handleCloseDisputeModal}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>Dispute Charge</Text>
            <View style={styles.headerRight} />
          </View>

          {disputeModal.drawdown && (
            <ScrollView style={styles.modalContent}>
              {/* Dispute info */}
              <View style={styles.disputeInfoCard}>
                <Text style={styles.disputeInfoLabel}>Order</Text>
                <Text style={styles.disputeInfoValue}>
                  {disputeModal.drawdown.orderNumber ?? `PO-${disputeModal.drawdown.id.slice(0, 8)}`}
                </Text>
                <Text style={styles.disputeInfoLabel}>Amount</Text>
                <Text style={styles.disputeInfoValue}>
                  {formatMoney(disputeModal.drawdown.principalMinor)}
                </Text>
              </View>

              {/* Reason selection */}
              <Text style={styles.disputeReasonLabel}>Select Reason for Dispute</Text>
              {[
                { id: "wrong_amount", label: "Wrong amount charged" },
                { id: "not_received", label: "Goods not received" },
                { id: "defective", label: "Defective/damaged goods" },
                { id: "already_paid", label: "Already paid by other means" },
                { id: "other", label: "Other" },
              ].map((reason) => (
                <Pressable
                  key={reason.id}
                  style={[
                    styles.disputeReasonOption,
                    disputeModal.reason === reason.id && styles.disputeReasonOptionActive,
                  ]}
                  onPress={() => setDisputeModal((prev) => ({ ...prev, reason: reason.id }))}
                >
                  <MaterialCommunityIcons
                    name={disputeModal.reason === reason.id ? "radiobox-marked" : "radiobox-blank"}
                    size={20}
                    color={disputeModal.reason === reason.id ? theme.colors.primary : theme.colors.textTertiary}
                  />
                  <Text style={styles.disputeReasonText}>{reason.label}</Text>
                </Pressable>
              ))}

              {/* Description */}
              <Text style={styles.disputeDescLabel}>Additional Details (Optional)</Text>
              <TextInput
                style={styles.disputeDescInput}
                value={disputeModal.description}
                onChangeText={(text) => setDisputeModal((prev) => ({ ...prev, description: text }))}
                placeholder="Describe the issue..."
                placeholderTextColor={theme.colors.textTertiary}
                multiline
                numberOfLines={4}
              />

              {/* Submit button */}
              <Pressable
                style={[styles.disputeSubmitButton, !disputeModal.reason && styles.buttonDisabled]}
                onPress={handleSubmitDispute}
                disabled={!disputeModal.reason || disputeModal.submitting}
              >
                {disputeModal.submitting ? (
                  <ActivityIndicator size="small" color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.disputeSubmitText}>Submit Dispute</Text>
                )}
              </Pressable>

              <Text style={styles.disputeNote}>
                Our team will review your dispute within 2-3 business days. You will be contacted via phone or email.
              </Text>
            </ScrollView>
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
  // GO-LIVE-240: Action buttons row
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  payButton: {
    flex: 1,
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
  disputeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.warningSoft,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  disputeButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.warning,
  },
  // GO-LIVE-240: Dispute modal styles
  disputeInfoCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  disputeInfoLabel: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  disputeInfoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  disputeReasonLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  disputeReasonOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  disputeReasonOptionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.accentSoft,
  },
  disputeReasonText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  disputeDescLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  disputeDescInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.textPrimary,
    minHeight: 100,
    textAlignVertical: "top",
  },
  disputeSubmitButton: {
    backgroundColor: theme.colors.warning,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.lg,
  },
  disputeSubmitText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  disputeNote: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: "center",
    marginTop: theme.spacing.md,
    lineHeight: 18,
  },
  buttonDisabled: {
    opacity: 0.5,
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
