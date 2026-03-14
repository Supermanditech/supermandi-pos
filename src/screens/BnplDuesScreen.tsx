// SM-020: BnplDuesScreen
// Screen showing active BNPL drawdowns with pay button
// GO-LIVE-192: Added AbortController for proper polling cleanup

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Platform,
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
import { useTranslation } from "react-i18next";

import { theme, useThemeColors } from "../theme";
import { formatMoney } from "../utils/money";
import * as bnplApi from "../services/api/bnplApi";
import type { BnplDrawdown } from "../services/api/bnplApi";
// T-109: Branded empty state
import EmptyState from "../components/ui/EmptyState";
import { asError } from "../utils/errorUtils";

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
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // UIUX-POS-004: Android hardware back button support
  useEffect(() => {
    if (Platform.OS !== "android" || !onBack) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

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
  // T-153: Added payAmountText for partial payment input
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
    // T-153: Partial payment amount text
    payAmountText: string | null;
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
    payAmountText: null,
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

  // STG-464: Dispute audit trail state
  const [disputeHistory, setDisputeHistory] = useState<bnplApi.BnplDisputeRecord[]>([]);
  const [disputeHistoryLoading, setDisputeHistoryLoading] = useState(false);

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
      if (__DEV__) console.error("[BnplDuesScreen] Failed to load data:", error);
      Alert.alert(t("common.error"), t("common.tryAgain"));
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
  // T-153: Initialize with full balance as default payment amount
  const handlePayDrawdown = useCallback((drawdown: BnplDrawdown) => {
    const remaining = drawdown.principalMinor - (drawdown.paidAmountMinor || 0);
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
      payAmountText: (remaining / 100).toFixed(2),
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
      // FIX-034: Capture controller identity to prevent race on rapid calls
      const myController = new AbortController();
      pollingAbortControllerRef.current = myController;

      setPaymentModal((prev) => ({
        ...prev,
        isPolling: true,
        pollingStatus: t("bnpl.waitingForPayment"),
      }));

      try {
        const result = await bnplApi.pollBnplPaymentStatus(drawdownId, repaymentId, {
          intervalMs: 3000,
          maxAttempts: 60, // 3 minutes
          signal: myController.signal, // FIX-034: Use captured controller, not ref
          onStatusUpdate: (status) => {
            if (status.status === "processing") {
              setPaymentModal((prev) => ({
                ...prev,
                pollingStatus: t("bnpl.processingPayment"),
              }));
            } else if (status.status === "pending") {
              setPaymentModal((prev) => ({
                ...prev,
                pollingStatus: t("bnpl.waitingForPayment"),
              }));
            }
          },
        });

        // FIX-034: Only clear ref if we're still the active controller
        if (pollingAbortControllerRef.current === myController) {
          pollingAbortControllerRef.current = null;
        }
        setPaymentModal((prev) => ({
          ...prev,
          isPolling: false,
          pollingStatus: null,
        }));

        Alert.alert(t("bnpl.paymentConfirmed"), t("bnpl.bnplPaymentConfirmedAuto"), [
          {
            text: t("common.ok"),
            onPress: () => {
              setPaymentModal((prev) => ({ ...prev, visible: false }));
              void loadData();
            },
          },
        ]);
      } catch (_error: unknown) {
    const error = asError(_error);
        // GO-LIVE-192: Check if error was due to abort (user closed modal)
        if (error?.message === "Payment polling cancelled") {
          if (__DEV__) console.log("[BnplDuesScreen] Polling cancelled by user");
        } else {
          if (__DEV__) console.warn("[BnplDuesScreen] Auto-polling stopped:", error);
        }
        // FIX-034: Only clear ref if we're still the active controller
        if (pollingAbortControllerRef.current === myController) {
          pollingAbortControllerRef.current = null;
        }
        setPaymentModal((prev) => ({
          ...prev,
          isPolling: false,
          pollingStatus: null,
        }));
      }
    },
    [loadData]
  );

  // Select payment mode
  // T-153: Pass partial payment amount to backend
  const handleSelectPaymentMode = useCallback(
    async (mode: "UPI" | "CASH") => {
      if (!paymentModal.drawdown) return;

      // T-153: Parse the editable amount for partial payment
      const payAmountMinor = Math.round(
        parseFloat(paymentModal.payAmountText || "0") * 100
      );
      if (payAmountMinor <= 0) {
        Alert.alert(t("bnpl.invalidAmount"), t("bnpl.invalidAmountMessage"));
        return;
      }
      const remaining = paymentModal.drawdown.principalMinor - (paymentModal.drawdown.paidAmountMinor || 0);
      if (payAmountMinor > remaining) {
        Alert.alert(t("bnpl.amountTooHigh"), t("bnpl.amountExceedsBalance", { balance: formatMoney(remaining) }));
        return;
      }

      setPaymentModal((prev) => ({ ...prev, mode, paying: true }));

      try {
        const response = await bnplApi.payBnpl(paymentModal.drawdown.id, mode, payAmountMinor);

        if (mode === "UPI") {
          setPaymentModal((prev) => ({
            ...prev,
            repaymentId: response.repaymentId,
            upiDeepLink: response.upiCollect?.deepLink ?? null,
            paying: false,
          }));
          // ISSUE-097: Open UPI deep link with crash guard
          if (response.upiCollect?.deepLink) {
            try {
              const canOpen = await Linking.canOpenURL(response.upiCollect.deepLink);
              if (canOpen) {
                await Linking.openURL(response.upiCollect.deepLink);
              }
            } catch {
              // UPI app unavailable — user can still enter UTR manually
            }
          }
          // GL-RJ-008: Start auto-polling for payment status
          void startAutoPolling(paymentModal.drawdown.id, response.repaymentId);
        } else if (mode === "CASH") {
          // Cash payment is immediately completed
          Alert.alert(
            t("bnpl.paymentRecorded"),
            t("bnpl.cashPaymentSuccess"),
            [
              {
                text: t("common.ok"),
                onPress: () => {
                  setPaymentModal((prev) => ({ ...prev, visible: false }));
                  void loadData();
                },
              },
            ]
          );
        }
      } catch (error) {
        if (__DEV__) console.error("[BnplDuesScreen] Payment failed:", error);
        Alert.alert(t("bnpl.paymentFailed"), t("bnpl.initiatePaymentFailed"));
        setPaymentModal((prev) => ({ ...prev, paying: false }));
      }
    },
    // UIUX-POS-002: payAmountText is read inside callback — must be in deps to avoid stale closure
    [paymentModal.drawdown, paymentModal.payAmountText, loadData, startAutoPolling]
  );

  // Confirm UPI payment with UTR
  const handleConfirmUpiPayment = useCallback(async () => {
    if (!paymentModal.drawdown || !paymentModal.repaymentId || !paymentModal.utrInput) {
      Alert.alert(t("bnpl.enterUtr"), t("bnpl.utrRequired"));
      return;
    }

    setPaymentModal((prev) => ({ ...prev, paying: true }));

    try {
      await bnplApi.confirmBnplPayment(
        paymentModal.drawdown.id,
        paymentModal.repaymentId,
        paymentModal.utrInput
      );

      Alert.alert(t("bnpl.paymentConfirmed"), t("bnpl.bnplPaymentConfirmed"), [
        {
          text: t("common.ok"),
          onPress: () => {
            setPaymentModal((prev) => ({ ...prev, visible: false }));
            void loadData();
          },
        },
      ]);
    } catch (error) {
      if (__DEV__) console.error("[BnplDuesScreen] Confirm payment failed:", error);
      Alert.alert(t("bnpl.confirmationFailed"), t("bnpl.confirmPaymentFailed"));
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
      payAmountText: null,
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
    // STG-464: Load dispute history for audit trail
    setDisputeHistoryLoading(true);
    bnplApi.getBnplDisputeHistory(drawdown.id)
      .then((res) => setDisputeHistory(res.disputes))
      .catch(() => setDisputeHistory([]))
      .finally(() => setDisputeHistoryLoading(false));
  }, []);

  // GO-LIVE-240: Submit dispute
  const handleSubmitDispute = useCallback(async () => {
    if (!disputeModal.drawdown || !disputeModal.reason) {
      Alert.alert(t("bnpl.selectReason"), t("bnpl.selectReasonMessage"));
      return;
    }

    setDisputeModal((prev) => ({ ...prev, submitting: true }));

    try {
      // POS-029: removed optional chaining — function always exists
      await bnplApi.submitBnplDispute(
        disputeModal.drawdown.id,
        disputeModal.reason,
        disputeModal.description
      );

      Alert.alert(
        t("bnpl.disputeSubmitted"),
        t("bnpl.disputeSubmittedMessage"),
        [
          {
            text: t("common.ok"),
            onPress: () => {
              setDisputeModal({ visible: false, drawdown: null, reason: "", description: "", submitting: false });
              void loadData();
            },
          },
        ]
      );
    } catch (error) {
      // AUDIT-POS-003: Show error alert on failure — not false success
      if (__DEV__) console.error("[BnplDuesScreen] Dispute submission failed:", error);
      Alert.alert(t("bnpl.disputeFailed"), t("bnpl.disputeFailedMessage"), [
        {
          text: t("common.retry"),
          onPress: () => setDisputeModal((prev) => ({ ...prev, submitting: false })),
        },
        {
          text: t("common.cancel"),
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

      // STG-463: Overdue visual hierarchy — escalating urgency indicators
      const daysOverdue = drawdown.isOverdue ? Math.abs(drawdown.daysRemaining) : 0;
      const isUrgent = drawdown.isOverdue && daysOverdue > 7;
      const isCritical = drawdown.isOverdue && daysOverdue > 21;

      return (
        <View key={drawdown.id} style={[
          styles.drawdownCard,
          // STG-463: Escalating border colors for overdue items
          drawdown.isOverdue && { borderColor: colors.error, borderWidth: 2 },
          isUrgent && { borderColor: colors.error, borderWidth: 2, backgroundColor: colors.errorSoft || '#FEF2F2' },
          isCritical && { borderColor: colors.errorDark, borderWidth: 3, backgroundColor: colors.errorSoft },
        ]}>
          {/* STG-463: Overdue warning banner */}
          {drawdown.isOverdue && (
            <View style={[styles.overdueBanner, isCritical && { backgroundColor: colors.errorDark }]}>
              <MaterialCommunityIcons name="alert" size={14} color={colors.textInverse} />
              <Text style={styles.overdueBannerText}>
                {isCritical
                  ? t("bnpl.criticalOverdue", "CRITICAL: {{days}} days overdue — risk of default", { days: daysOverdue })
                  : isUrgent
                    ? t("bnpl.urgentOverdue", "URGENT: {{days}} days overdue", { days: daysOverdue })
                    : t("bnpl.overdueWarning", "Overdue by {{days}} days", { days: daysOverdue })}
              </Text>
            </View>
          )}
          <View style={styles.drawdownHeader}>
            <View style={styles.drawdownSupplier}>
              <MaterialCommunityIcons
                name="store-outline"
                size={16}
                color={colors.textSecondary}
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
              <Text style={styles.detailLabel}>{t("bnpl.order")}</Text>
              <Text style={styles.detailValue}>
                {drawdown.orderNumber ?? `PO-${drawdown.id.slice(0, 8)}`}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("bnpl.amountDue")}</Text>
              <Text style={styles.amountDue}>
                {formatMoney(drawdown.principalMinor - (drawdown.paidAmountMinor || 0))}
              </Text>
            </View>
            {/* T-158: Show interest rate if applicable */}
            {(drawdown.interestRatePercent || 0) > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t("bnpl.interest", { rate: drawdown.interestRatePercent })}</Text>
                <Text style={[styles.detailValue, { color: colors.warning }]}>
                  +{formatMoney(drawdown.interestMinor || 0)}
                </Text>
              </View>
            )}
            {/* T-158: Show total with interest if applicable */}
            {(drawdown.interestRatePercent || 0) > 0 && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { fontWeight: '600' }]}>{t("bnpl.totalPayable")}</Text>
                <Text style={[styles.amountDue, { fontSize: 15 }]}>
                  {formatMoney(drawdown.totalWithInterestMinor || drawdown.principalMinor)}
                </Text>
              </View>
            )}
            {/* T-153: Show paid amount for partial payments */}
            {(drawdown.paidAmountMinor || 0) > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t("bnpl.alreadyPaid")}</Text>
                <Text style={[styles.detailValue, { color: colors.success }]}>
                  {formatMoney(drawdown.paidAmountMinor || 0)}
                </Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("bnpl.dueDate")}</Text>
              <Text style={[styles.detailValue, drawdown.isOverdue && styles.overdueDate]}>
                {bnplApi.formatDueDate(drawdown.dueDate)}
              </Text>
            </View>
          </View>

          {/* GO-LIVE-240: Actions row with Pay and Dispute buttons */}
          <View style={styles.actionButtonsRow}>
            <Pressable
              accessibilityRole="button"
              style={[styles.payButton, drawdown.isOverdue && styles.payButtonOverdue]}
              onPress={() => handlePayDrawdown(drawdown)}
            >
              <MaterialCommunityIcons
                name="credit-card-outline"
                size={16}
                color={colors.textInverse}
              />
              <Text style={styles.payButtonText}>{t("bnpl.payNow")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.disputeButton}
              onPress={() => handleOpenDispute(drawdown)}
            >
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={16}
                color={colors.warning}
              />
              <Text style={styles.disputeButtonText}>{t("bnpl.dispute")}</Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [handlePayDrawdown, handleOpenDispute]
  );

  // UIUX-POS-021: Show header with back button during loading (don't trap user)
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {onBack && (
            <Pressable accessibilityLabel="Go back" accessibilityRole="button" style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>{t("bnpl.title", "BNPL Dues")}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t("bnpl.loadingDues")}</Text>
        </View>
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
          <Pressable accessibilityLabel="Go back" accessibilityRole="button" style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={colors.textPrimary}
            />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>{t("bnpl.title")}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* STG-283: Jargon help bar */}
      <Pressable
        style={styles.jargonHelpBar}
        onPress={() => Alert.alert(
          t("bnpl.jargonHelpTitle", "What do these terms mean?"),
          t("bnpl.jargonHelpBody", "BNPL = Buy Now Pay Later — purchase goods now and pay within the due date.\n\nUTR = Unique Transaction Reference — the 12-digit code from your UPI payment app.\n\nUPI = Unified Payments Interface — digital payment system (GPay, PhonePe, Paytm, etc.).")
        )}
        accessibilityRole="button"
        accessibilityLabel={t("bnpl.jargonHelpAccessibility", "Tap to learn what BNPL, UTR, and UPI mean")}
      >
        <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
        <Text style={styles.jargonHelpText}>
          {t("bnpl.jargonHelpLabel", "What is BNPL, UTR, UPI?")}
        </Text>
      </Pressable>

      {/* Summary Card */}
      {summary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{t("bnpl.outstanding")}</Text>
              <Text style={styles.summaryValueLarge}>
                {formatMoney(summary.totalOutstanding)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{t("bnpl.availableCredit")}</Text>
              <Text style={styles.summaryValue}>{formatMoney(summary.availableCredit)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{t("bnpl.creditLimit")}</Text>
              <Text style={styles.summaryValue}>{formatMoney(summary.creditLimit)}</Text>
            </View>
          </View>
          <View style={styles.creditBar}>
            <View
              style={[
                styles.creditUsed,
                {
                  // UIUX-POS-008: Guard against division by zero when creditLimit is 0
                  width: `${summary.creditLimit > 0 ? Math.min(
                    100,
                    ((summary.creditLimit - summary.availableCredit) / summary.creditLimit) * 100
                  ) : 0}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.creditHint}>
            {/* UIUX-POS-008: Guard against division by zero */}
            {t("bnpl.creditUsed", { percent: summary.creditLimit > 0 ? Math.round(
              ((summary.creditLimit - summary.availableCredit) / summary.creditLimit) * 100
            ) : 0 })}
          </Text>
        </View>
      )}

      {/* Content */}
      {/* T-109: Branded empty state */}
      {isEmpty ? (
        <EmptyState
          icon="check-circle-outline"
          title={t("bnpl.noOutstandingDues")}
          description={t("bnpl.allDuesPaid")}
        />
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
          }
        >
          <Text style={styles.sectionTitle}>
            {t("bnpl.activeDuesCount", { count: drawdowns.length })}
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
            <Pressable accessibilityLabel="Close" accessibilityRole="button" style={styles.closeButton} onPress={handleClosePaymentModal}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t("bnpl.payBnplDue")}</Text>
            <View style={styles.headerRight} />
          </View>

          {paymentModal.drawdown && (
            <View style={styles.modalContent}>
              {/* T-153: Editable payment amount with remaining balance display */}
              <View style={styles.paymentAmountCard}>
                <Text style={styles.paymentAmountLabel}>{t("bnpl.amountToPay")}</Text>
                <View style={styles.partialPayInputRow}>
                  <Text style={styles.partialPayCurrency}>₹</Text>
                  <TextInput
                    style={styles.partialPayInput}
                    value={paymentModal.payAmountText ?? (paymentModal.drawdown.principalMinor / 100).toFixed(2)}
                    onChangeText={(text) => {
                      if (/^\d*\.?\d{0,2}$/.test(text) || text === "") {
                        setPaymentModal((prev) => ({
                          ...prev,
                          payAmountText: text,
                        }));
                      }
                    }}
                    keyboardType="decimal-pad"
                    placeholder={(paymentModal.drawdown.principalMinor / 100).toFixed(2)}
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <Text style={styles.paymentAmountHint}>
                  {t("bnpl.fullBalance", { amount: formatMoney(paymentModal.drawdown.principalMinor) })}
                  {paymentModal.drawdown.paidAmountMinor > 0 &&
                    ` (${t("bnpl.alreadyPaid")}: ${formatMoney(paymentModal.drawdown.paidAmountMinor)})`}
                </Text>
                <Text style={styles.paymentSupplier}>
                  {paymentModal.drawdown.supplierName}
                </Text>
              </View>

              {/* Payment mode selection */}
              {!paymentModal.mode && (
                <View style={styles.modeSelection}>
                  <Text style={styles.modeLabel}>{t("bnpl.selectPaymentMode")}</Text>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.modeButton}
                    onPress={() => handleSelectPaymentMode("UPI")}
                    disabled={paymentModal.paying}
                  >
                    <MaterialCommunityIcons
                      name="qrcode"
                      size={24}
                      color={colors.primary}
                    />
                    <Text style={styles.modeButtonText}>{t("bnpl.payViaUpi")}</Text>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={colors.textTertiary}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.modeButton}
                    onPress={() => handleSelectPaymentMode("CASH")}
                    disabled={paymentModal.paying}
                  >
                    <MaterialCommunityIcons
                      name="cash"
                      size={24}
                      color={colors.success}
                    />
                    <Text style={styles.modeButtonText}>{t("bnpl.payWithCash")}</Text>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={colors.textTertiary}
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
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.pollingStatusText}>
                        {paymentModal.pollingStatus || t("bnpl.waitingForPayment")}
                      </Text>
                    </View>
                  )}

                  <Text style={styles.upiInstructions}>
                    {paymentModal.isPolling
                      ? t("bnpl.upiInstructionsPolling")
                      : t("bnpl.upiInstructionsManual")}
                  </Text>

                  {/* Manual UTR entry - shown when not polling or as fallback */}
                  {!paymentModal.isPolling && (
                    <>
                      <View style={styles.manualEntryDivider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>{t("bnpl.orEnterManually")}</Text>
                        <View style={styles.dividerLine} />
                      </View>
                      <TextInput
                        style={styles.utrInput}
                        placeholder={t("bnpl.utrPlaceholder")}
                        placeholderTextColor={colors.textTertiary}
                        value={paymentModal.utrInput}
                        onChangeText={(text) =>
                          setPaymentModal((prev) => ({ ...prev, utrInput: text }))
                        }
                        autoCapitalize="characters"
                      />
                      <Pressable
                        accessibilityRole="button"
                        style={[
                          styles.confirmButton,
                          (!paymentModal.utrInput || paymentModal.paying) &&
                            styles.confirmButtonDisabled,
                        ]}
                        onPress={handleConfirmUpiPayment}
                        disabled={!paymentModal.utrInput || paymentModal.paying}
                      >
                        {paymentModal.paying ? (
                          <ActivityIndicator size="small" color={colors.textInverse} />
                        ) : (
                          <>
                            <MaterialCommunityIcons
                              name="check"
                              size={18}
                              color={colors.textInverse}
                            />
                            <Text style={styles.confirmButtonText}>{t("bnpl.confirmPayment")}</Text>
                          </>
                        )}
                      </Pressable>
                    </>
                  )}

                  {paymentModal.upiDeepLink && (
                    <Pressable
                      accessibilityRole="button"
                      style={styles.reopenUpiButton}
                      onPress={async () => {
                        // ISSUE-097: Guard Linking.openURL against crash
                        if (paymentModal.upiDeepLink) {
                          try {
                            await Linking.openURL(paymentModal.upiDeepLink);
                          } catch {
                            Alert.alert(t("bnpl.upiUnavailable"), t("bnpl.upiUnavailableMessage"));
                          }
                        }
                      }}
                    >
                      <MaterialCommunityIcons
                        name="refresh"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={styles.reopenUpiText}>{t("bnpl.reopenUpiApp")}</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {paymentModal.paying && !paymentModal.repaymentId && (
                <View style={styles.processingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.processingText}>{t("bnpl.processingPayment")}</Text>
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
            <Pressable accessibilityLabel="Close" accessibilityRole="button" style={styles.closeButton} onPress={handleCloseDisputeModal}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t("bnpl.disputeCharge")}</Text>
            <View style={styles.headerRight} />
          </View>

          {disputeModal.drawdown && (
            <ScrollView style={styles.modalContent}>
              {/* Dispute info */}
              <View style={styles.disputeInfoCard}>
                <Text style={styles.disputeInfoLabel}>{t("bnpl.order")}</Text>
                <Text style={styles.disputeInfoValue}>
                  {disputeModal.drawdown.orderNumber ?? `PO-${disputeModal.drawdown.id.slice(0, 8)}`}
                </Text>
                <Text style={styles.disputeInfoLabel}>{t("bnpl.amount")}</Text>
                <Text style={styles.disputeInfoValue}>
                  {formatMoney(disputeModal.drawdown.principalMinor)}
                </Text>
              </View>

              {/* Reason selection */}
              <Text style={styles.disputeReasonLabel}>{t("bnpl.selectReasonForDispute")}</Text>
              {[
                { id: "wrong_amount", label: t("bnpl.reasonWrongAmount") },
                { id: "not_received", label: t("bnpl.reasonNotReceived") },
                { id: "defective", label: t("bnpl.reasonDefective") },
                { id: "already_paid", label: t("bnpl.reasonAlreadyPaid") },
                { id: "other", label: t("bnpl.reasonOther") },
              ].map((reason) => (
                <Pressable
                  accessibilityRole="radio"
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
                    color={disputeModal.reason === reason.id ? colors.primary : colors.textTertiary}
                  />
                  <Text style={styles.disputeReasonText}>{reason.label}</Text>
                </Pressable>
              ))}

              {/* Description */}
              <Text style={styles.disputeDescLabel}>{t("bnpl.additionalDetails")}</Text>
              <TextInput
                style={styles.disputeDescInput}
                value={disputeModal.description}
                onChangeText={(text) => setDisputeModal((prev) => ({ ...prev, description: text }))}
                placeholder={t("bnpl.describeIssue")}
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={4}
              />

              {/* Submit button */}
              <Pressable
                accessibilityRole="button"
                style={[styles.disputeSubmitButton, !disputeModal.reason && styles.buttonDisabled]}
                onPress={handleSubmitDispute}
                disabled={!disputeModal.reason || disputeModal.submitting}
              >
                {disputeModal.submitting ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.disputeSubmitText}>{t("bnpl.submitDispute")}</Text>
                )}
              </Pressable>

              <Text style={styles.disputeNote}>
                {t("bnpl.disputeReviewNote")}
              </Text>

              {/* STG-464: Dispute Audit Trail */}
              {disputeHistoryLoading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: theme.spacing.md }} />
              ) : disputeHistory.length > 0 ? (
                <View style={styles.disputeAuditTrail}>
                  <Text style={styles.disputeAuditTitle}>
                    {t("bnpl.previousDisputes", "Previous Disputes")}
                  </Text>
                  {disputeHistory.map((d) => (
                    <View key={d.id} style={styles.disputeAuditItem}>
                      <View style={styles.disputeAuditHeader}>
                        <Text style={styles.disputeAuditReason}>{d.reason}</Text>
                        <Text style={[styles.disputeAuditStatus, {
                          color: d.status === 'resolved' ? colors.success : d.status === 'rejected' ? colors.error : colors.warning,
                        }]}>
                          {d.status.toUpperCase()}
                        </Text>
                      </View>
                      {d.description && (
                        <Text style={styles.disputeAuditDescription} numberOfLines={2}>{d.description}</Text>
                      )}
                      <Text style={styles.disputeAuditDate}>
                        {new Date(d.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                      {d.resolutionNote && (
                        <Text style={styles.disputeAuditResolution}>
                          {t("bnpl.resolution", "Resolution")}: {d.resolutionNote}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.textPrimary,
  },
  headerRight: {
    width: 40,
  },
  // STG-283: Jargon help bar styles
  jargonHelpBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.accentSoft,
  },
  jargonHelpText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "500",
  },
  summaryCard: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.border,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  summaryValueLarge: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.warning,
  },
  creditBar: {
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 3,
    marginTop: theme.spacing.md,
    overflow: "hidden",
  },
  creditUsed: {
    height: "100%",
    backgroundColor: colors.warning,
    borderRadius: 3,
  },
  creditHint: {
    fontSize: 12,
    color: colors.textTertiary,
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
    color: colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  drawdownCard: {
    backgroundColor: colors.surface,
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
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  statusText: {
    fontSize: 12,
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
    color: colors.textTertiary,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  amountDue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  overdueDate: {
    color: colors.error,
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
    backgroundColor: colors.primary,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  payButtonOverdue: {
    backgroundColor: colors.error,
  },
  payButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textInverse,
  },
  disputeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.warningSoft,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  disputeButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.warning,
  },
  // GO-LIVE-240: Dispute modal styles
  disputeInfoCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  disputeInfoLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  disputeInfoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  disputeReasonLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
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
    borderColor: colors.border,
    marginBottom: theme.spacing.sm,
  },
  disputeReasonOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.accentSoft,
  },
  disputeReasonText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  disputeDescLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  disputeDescInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: "top",
  },
  disputeSubmitButton: {
    backgroundColor: colors.warning,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.lg,
  },
  disputeSubmitText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textInverse,
  },
  disputeNote: {
    fontSize: 12,
    color: colors.textTertiary,
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
    color: colors.textPrimary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: "center",
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.textPrimary,
  },
  modalContent: {
    padding: theme.spacing.md,
  },
  paymentAmountCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  paymentAmountLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  paymentAmountValue: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.accent,
  },
  // T-153: Partial payment input styles
  partialPayInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: theme.spacing.sm,
  },
  partialPayCurrency: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.accent,
    marginRight: 4,
  },
  partialPayInput: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.accent,
    minWidth: 100,
    textAlign: "center",
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical: 4,
  },
  paymentAmountHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  paymentSupplier: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  modeSelection: {
    gap: theme.spacing.md,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: theme.spacing.md,
  },
  modeButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  upiConfirmSection: {
    gap: theme.spacing.md,
  },
  upiInstructions: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  utrInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  confirmButtonDisabled: {
    backgroundColor: colors.textTertiary,
    opacity: 0.6,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textInverse,
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
    color: colors.primary,
    fontWeight: "500",
  },
  processingContainer: {
    alignItems: "center",
    padding: theme.spacing.xl,
  },
  processingText: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  // GL-RJ-008: Auto-polling styles
  pollingStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    backgroundColor: colors.accentSoft,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  pollingStatusText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.primary,
  },
  manualEntryDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: theme.spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    paddingHorizontal: theme.spacing.sm,
    fontSize: 12,
    color: colors.textTertiary,
  },
  // STG-463: Overdue visual hierarchy styles
  overdueBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.error,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    marginHorizontal: -theme.spacing.md,
    marginTop: -theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  overdueBannerText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textInverse,
  },
  // STG-464: Dispute audit trail styles
  disputeAuditTrail: {
    marginTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: theme.spacing.md,
  },
  disputeAuditTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  disputeAuditItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  disputeAuditHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  disputeAuditReason: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  disputeAuditStatus: {
    fontSize: 11,
    fontWeight: "700",
  },
  disputeAuditDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  disputeAuditDate: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 4,
  },
  disputeAuditResolution: {
    fontSize: 12,
    color: colors.success,
    fontWeight: "500",
    marginTop: 4,
    fontStyle: "italic",
  },
}); }

export default BnplDuesScreen;
