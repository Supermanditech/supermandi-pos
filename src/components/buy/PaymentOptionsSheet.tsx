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

// =============================================================================
// TYPES
// =============================================================================

export type PaymentMode = "UPI" | "BNPL" | "CREDIT" | "COD";

export interface PaymentOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  supplierName: string;
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
    error?: string;
  }>;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PaymentOptionsSheet({
  visible,
  onClose,
  supplierName,
  amount,
  bnplEligible,
  bnplMaxDays,
  creditEligible,
  availableCredit,
  onSelectPayment,
}: PaymentOptionsSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // State
  const [selectedMode, setSelectedMode] = useState<PaymentMode | null>(null);
  const [processing, setProcessing] = useState(false);
  const [upiStep, setUpiStep] = useState<"select" | "confirm">("select");
  const [upiDeepLink, setUpiDeepLink] = useState<string | null>(null);
  const [utrInput, setUtrInput] = useState("");

  // Calculate BNPL due date
  const bnplDueDate = (() => {
    const date = new Date();
    date.setDate(date.getDate() + bnplMaxDays);
    return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  })();

  // Check if credit can cover the amount
  const canUseCredit = creditEligible && availableCredit >= amount * 100;

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
      } catch (error: any) {
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

  // Handle UPI confirmation
  const handleConfirmUpi = useCallback(() => {
    if (!utrInput.trim()) {
      Alert.alert(
        t("payment.enterUtr", "Enter UTR"),
        t("payment.utrRequired", "Please enter the UPI transaction reference.")
      );
      return;
    }
    // For now, just close after confirmation
    // In production, this would verify the UTR with the backend
    Alert.alert(
      t("payment.paymentRecorded", "Payment Recorded"),
      t("payment.upiConfirmed", "Your UPI payment has been recorded."),
      [{ text: "OK", onPress: onClose }]
    );
  }, [utrInput, onClose, t]);

  // Handle reopen UPI app
  const handleReopenUpi = useCallback(async () => {
    if (upiDeepLink) {
      const canOpen = await Linking.canOpenURL(upiDeepLink);
      if (canOpen) {
        await Linking.openURL(upiDeepLink);
      }
    }
  }, [upiDeepLink]);

  // Reset state when closing
  const handleClose = useCallback(() => {
    setSelectedMode(null);
    setUpiStep("select");
    setUpiDeepLink(null);
    setUtrInput("");
    onClose();
  }, [onClose]);

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
            <Text style={styles.orderAmount}>{formatMoney(amount * 100)}</Text>
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
            /* UPI Confirmation Step */
            <View style={styles.upiConfirmSection}>
              <Text style={styles.upiInstructions}>
                {t(
                  "payment.upiInstructions",
                  "Complete the payment in your UPI app, then enter the UTR (transaction reference) below to confirm."
                )}
              </Text>

              <TextInput
                style={styles.utrInput}
                placeholder={t("payment.utrPlaceholder", "Enter UTR / Transaction Reference")}
                placeholderTextColor={theme.colors.textTertiary}
                value={utrInput}
                onChangeText={setUtrInput}
                autoCapitalize="characters"
              />

              <Pressable
                style={[styles.confirmButton, !utrInput.trim() && styles.confirmButtonDisabled]}
                onPress={handleConfirmUpi}
                disabled={!utrInput.trim()}
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
