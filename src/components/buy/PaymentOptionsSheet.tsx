// SM-025: PaymentOptionsSheet
// Bottom sheet for selecting payment method after placing order

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { theme } from "../../theme";
import { formatMoney } from "../../utils/money";
import { verifyUtr } from "../../services/api/posApi";
// T-127: Modal back handler for Android hardware back button
import { useModalBackHandler } from "../../hooks/useModalBackHandler";
import { asError } from "../../utils/errorUtils";

// =============================================================================
// TYPES
// =============================================================================

// T-157: Added BANK_TRANSFER for NEFT/RTGS/IMPS supplier payments
export type PaymentMode = "UPI" | "BNPL" | "CREDIT" | "COD" | "BANK_TRANSFER";

export interface PaymentOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  supplierName: string;
  supplierId: string; // GL-RJ-003: Added for tracking
  amount: number; // Amount in rupees
  // Payment eligibility
  bnplEligible: boolean;
  bnplMaxDays: number;
  creditEligible: boolean;
  availableCredit: number; // Available credit in minor units (paise)
  // Callbacks
  onSelectPayment: (mode: PaymentMode) => Promise<{
    success: boolean;
    upiDeepLink?: string;
    orderId?: string;
    error?: string;
  }>;
  // GL-RJ-003: UPI payment confirmation callbacks
  onUpiPaymentConfirmed?: (supplierId: string, utr: string) => void;
  onUpiPaymentCancelled?: (supplierId: string, orderId: string) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PaymentOptionsSheet({
  visible,
  onClose,
  supplierName,
  supplierId,
  amount,
  bnplEligible,
  bnplMaxDays,
  creditEligible,
  availableCredit,
  onSelectPayment,
  onUpiPaymentConfirmed,
  onUpiPaymentCancelled,
}: PaymentOptionsSheetProps) {
  // T-127: Close modal on Android hardware back button
  useModalBackHandler(visible, onClose);

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // State
  const [selectedMode, setSelectedMode] = useState<PaymentMode | null>(null);
  const [processing, setProcessing] = useState(false);
  const [upiStep, setUpiStep] = useState<"select" | "confirm">("select");
  const [upiDeepLink, setUpiDeepLink] = useState<string | null>(null);
  const [utrInput, setUtrInput] = useState("");
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null); // GL-RJ-003: Track pending order
  const [verifying, setVerifying] = useState(false); // GL-RJ-004: UTR verification state
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "verified" | "failed">("idle");

  // Calculate BNPL due date
  const bnplDueDate = (() => {
    const date = new Date();
    date.setDate(date.getDate() + bnplMaxDays);
    return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  })();

  // POS-CREDIT-002: Credit feature is disabled for MVP (mock KYC only).
  // Override creditEligible to false regardless of what the caller passes.
  const creditFeatureEnabled = false; // Hardcoded off until real KYC integration
  const canUseCredit = creditFeatureEnabled && creditEligible && availableCredit >= amount * 100;

  // Handle payment selection
  const handleSelectPayment = useCallback(
    async (mode: PaymentMode) => {
      setSelectedMode(mode);
      setProcessing(true);

      try {
        const result = await onSelectPayment(mode);

        if (result.success) {
          if (mode === "UPI" && result.upiDeepLink) {
            setUpiDeepLink(result.upiDeepLink);
            setPendingOrderId(result.orderId || null); // GL-RJ-003: Store order ID
            setUpiStep("confirm");
            // Try to open UPI app
            const canOpen = await Linking.canOpenURL(result.upiDeepLink);
            if (canOpen) {
              await Linking.openURL(result.upiDeepLink);
            }
          } else {
            // Order placed successfully with BNPL, Credit, or COD
            onClose();
          }
        } else {
          Alert.alert(
            t("payment.error", "Payment Error"),
            result.error || t("payment.genericError", "Something went wrong. Please try again.")
          );
          setSelectedMode(null);
        }
      } catch (_error: unknown) {
    const error = asError(_error);
        console.error("[PaymentOptionsSheet] Payment error:", error);
        Alert.alert(
          t("payment.error", "Payment Error"),
          error.message || t("payment.genericError", "Something went wrong. Please try again.")
        );
        setSelectedMode(null);
      } finally {
        setProcessing(false);
      }
    },
    [onSelectPayment, onClose, t]
  );

  // GL-RJ-004: Verify UTR with backend before confirming
  const handleVerifyUtr = useCallback(async () => {
    if (!utrInput.trim()) {
      Alert.alert(
        t("payment.enterUtr", "Enter UTR"),
        t("payment.utrRequired", "Please enter the UPI transaction reference.")
      );
      return;
    }

    setVerifying(true);
    setVerificationStatus("idle");

    try {
      const result = await verifyUtr({
        utr: utrInput.trim(),
        amountMinor: amount * 100, // Convert to paise
      });

      if (result.verified && result.status === "SUCCESS") {
        setVerificationStatus("verified");
      } else if (result.status === "PENDING") {
        // Payment still processing
        Alert.alert(
          t("payment.verificationPending", "Verification Pending"),
          t("payment.utrPending", "The payment is still being processed. Please wait a moment and try again.")
        );
        setVerificationStatus("idle");
      } else {
        setVerificationStatus("failed");
        Alert.alert(
          t("payment.verificationFailed", "Verification Failed"),
          result.errorMessage || t("payment.utrNotFound", "Could not verify this UTR. Please check and try again.")
        );
      }
    } catch (_error: unknown) {
    const error = asError(_error);
      console.error("[PaymentOptionsSheet] UTR verification error:", error);
      setVerificationStatus("failed");
      Alert.alert(
        t("payment.verificationError", "Verification Error"),
        error.message || t("payment.verificationGenericError", "Could not verify payment. Please try again.")
      );
    } finally {
      setVerifying(false);
    }
  }, [utrInput, amount, t]);

  // Handle UPI confirmation - GL-RJ-003/GL-RJ-004: Verify UTR, then notify parent to clear cart
  const handleConfirmUpi = useCallback(() => {
    if (!utrInput.trim()) {
      Alert.alert(
        t("payment.enterUtr", "Enter UTR"),
        t("payment.utrRequired", "Please enter the UPI transaction reference.")
      );
      return;
    }

    // GL-RJ-004: Only allow confirmation if UTR is verified
    if (verificationStatus !== "verified") {
      Alert.alert(
        t("payment.verifyFirst", "Verify First"),
        t("payment.pleaseVerifyUtr", "Please verify the UTR before confirming the payment.")
      );
      return;
    }

    // GL-RJ-003: Notify parent that UPI payment is confirmed
    // Parent will then clear cart items for this supplier
    onUpiPaymentConfirmed?.(supplierId, utrInput.trim());

    // Reset state and close
    setSelectedMode(null);
    setUpiStep("select");
    setUpiDeepLink(null);
    setUtrInput("");
    setPendingOrderId(null);
    setVerificationStatus("idle");
    onClose();
  }, [utrInput, verificationStatus, onClose, t, supplierId, onUpiPaymentConfirmed]);

  // Handle reopen UPI app
  const handleReopenUpi = useCallback(async () => {
    if (upiDeepLink) {
      const canOpen = await Linking.canOpenURL(upiDeepLink);
      if (canOpen) {
        await Linking.openURL(upiDeepLink);
      }
    }
  }, [upiDeepLink]);

  // Reset state when closing - GL-RJ-003: Handle UPI cancellation
  const handleClose = useCallback(() => {
    // GL-RJ-003: If closing while in UPI confirmation step, notify parent about cancellation
    // This allows parent to handle the abandoned order appropriately
    if (upiStep === "confirm" && pendingOrderId) {
      onUpiPaymentCancelled?.(supplierId, pendingOrderId);
    }

    setSelectedMode(null);
    setUpiStep("select");
    setUpiDeepLink(null);
    setUtrInput("");
    setPendingOrderId(null);
    onClose();
  }, [onClose, upiStep, pendingOrderId, supplierId, onUpiPaymentCancelled]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {t("payment.selectPaymentMethod", "Select Payment Method")}
            </Text>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <MaterialCommunityIcons name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          {/* Order Summary */}
          <View style={styles.orderSummary}>
            <Text style={styles.supplierName}>{supplierName}</Text>
            <Text style={styles.orderAmount}>{formatMoney(amount)}</Text>
          </View>

          {upiStep === "select" ? (
            /* Payment Options */
            <View style={styles.options}>
              {/* UPI Option */}
              <Pressable
                style={[
                  styles.optionCard,
                  selectedMode === "UPI" && styles.optionCardSelected,
                ]}
                onPress={() => handleSelectPayment("UPI")}
                disabled={processing}
              >
                <View style={[styles.optionIcon, { backgroundColor: theme.colors.primarySoft }]}>
                  <MaterialCommunityIcons name="qrcode" size={24} color={theme.colors.primary} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>
                    {t("payment.payNowUpi", "Pay Now (UPI)")}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {t("payment.upiDescription", "Pay instantly via UPI app")}
                  </Text>
                </View>
                {processing && selectedMode === "UPI" ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textTertiary} />
                )}
              </Pressable>

              {/* BNPL Option */}
              {bnplEligible && (
                <Pressable
                  style={[
                    styles.optionCard,
                    selectedMode === "BNPL" && styles.optionCardSelected,
                  ]}
                  onPress={() => handleSelectPayment("BNPL")}
                  disabled={processing}
                >
                  <View style={[styles.optionIcon, { backgroundColor: theme.colors.accentSoft }]}>
                    <MaterialCommunityIcons name="clock-outline" size={24} color={theme.colors.accent} />
                  </View>
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>
                      {t("payment.bnpl", "BNPL")} ({t("payment.payBy", "Pay by")} {bnplDueDate})
                    </Text>
                    <Text style={styles.optionDescription}>
                      {t("payment.bnplDescription", "Pay later within {{days}} days", { days: bnplMaxDays })}
                    </Text>
                  </View>
                  {processing && selectedMode === "BNPL" ? (
                    <ActivityIndicator size="small" color={theme.colors.accent} />
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textTertiary} />
                  )}
                </Pressable>
              )}

              {/* Credit Option */}
              {creditEligible && (
                <Pressable
                  style={[
                    styles.optionCard,
                    !canUseCredit && styles.optionCardDisabled,
                    selectedMode === "CREDIT" && styles.optionCardSelected,
                  ]}
                  onPress={() => canUseCredit && handleSelectPayment("CREDIT")}
                  disabled={processing || !canUseCredit}
                >
                  <View style={[styles.optionIcon, { backgroundColor: theme.colors.successSoft }]}>
                    <MaterialCommunityIcons name="bank-outline" size={24} color={theme.colors.success} />
                  </View>
                  <View style={styles.optionContent}>
                    <Text style={[styles.optionTitle, !canUseCredit && styles.optionTitleDisabled]}>
                      {t("payment.useCredit", "Use Credit")}
                    </Text>
                    <Text style={[styles.optionDescription, !canUseCredit && styles.optionDescriptionDisabled]}>
                      {canUseCredit
                        ? t("payment.creditAvailable", "Available: {{amount}}", {
                            amount: formatMoney(availableCredit),
                          })
                        : t("payment.insufficientCredit", "Insufficient credit balance")}
                    </Text>
                  </View>
                  {processing && selectedMode === "CREDIT" ? (
                    <ActivityIndicator size="small" color={theme.colors.success} />
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textTertiary} />
                  )}
                </Pressable>
              )}

              {/* T-157: Bank Transfer Option */}
              <Pressable
                style={[
                  styles.optionCard,
                  selectedMode === "BANK_TRANSFER" && styles.optionCardSelected,
                ]}
                onPress={() => handleSelectPayment("BANK_TRANSFER")}
                disabled={processing}
              >
                <View style={[styles.optionIcon, { backgroundColor: "#EFF6FF" }]}>
                  <MaterialCommunityIcons name="bank-transfer" size={24} color="#2563EB" />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>
                    {t("payment.bankTransfer", "Bank Transfer (NEFT/RTGS)")}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {t("payment.bankTransferDescription", "Pay via bank transfer, mark as paid later")}
                  </Text>
                </View>
                {processing && selectedMode === "BANK_TRANSFER" ? (
                  <ActivityIndicator size="small" color="#2563EB" />
                ) : (
                  <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textTertiary} />
                )}
              </Pressable>

              {/* COD Option */}
              <Pressable
                style={[
                  styles.optionCard,
                  selectedMode === "COD" && styles.optionCardSelected,
                ]}
                onPress={() => handleSelectPayment("COD")}
                disabled={processing}
              >
                <View style={[styles.optionIcon, { backgroundColor: theme.colors.warningSoft }]}>
                  <MaterialCommunityIcons name="cash" size={24} color={theme.colors.warning} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>
                    {t("payment.cod", "Cash on Delivery")}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {t("payment.codDescription", "Pay when goods are delivered")}
                  </Text>
                </View>
                {processing && selectedMode === "COD" ? (
                  <ActivityIndicator size="small" color={theme.colors.warning} />
                ) : (
                  <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textTertiary} />
                )}
              </Pressable>
            </View>
          ) : (
            /* UPI Confirmation Step - GL-RJ-004: Added UTR verification */
            <View style={styles.upiConfirmSection}>
              <Text style={styles.upiInstructions}>
                {t(
                  "payment.upiInstructions",
                  "Complete the payment in your UPI app, then enter the UTR (transaction reference) below and verify."
                )}
              </Text>

              {/* UTR Input with verification status */}
              <View style={styles.utrInputRow}>
                <TextInput
                  style={[
                    styles.utrInput,
                    styles.utrInputFlex,
                    verificationStatus === "verified" && styles.utrInputVerified,
                    verificationStatus === "failed" && styles.utrInputFailed,
                  ]}
                  placeholder={t("payment.utrPlaceholder", "Enter UTR / Transaction Reference")}
                  placeholderTextColor={theme.colors.textTertiary}
                  value={utrInput}
                  onChangeText={(text) => {
                    setUtrInput(text);
                    // Reset verification when UTR changes
                    if (verificationStatus !== "idle") {
                      setVerificationStatus("idle");
                    }
                  }}
                  autoCapitalize="characters"
                  editable={!verifying}
                />
                {verificationStatus === "verified" && (
                  <View style={styles.verifiedBadge}>
                    <MaterialCommunityIcons name="check-circle" size={20} color={theme.colors.success} />
                  </View>
                )}
              </View>

              {/* Verification status text */}
              {verificationStatus === "verified" && (
                <Text style={styles.verifiedText}>
                  {t("payment.utrVerified", "UTR verified successfully")}
                </Text>
              )}
              {verificationStatus === "failed" && (
                <Text style={styles.failedText}>
                  {t("payment.utrVerificationFailed", "Verification failed. Check UTR and try again.")}
                </Text>
              )}

              {/* Verify button - GL-RJ-004 */}
              {verificationStatus !== "verified" && (
                <Pressable
                  style={[styles.verifyButton, (!utrInput.trim() || verifying) && styles.verifyButtonDisabled]}
                  onPress={handleVerifyUtr}
                  disabled={!utrInput.trim() || verifying}
                >
                  {verifying ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="shield-check" size={18} color={theme.colors.primary} />
                      <Text style={styles.verifyButtonText}>
                        {t("payment.verifyPayment", "Verify Payment")}
                      </Text>
                    </>
                  )}
                </Pressable>
              )}

              {/* Confirm button - only enabled after verification */}
              <Pressable
                style={[
                  styles.confirmButton,
                  verificationStatus !== "verified" && styles.confirmButtonDisabled,
                ]}
                onPress={handleConfirmUpi}
                disabled={verificationStatus !== "verified"}
              >
                <MaterialCommunityIcons name="check" size={18} color={theme.colors.textInverse} />
                <Text style={styles.confirmButtonText}>
                  {t("payment.confirmPayment", "Confirm Payment")}
                </Text>
              </Pressable>

              <Pressable style={styles.reopenButton} onPress={handleReopenUpi}>
                <MaterialCommunityIcons name="refresh" size={16} color={theme.colors.primary} />
                <Text style={styles.reopenButtonText}>
                  {t("payment.reopenUpi", "Re-open UPI App")}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.md,
    maxHeight: "80%",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  orderSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surfaceAlt,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  supplierName: {
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.textPrimary,
    flex: 1,
  },
  orderAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  options: {
    gap: theme.spacing.sm,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  optionCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  optionCardDisabled: {
    opacity: 0.5,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  optionTitleDisabled: {
    color: theme.colors.textTertiary,
  },
  optionDescription: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  optionDescriptionDisabled: {
    color: theme.colors.textTertiary,
  },
  upiConfirmSection: {
    gap: theme.spacing.md,
  },
  upiInstructions: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  utrInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  utrInput: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  utrInputFlex: {
    flex: 1,
  },
  utrInputVerified: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successSoft,
  },
  utrInputFailed: {
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.errorSoft,
  },
  verifiedBadge: {
    marginLeft: theme.spacing.sm,
  },
  verifiedText: {
    fontSize: 13,
    color: theme.colors.success,
    fontWeight: "500",
  },
  failedText: {
    fontSize: 13,
    color: theme.colors.error,
    fontWeight: "500",
  },
  verifyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  verifyButtonDisabled: {
    borderColor: theme.colors.textTertiary,
    opacity: 0.6,
  },
  verifyButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.primary,
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
  reopenButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  reopenButtonText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: "500",
  },
});

export default PaymentOptionsSheet;
