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
  Keyboard,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { formatMoney } from "../../utils/money";
import {
  createSplitPayment,
  confirmSplitCash,
  getSplitPaymentStatus,
  verifyUtr,
  SplitPaymentResponse,
} from "../../services/api/posApi";
import { theme } from "../../theme";
// T-127: Modal back handler for Android hardware back button
import { useModalBackHandler } from "../../hooks/useModalBackHandler";

export interface SplitPaymentResult {
  success: boolean;
  paymentStatus: 'completed' | 'failed' | 'pending';
  upiVerified: boolean;
  cashConfirmed: boolean;
  errorMessage?: string;
}

interface SplitPaymentModalProps {
  visible: boolean;
  totalAmountMinor: number;
  currency: string;
  saleId: string;
  onClose: () => void;
  onComplete: (result: SplitPaymentResult) => void;
}

// T-152: Three-way split payment support (UPI + CASH + DUE, any 2-3 combination)
type SplitStep = "input" | "upi-waiting" | "cash-collect" | "complete";
type SplitMethod = "UPI" | "CASH" | "DUE";

export function SplitPaymentModal({
  visible,
  totalAmountMinor,
  currency,
  saleId,
  onClose,
  onComplete,
}: SplitPaymentModalProps) {
  // T-127: Close modal on Android hardware back button
  useModalBackHandler(visible, onClose);

  const [step, setStep] = useState<SplitStep>("input");
  const [upiAmount, setUpiAmount] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  // T-152: DUE amount for three-way split
  const [dueAmount, setDueAmount] = useState("");
  // T-152: Track which methods are selected (min 2, max 3)
  const [selectedMethods, setSelectedMethods] = useState<Set<SplitMethod>>(
    new Set(["UPI", "CASH"])
  );
  const [loading, setLoading] = useState(false);
  const [verifyingUpi, setVerifyingUpi] = useState(false);
  const [splitResponse, setSplitResponse] = useState<SplitPaymentResponse | null>(null);
  const [upiCompleted, setUpiCompleted] = useState(false);
  const [upiVerified, setUpiVerified] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [manualUtrVisible, setManualUtrVisible] = useState(false);
  const [manualUtr, setManualUtr] = useState("");
  const pollIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // T-204: QR expiry countdown for split UPI
  const [splitQrSecondsLeft, setSplitQrSecondsLeft] = useState<number | null>(null);

  // T-152: Toggle a payment method on/off
  const toggleMethod = (method: SplitMethod) => {
    setSelectedMethods((prev) => {
      const next = new Set(prev);
      if (next.has(method)) {
        // Must keep at least 2 methods selected
        if (next.size <= 2) return prev;
        next.delete(method);
        // Clear the amount for deselected method
        if (method === "UPI") setUpiAmount("");
        if (method === "CASH") setCashAmount("");
        if (method === "DUE") setDueAmount("");
      } else {
        // Max 3 methods
        if (next.size >= 3) return prev;
        next.add(method);
      }
      return next;
    });
  };

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setStep("input");
      setUpiAmount("");
      setCashAmount("");
      setDueAmount("");
      setSelectedMethods(new Set(["UPI", "CASH"]));
      setLoading(false);
      setVerifyingUpi(false);
      setSplitResponse(null);
      setUpiCompleted(false);
      setUpiVerified(false);
      setPollingActive(false);
      setPollCount(0);
      setManualUtrVisible(false);
      setManualUtr("");
    }
    // FIX-035: Dismiss keyboard + cleanup polling on close/unmount
    return () => {
      Keyboard.dismiss();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [visible]);

  // T-204: QR expiry countdown for split UPI
  useEffect(() => {
    const expiresAt = splitResponse?.upiPayment?.expiresAt;
    if (!expiresAt || step !== "upi-waiting") {
      setSplitQrSecondsLeft(null);
      return;
    }
    const expiryMs = new Date(expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiryMs - Date.now()) / 1000));
      setSplitQrSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [splitResponse?.upiPayment?.expiresAt, step]);

  // GL-RJ-001: Auto-poll for UPI payment status when in upi-waiting step
  useEffect(() => {
    if (step === "upi-waiting" && saleId && !upiVerified && !pollingActive) {
      setPollingActive(true);
      setPollCount(0);

      const pollStatus = async () => {
        try {
          const status = await getSplitPaymentStatus({ saleId });

          if (status.upiStatus === 'completed' || status.upiStatus === 'COMPLETED') {
            // Payment completed - stop polling and proceed
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setPollingActive(false);
            setUpiCompleted(true);
            setUpiVerified(true);
            setStep("cash-collect");
          } else {
            // Still pending - increment counter
            setPollCount((prev) => prev + 1);
          }
        } catch (error) {
          console.warn("[SplitPayment] Poll error:", error);
          // Don't stop polling on transient errors
        }
      };

      // Initial check
      void pollStatus();

      // POS-PAY-001: Increased to 40 attempts (~5+ min with exponential backoff)
      // GO-LIVE-125: Exponential backoff polling (2s, 4s, 8s, 16s, capped at 30s)
      // R10: Wall-clock guard — stop polling after 5 minutes regardless of attempt count
      let currentAttempt = 0;
      const maxAttempts = 40;
      const baseDelay = 2000;
      const maxDelay = 30000;
      const pollStartTime = Date.now();
      const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes

      const scheduleNextPoll = () => {
        if (currentAttempt >= maxAttempts || Date.now() - pollStartTime > MAX_POLL_DURATION_MS) {
          setPollingActive(false);
          setManualUtrVisible(true);
          return;
        }
        // Exponential backoff: 2^attempt * baseDelay, capped at maxDelay
        const delay = Math.min(Math.pow(2, currentAttempt) * baseDelay, maxDelay);
        currentAttempt++;
        setPollCount(currentAttempt);
        // POS-PAY-001: Show manual UTR fallback after 10 failed polls
        if (currentAttempt >= 10) {
          setManualUtrVisible(true);
        }

        pollIntervalRef.current = setTimeout(() => {
          void pollStatus().then(() => {
            // Only schedule next poll if still in upi-waiting step
            if (step === "upi-waiting" && !upiVerified) {
              scheduleNextPoll();
            }
          });
        }, delay) as unknown as ReturnType<typeof setInterval>;
      };

      scheduleNextPoll();
    }

    // ISSUE-140: Always clear polling on cleanup (not conditional on step)
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        setPollingActive(false);
      }
    };
  }, [step, saleId, upiVerified, pollingActive]);

  // T-152: Auto-calculate remaining amount across all selected methods
  const upiMinor = selectedMethods.has("UPI") ? Math.round(parseFloat(upiAmount || "0") * 100) : 0;
  const cashMinor = selectedMethods.has("CASH") ? Math.round(parseFloat(cashAmount || "0") * 100) : 0;
  const dueMinor = selectedMethods.has("DUE") ? Math.round(parseFloat(dueAmount || "0") * 100) : 0;
  const remaining = totalAmountMinor - upiMinor - cashMinor - dueMinor;

  // Validate: all selected methods must have >0 amounts and total must match
  const isValid =
    remaining === 0 &&
    (!selectedMethods.has("UPI") || upiMinor > 0) &&
    (!selectedMethods.has("CASH") || cashMinor > 0) &&
    (!selectedMethods.has("DUE") || dueMinor > 0);

  // T-152: Auto-fill the last remaining method when exactly 2 of 3 have amounts
  const autoFillRemaining = (
    changedMethod: SplitMethod,
    changedMinor: number
  ) => {
    const methods = Array.from(selectedMethods);
    if (methods.length === 2) {
      // Two methods: auto-fill the other
      const otherMethod = methods.find((m) => m !== changedMethod);
      if (otherMethod && changedMinor > 0 && changedMinor < totalAmountMinor) {
        const otherVal = (totalAmountMinor - changedMinor) / 100;
        if (otherMethod === "UPI") setUpiAmount(otherVal.toFixed(2));
        if (otherMethod === "CASH") setCashAmount(otherVal.toFixed(2));
        if (otherMethod === "DUE") setDueAmount(otherVal.toFixed(2));
      }
    }
    // For 3 methods, don't auto-fill (user must distribute manually)
  };

  const handleUpiChange = (value: string) => {
    if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
      setUpiAmount(value);
      const upi = Math.round(parseFloat(value || "0") * 100);
      autoFillRemaining("UPI", upi);
    }
  };

  const handleCashChange = (value: string) => {
    if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
      setCashAmount(value);
      const cash = Math.round(parseFloat(value || "0") * 100);
      autoFillRemaining("CASH", cash);
    }
  };

  // T-152: Handler for DUE amount changes
  const handleDueChange = (value: string) => {
    if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
      setDueAmount(value);
      const due = Math.round(parseFloat(value || "0") * 100);
      autoFillRemaining("DUE", due);
    }
  };

  const handleProceed = async () => {
    if (!isValid) {
      Alert.alert("Invalid Split", "Selected amounts must equal the total amount.");
      return;
    }

    setLoading(true);
    try {
      // T-152: Build payments array from selected methods
      const payments: { mode: "UPI" | "CASH" | "DUE"; amountMinor: number }[] = [];
      if (selectedMethods.has("UPI") && upiMinor > 0) {
        payments.push({ mode: "UPI", amountMinor: upiMinor });
      }
      if (selectedMethods.has("CASH") && cashMinor > 0) {
        payments.push({ mode: "CASH", amountMinor: cashMinor });
      }
      if (selectedMethods.has("DUE") && dueMinor > 0) {
        payments.push({ mode: "DUE", amountMinor: dueMinor });
      }

      const response = await createSplitPayment({
        saleId,
        payments,
      });

      setSplitResponse(response);
      // T-152: Navigate to appropriate step based on selected methods
      if (selectedMethods.has("UPI")) {
        setStep("upi-waiting");
      } else if (selectedMethods.has("CASH")) {
        // No UPI — just need cash confirmation
        setStep("cash-collect");
      } else {
        // Only DUE (with some other method already handled) — complete
        setStep("complete");
        setTimeout(() => {
          onComplete({
            success: true,
            paymentStatus: "completed",
            upiVerified: false,
            cashConfirmed: false,
          });
        }, 1000);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to create split payment. Please try again.");
      console.error("[SplitPayment] Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // GL-RJ-001: Verify UPI payment with backend before proceeding to cash collection
  const handleUpiReceived = useCallback(async () => {
    if (!saleId) {
      Alert.alert("Error", "Sale ID not found.");
      return;
    }

    setVerifyingUpi(true);
    try {
      // Verify UPI payment status with backend
      const status = await getSplitPaymentStatus({ saleId });

      // GL-RJ-001: Only proceed if UPI payment is verified as completed
      if (status.upiStatus === 'completed' || status.upiStatus === 'COMPLETED') {
        setUpiCompleted(true);
        setUpiVerified(true);
        setStep("cash-collect");
      } else if (status.upiStatus === 'pending' || status.upiStatus === 'PENDING') {
        // Payment still pending - show warning and allow retry
        Alert.alert(
          "Payment Pending",
          "UPI payment has not been confirmed yet. Please wait for the payment to complete or verify with the customer.",
          [
            { text: "Check Again", onPress: () => handleUpiReceived() },
            { text: "Cancel", style: "cancel" }
          ]
        );
      } else {
        // Payment failed or unknown status
        Alert.alert(
          "Payment Not Verified",
          `UPI payment status: ${status.upiStatus}. Please ensure the payment was completed successfully.`,
          [
            { text: "Check Again", onPress: () => handleUpiReceived() },
            { text: "Cancel", style: "cancel" }
          ]
        );
      }
    } catch (error) {
      console.error("[SplitPayment] UPI verification error:", error);
      Alert.alert(
        "Verification Failed",
        "Could not verify UPI payment. Please check your connection and try again.",
        [
          { text: "Retry", onPress: () => handleUpiReceived() },
          { text: "Cancel", style: "cancel" }
        ]
      );
    } finally {
      setVerifyingUpi(false);
    }
  }, [saleId]);

  // POS-PAY-001: Manual UTR fallback when auto-polling fails
  // AUDIT-POS-FEATURES-001 §4.2: MUST call verifyUtr() server-side before accepting
  const [verifyingManualUtr, setVerifyingManualUtr] = useState(false);
  const handleManualUtrSubmit = useCallback(async () => {
    const trimmedUtr = manualUtr.trim();
    if (trimmedUtr.length < 6) {
      Alert.alert("Invalid UTR", "Please enter a valid UPI Transaction Reference (at least 6 characters).");
      return;
    }
    // Stop polling while we verify
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setPollingActive(false);
    setVerifyingManualUtr(true);

    try {
      const upiMinor = splitResponse?.upiPayment
        ? Math.round(parseFloat(upiAmount || "0") * 100)
        : 0;
      const result = await verifyUtr({
        utr: trimmedUtr,
        amountMinor: upiMinor,
        paymentId: splitResponse?.upiPayment?.paymentId,
      });

      if (result.verified) {
        setUpiCompleted(true);
        setUpiVerified(true);
        setStep("cash-collect");
        console.log(`[SplitPayment] POS-PAY-001: UTR verified server-side: ${trimmedUtr}`);
      } else {
        Alert.alert(
          "UTR Verification Failed",
          result.errorMessage || "The UTR could not be verified. Please check and try again.",
          [{ text: "OK" }]
        );
      }
    } catch (error: any) {
      // Offline or server error — inform cashier, do NOT auto-accept
      Alert.alert(
        "Verification Error",
        error?.message === "verification_offline_blocked"
          ? "Cannot verify UTR while offline. Please check your connection."
          : "Could not verify UTR. Please check the reference and try again.",
        [{ text: "OK" }]
      );
      console.warn(`[SplitPayment] UTR verification failed:`, error);
    } finally {
      setVerifyingManualUtr(false);
    }
  }, [manualUtr, splitResponse, upiAmount]);

  // GL-RJ-001: Confirm cash payment and verify complete sale status
  const handleCashReceived = async () => {
    if (!splitResponse?.cashPayment?.paymentId) {
      Alert.alert("Error", "Cash payment ID not found.");
      return;
    }

    // GL-RJ-001: Ensure UPI was verified before confirming cash
    if (!upiVerified) {
      Alert.alert(
        "UPI Not Verified",
        "Please verify UPI payment before confirming cash.",
        [{ text: "OK" }]
      );
      return;
    }

    setLoading(true);
    try {
      const result = await confirmSplitCash({
        paymentId: splitResponse.cashPayment.paymentId,
      });

      // GL-RJ-001: Verify sale completion status from backend
      if (result.saleCompleted && result.status === 'completed') {
        setStep("complete");
        // Brief delay then close with verified result
        setTimeout(() => {
          onComplete({
            success: true,
            paymentStatus: 'completed',
            upiVerified: true,
            cashConfirmed: true,
          });
        }, 1000);
      } else if (result.saleCompleted) {
        // Sale completed but status unclear - proceed with warning logged
        console.warn("[SplitPayment] Sale completed but status unclear:", result.status);
        setStep("complete");
        setTimeout(() => {
          onComplete({
            success: true,
            paymentStatus: 'completed',
            upiVerified: true,
            cashConfirmed: true,
          });
        }, 1000);
      } else {
        // GL-RJ-001: Sale not completed - don't proceed
        Alert.alert(
          "Payment Not Complete",
          "The sale could not be completed. Please try again or contact support.",
          [{ text: "OK" }]
        );
        onComplete({
          success: false,
          paymentStatus: 'failed',
          upiVerified,
          cashConfirmed: false,
          errorMessage: "Sale not completed by backend",
        });
      }
    } catch (error) {
      console.error("[SplitPayment] Cash confirm error:", error);
      Alert.alert("Error", "Failed to confirm cash payment. Please try again.");
      // GL-RJ-001: Don't call onComplete on error - let user retry
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

      {/* T-152: Method selection toggles */}
      <View style={styles.methodToggles}>
        {(["UPI", "CASH", "DUE"] as SplitMethod[]).map((method) => {
          const active = selectedMethods.has(method);
          const icon = method === "UPI" ? "qrcode-scan" : method === "CASH" ? "cash" : "calendar-clock";
          return (
            <TouchableOpacity
              key={method}
              style={[styles.methodToggle, active && styles.methodToggleActive]}
              onPress={() => toggleMethod(method)}
            >
              <MaterialCommunityIcons
                name={icon as any}
                size={16}
                color={active ? theme.colors.textInverse : theme.colors.textSecondary}
              />
              <Text
                style={[styles.methodToggleText, active && styles.methodToggleTextActive]}
              >
                {method}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.inputRow}>
        {selectedMethods.has("UPI") && (
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
        )}

        {selectedMethods.has("CASH") && (
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
        )}

        {selectedMethods.has("DUE") && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Due Amount</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.currencyPrefix}>₹</Text>
              <TextInput
                style={styles.input}
                value={dueAmount}
                onChangeText={handleDueChange}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>
          </View>
        )}
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
            <ActivityIndicator color={theme.colors.textInverse} size="small" />
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

      {/* T-204: QR expiry countdown */}
      {splitQrSecondsLeft !== null && splitQrSecondsLeft > 0 && (
        <Text style={{
          fontSize: 13,
          color: splitQrSecondsLeft <= 60 ? theme.colors.error : theme.colors.textTertiary,
          fontWeight: splitQrSecondsLeft <= 60 ? "700" : "500",
          marginBottom: 8,
          textAlign: "center",
        }}>
          QR expires in {Math.floor(splitQrSecondsLeft / 60)}:{String(splitQrSecondsLeft % 60).padStart(2, "0")}
        </Text>
      )}

      <Text style={styles.waitingText}>
        {verifyingUpi
          ? "Verifying UPI payment..."
          : pollingActive
          ? `Auto-checking payment status... (${pollCount}/40)`
          : "Waiting for UPI payment..."}
      </Text>
      {pollingActive && (
        <ActivityIndicator
          size="small"
          color={theme.colors.primary}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* POS-PAY-001: Manual UTR fallback after 10 failed polls */}
      {manualUtrVisible && (
        <View style={styles.manualUtrContainer}>
          <Text style={styles.manualUtrLabel}>
            Auto-check taking too long? Enter UTR manually:
          </Text>
          <TextInput
            style={styles.manualUtrInput}
            placeholder="Enter UPI Transaction Reference"
            placeholderTextColor={theme.colors.textTertiary}
            value={manualUtr}
            onChangeText={setManualUtr}
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={[styles.proceedBtn, (manualUtr.trim().length < 6 || verifyingManualUtr) && styles.btnDisabled]}
            onPress={handleManualUtrSubmit}
            disabled={manualUtr.trim().length < 6 || verifyingManualUtr}
          >
            {verifyingManualUtr ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.proceedBtnText}>Verify UTR & Proceed</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onClose}
          disabled={verifyingUpi}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.proceedBtn, verifyingUpi && styles.btnDisabled]}
          onPress={handleUpiReceived}
          disabled={verifyingUpi}
        >
          {verifyingUpi ? (
            <ActivityIndicator color={theme.colors.textInverse} size="small" />
          ) : (
            <Text style={styles.proceedBtnText}>Verify & Proceed</Text>
          )}
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
            <ActivityIndicator color={theme.colors.textInverse} size="small" />
          ) : (
            <Text style={styles.proceedBtnText}>Cash Received</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  // T-152: Build summary string showing all split amounts
  const renderCompleteStep = () => {
    const parts: string[] = [];
    if (upiMinor > 0) parts.push(`${formatMoney(upiMinor, currency)} UPI`);
    if (cashMinor > 0) parts.push(`${formatMoney(cashMinor, currency)} Cash`);
    if (dueMinor > 0) parts.push(`${formatMoney(dueMinor, currency)} Due`);
    return (
      <>
        <View style={styles.successIcon}>
          <MaterialCommunityIcons
            name="check-circle"
            size={80}
            color={theme.colors.success}
          />
        </View>
        <Text style={styles.title}>Payment Complete!</Text>
        <Text style={styles.subtitle}>{parts.join(" + ")}</Text>
      </>
    );
  };

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

          {/* GO-LIVE-247: Step progress indicator for clearer UX */}
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, step === "input" && styles.stepDotActive]}>
              <Text style={[styles.stepNumber, step === "input" && styles.stepNumberActive]}>1</Text>
            </View>
            <View style={[styles.stepLine, step !== "input" && styles.stepLineActive]} />
            <View style={[styles.stepDot, step === "upi-waiting" && styles.stepDotActive]}>
              <Text style={[styles.stepNumber, step === "upi-waiting" && styles.stepNumberActive]}>2</Text>
            </View>
            <View style={[styles.stepLine, (step === "cash-collect" || step === "complete") && styles.stepLineActive]} />
            <View style={[styles.stepDot, (step === "cash-collect" || step === "complete") && styles.stepDotActive]}>
              <Text style={[styles.stepNumber, (step === "cash-collect" || step === "complete") && styles.stepNumberActive]}>3</Text>
            </View>
          </View>
          <View style={styles.stepLabels}>
            <Text style={[styles.stepLabel, step === "input" && styles.stepLabelActive]}>Split</Text>
            <Text style={[styles.stepLabel, step === "upi-waiting" && styles.stepLabelActive]}>UPI</Text>
            <Text style={[styles.stepLabel, (step === "cash-collect" || step === "complete") && styles.stepLabelActive]}>Cash</Text>
          </View>

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
    backgroundColor: theme.colors.overlay,
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
  // GO-LIVE-247: Step indicator styles
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  stepDotActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textTertiary,
  },
  stepNumberActive: {
    color: theme.colors.textInverse,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: theme.colors.border,
  },
  stepLineActive: {
    backgroundColor: theme.colors.primary,
  },
  stepLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textTertiary,
    textTransform: "uppercase",
    width: 60,
    textAlign: "center",
  },
  stepLabelActive: {
    color: theme.colors.primary,
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
  // T-152: Method toggle styles
  methodToggles: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    justifyContent: "center",
  },
  methodToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  methodToggleActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  methodToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  methodToggleTextActive: {
    color: theme.colors.textInverse,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
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
    color: theme.colors.textInverse,
  },
  btnDisabled: {
    backgroundColor: theme.colors.textTertiary,
  },
  manualUtrContainer: {
    width: "100%" as const,
    padding: 12,
    marginBottom: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  manualUtrLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  manualUtrInput: {
    height: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  qrContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    marginBottom: 16,
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.successSoft,
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
