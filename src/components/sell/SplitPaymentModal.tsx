// SM-015: Split Payment Modal
// Allows splitting a payment between UPI and Cash

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { formatMoney } from "../../utils/money";
import {
  createSplitPayment,
  confirmSplitCash,
  SplitPaymentResponse,
} from "../../services/api/posApi";
import { theme } from "../../theme";

interface SplitPaymentModalProps {
  visible: boolean;
  totalAmountMinor: number;
  currency: string;
  saleId: string;
  onClose: () => void;
  onComplete: () => void;
}

type SplitStep = "input" | "upi-waiting" | "cash-collect" | "complete";

export function SplitPaymentModal({
  visible,
  totalAmountMinor,
  currency,
  saleId,
  onClose,
  onComplete,
}: SplitPaymentModalProps) {
  const [step, setStep] = useState<SplitStep>("input");
  const [upiAmount, setUpiAmount] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [splitResponse, setSplitResponse] = useState<SplitPaymentResponse | null>(null);
  const [upiCompleted, setUpiCompleted] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setStep("input");
      setUpiAmount("");
      setCashAmount("");
      setLoading(false);
      setSplitResponse(null);
      setUpiCompleted(false);
    }
  }, [visible]);

  // Auto-calculate remaining amount
  const upiMinor = Math.round(parseFloat(upiAmount || "0") * 100);
  const cashMinor = Math.round(parseFloat(cashAmount || "0") * 100);
  const remaining = totalAmountMinor - upiMinor - cashMinor;
  const isValid = remaining === 0 && upiMinor > 0 && cashMinor > 0;

  const handleUpiChange = (value: string) => {
    // Only allow valid decimal input
    if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
      setUpiAmount(value);
      // Auto-calculate cash if UPI is entered
      const upi = Math.round(parseFloat(value || "0") * 100);
      if (upi > 0 && upi < totalAmountMinor) {
        const cashVal = (totalAmountMinor - upi) / 100;
        setCashAmount(cashVal.toFixed(2));
      }
    }
  };

  const handleCashChange = (value: string) => {
    if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
      setCashAmount(value);
      // Auto-calculate UPI if cash is entered
      const cash = Math.round(parseFloat(value || "0") * 100);
      if (cash > 0 && cash < totalAmountMinor) {
        const upiVal = (totalAmountMinor - cash) / 100;
        setUpiAmount(upiVal.toFixed(2));
      }
    }
  };

  const handleProceed = async () => {
    if (!isValid) {
      Alert.alert("Invalid Split", "UPI + Cash must equal the total amount.");
      return;
    }

    setLoading(true);
    try {
      const response = await createSplitPayment({
        saleId,
        payments: [
          { mode: "UPI", amountMinor: upiMinor },
          { mode: "CASH", amountMinor: cashMinor },
        ],
      });

      setSplitResponse(response);
      setStep("upi-waiting");
    } catch (error) {
      Alert.alert("Error", "Failed to create split payment. Please try again.");
      console.error("[SplitPayment] Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpiReceived = useCallback(() => {
    setUpiCompleted(true);
    setStep("cash-collect");
  }, []);

  const handleCashReceived = async () => {
    if (!splitResponse?.cashPayment?.paymentId) {
      Alert.alert("Error", "Cash payment ID not found.");
      return;
    }

    setLoading(true);
    try {
      const result = await confirmSplitCash({
        paymentId: splitResponse.cashPayment.paymentId,
      });

      if (result.saleCompleted) {
        setStep("complete");
        // Brief delay then close
        setTimeout(() => {
          onComplete();
        }, 1000);
      } else {
        Alert.alert("Error", "Sale not completed. Please try again.");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to confirm cash payment.");
      console.error("[SplitPayment] Cash confirm error:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderInputStep = () => (
    <>
      <Text style={styles.title}>Split Payment</Text>
      <Text style={styles.subtitle}>
        Total: {formatMoney(totalAmountMinor, currency)}
      </Text>

      <View style={styles.inputRow}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>UPI Amount</Text>
          <View style={styles.inputWrapper}>
            <Text style={styles.currencyPrefix}>₹</Text>
            <TextInput
              style={styles.input}
              value={upiAmount}
              onChangeText={handleUpiChange}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.colors.textTertiary}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Cash Amount</Text>
          <View style={styles.inputWrapper}>
            <Text style={styles.currencyPrefix}>₹</Text>
            <TextInput
              style={styles.input}
              value={cashAmount}
              onChangeText={handleCashChange}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.colors.textTertiary}
            />
          </View>
        </View>
      </View>

      <View style={styles.remainingRow}>
        <Text style={styles.remainingLabel}>Remaining:</Text>
        <Text
          style={[
            styles.remainingValue,
            remaining === 0 && styles.remainingValid,
            remaining !== 0 && styles.remainingInvalid,
          ]}
        >
          {formatMoney(Math.abs(remaining), currency)}
          {remaining < 0 ? " (over)" : remaining > 0 ? " (short)" : " ✓"}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.proceedBtn, !isValid && styles.btnDisabled]}
          onPress={handleProceed}
          disabled={!isValid || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.proceedBtnText}>Proceed</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  const renderUpiWaitingStep = () => (
    <>
      <Text style={styles.title}>Pay with UPI</Text>
      <Text style={styles.subtitle}>
        {formatMoney(upiMinor, currency)} via UPI
      </Text>

      <View style={styles.qrContainer}>
        {splitResponse?.upiPayment?.qrData ? (
          <QRCode value={splitResponse.upiPayment.qrData} size={200} />
        ) : (
          <Text style={styles.qrPlaceholder}>QR not available</Text>
        )}
      </View>

      <Text style={styles.waitingText}>
        Waiting for UPI payment...
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.proceedBtn} onPress={handleUpiReceived}>
          <Text style={styles.proceedBtnText}>UPI Received</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderCashCollectStep = () => (
    <>
      <View style={styles.successIcon}>
        <MaterialCommunityIcons
          name="check-circle"
          size={48}
          color={theme.colors.success}
        />
      </View>
      <Text style={styles.title}>UPI Payment Complete</Text>
      <Text style={styles.subtitle}>
        Now collect {formatMoney(cashMinor, currency)} in cash
      </Text>

      <View style={styles.cashPrompt}>
        <MaterialCommunityIcons
          name="cash"
          size={64}
          color={theme.colors.success}
        />
        <Text style={styles.cashPromptAmount}>
          {formatMoney(cashMinor, currency)}
        </Text>
        <Text style={styles.cashPromptText}>Collect cash from customer</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.proceedBtn}
          onPress={handleCashReceived}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.proceedBtnText}>Cash Received</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  const renderCompleteStep = () => (
    <>
      <View style={styles.successIcon}>
        <MaterialCommunityIcons
          name="check-circle"
          size={80}
          color={theme.colors.success}
        />
      </View>
      <Text style={styles.title}>Payment Complete!</Text>
      <Text style={styles.subtitle}>
        {formatMoney(upiMinor, currency)} UPI + {formatMoney(cashMinor, currency)} Cash
      </Text>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <MaterialCommunityIcons
              name="close"
              size={24}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>

          {step === "input" && renderInputStep()}
          {step === "upi-waiting" && renderUpiWaitingStep()}
          {step === "cash-collect" && renderCashCollectStep()}
          {step === "complete" && renderCompleteStep()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    ...theme.shadows.lg,
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.textPrimary,
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  inputRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    paddingVertical: 12,
  },
  remainingRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
    paddingVertical: 12,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
  },
  remainingLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  remainingValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  remainingValid: {
    color: theme.colors.success,
  },
  remainingInvalid: {
    color: theme.colors.error,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  proceedBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  proceedBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  btnDisabled: {
    backgroundColor: theme.colors.textTertiary,
  },
  qrContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    marginBottom: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    alignSelf: "center",
  },
  qrPlaceholder: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  waitingText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  successIcon: {
    alignItems: "center",
    marginBottom: 16,
  },
  cashPrompt: {
    alignItems: "center",
    padding: 24,
    backgroundColor: theme.colors.successSoft || "#e6f7ed",
    borderRadius: 16,
    marginBottom: 24,
  },
  cashPromptAmount: {
    fontSize: 32,
    fontWeight: "900",
    color: theme.colors.success,
    marginTop: 12,
  },
  cashPromptText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
});

export default SplitPaymentModal;
