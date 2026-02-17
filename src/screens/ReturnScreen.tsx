// T-194: Return/Refund Processing Screen
// Lookup bill, select items to return, choose reason + refund method, process return

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../theme";
import { formatMoney } from "../utils/money";
import { BackHeader } from "../components/ui/BackHeader";
import { apiClient } from "../services/api/apiClient";
import { asError } from "../utils/errorUtils";

// =============================================================================
// TYPES
// =============================================================================

interface SaleLineItem {
  id: string;
  productName: string;
  barcode: string | null;
  quantity: number;
  priceMinor: number; // per unit
  totalMinor: number;
}

interface SaleLookup {
  saleId: string;
  billRef: string;
  createdAt: string;
  totalMinor: number;
  paymentMode: string;
  items: SaleLineItem[];
}

interface ReturnItem {
  lineItemId: string;
  quantity: number;
}

type ReturnReason = "Defective" | "Wrong Item" | "Changed Mind" | "Expired" | "Other";
type RefundMethod = "CASH" | "UPI" | "KHATA_CREDIT";

const RETURN_REASONS: ReturnReason[] = [
  "Defective",
  "Wrong Item",
  "Changed Mind",
  "Expired",
  "Other",
];

const REFUND_METHODS: { id: RefundMethod; label: string; icon: string }[] = [
  { id: "CASH", label: "Cash", icon: "cash" },
  { id: "UPI", label: "UPI (Manual)", icon: "cellphone" },
  { id: "KHATA_CREDIT", label: "Khata Credit", icon: "notebook-outline" },
];

// =============================================================================
// HELPERS
// =============================================================================

function formatIndianDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "--";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// =============================================================================
// API
// =============================================================================

async function lookupSale(billRef: string): Promise<SaleLookup> {
  const response = await apiClient.get<{ sale: SaleLookup }>(
    `/api/v1/pos/sales/lookup?billRef=${encodeURIComponent(billRef)}`
  );
  return response.sale;
}

async function processRefund(data: {
  saleId: string;
  items: ReturnItem[];
  reason: ReturnReason;
  refundMethod: RefundMethod;
}): Promise<{ refundId: string; refundAmountMinor: number }> {
  const response = await apiClient.post<{
    refundId: string;
    refundAmountMinor: number;
  }>("/api/v1/pos/payments/refund", data);
  return response;
}

// =============================================================================
// COMPONENT
// =============================================================================

interface ReturnScreenProps {
  onBack?: () => void;
}

type ScreenStep = "LOOKUP" | "SELECT" | "CONFIRM" | "SUCCESS";

export default function ReturnScreen({ onBack }: ReturnScreenProps) {
  // Step state
  const [step, setStep] = useState<ScreenStep>("LOOKUP");

  // Lookup state
  const [billRefInput, setBillRefInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [sale, setSale] = useState<SaleLookup | null>(null);

  // Selection state
  const [returnQuantities, setReturnQuantities] = useState<
    Record<string, number>
  >({});
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [refundMethod, setRefundMethod] = useState<RefundMethod | null>(null);

  // Process state
  const [processing, setProcessing] = useState(false);
  const [refundResult, setRefundResult] = useState<{
    refundId: string;
    refundAmountMinor: number;
  } | null>(null);

  // ==========================================================================
  // STEP 1: LOOKUP
  // ==========================================================================

  const handleLookup = useCallback(async () => {
    const trimmed = billRefInput.trim();
    if (!trimmed) {
      Alert.alert("Enter Bill #", "Please enter a bill number or scan a barcode.");
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    try {
      const result = await lookupSale(trimmed);
      setSale(result);
      // Initialize return quantities to 0
      const initQty: Record<string, number> = {};
      for (const item of result.items) {
        initQty[item.id] = 0;
      }
      setReturnQuantities(initQty);
      setStep("SELECT");
    } catch (_e: unknown) {
    const e = asError(_e);
      console.error("[ReturnScreen] Lookup failed:", e);
      setLookupError(e?.message || "Bill not found. Please check the number.");
    } finally {
      setLookupLoading(false);
    }
  }, [billRefInput]);

  // ==========================================================================
  // STEP 2: SELECT ITEMS
  // ==========================================================================

  const updateReturnQty = useCallback(
    (lineItemId: string, delta: number) => {
      if (!sale) return;
      const item = sale.items.find((i) => i.id === lineItemId);
      if (!item) return;
      setReturnQuantities((prev) => {
        const current = prev[lineItemId] || 0;
        const next = Math.max(0, Math.min(item.quantity, current + delta));
        return { ...prev, [lineItemId]: next };
      });
    },
    [sale]
  );

  const selectedItems = sale
    ? sale.items.filter((item) => (returnQuantities[item.id] || 0) > 0)
    : [];

  const refundTotal = selectedItems.reduce(
    (sum, item) => sum + item.priceMinor * (returnQuantities[item.id] || 0),
    0
  );

  const canProceedToConfirm =
    selectedItems.length > 0 && reason !== null && refundMethod !== null;

  // ==========================================================================
  // STEP 3: CONFIRM AND PROCESS
  // ==========================================================================

  const handleProcessReturn = useCallback(async () => {
    // UIUX-POS-019: Guard against double-tap — reject if already processing
    if (processing) return;
    if (!sale || !reason || !refundMethod || selectedItems.length === 0) return;

    setProcessing(true);
    try {
      const result = await processRefund({
        saleId: sale.saleId,
        items: selectedItems.map((item) => ({
          lineItemId: item.id,
          quantity: returnQuantities[item.id] || 0,
        })),
        reason,
        refundMethod,
      });
      setRefundResult(result);
      setStep("SUCCESS");
    } catch (_e: unknown) {
    const e = asError(_e);
      console.error("[ReturnScreen] Process return failed:", e);
      Alert.alert(
        "Return Failed",
        e?.message || "Could not process the return. Please try again."
      );
    } finally {
      setProcessing(false);
    }
  }, [sale, reason, refundMethod, selectedItems, returnQuantities, processing]);

  // ==========================================================================
  // STEP 4: SUCCESS
  // ==========================================================================

  const handleNewReturn = useCallback(() => {
    setBillRefInput("");
    setSale(null);
    setReturnQuantities({});
    setReason(null);
    setRefundMethod(null);
    setRefundResult(null);
    setStep("LOOKUP");
  }, []);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <View style={styles.container}>
      <BackHeader title="Return / Refund" onBack={onBack} />

      {/* STEP: LOOKUP */}
      {step === "LOOKUP" && (
        <View style={styles.stepContainer}>
          <View style={styles.lookupCard}>
            <MaterialCommunityIcons
              name="magnify"
              size={32}
              color={theme.colors.primary}
            />
            <Text style={styles.lookupTitle}>Find Original Sale</Text>
            <Text style={styles.lookupSubtitle}>
              Enter the bill number or scan the receipt barcode
            </Text>
            <TextInput
              style={styles.lookupInput}
              placeholder="Bill # (e.g. B-00123)"
              placeholderTextColor={theme.colors.textTertiary}
              value={billRefInput}
              onChangeText={setBillRefInput}
              autoCapitalize="characters"
              returnKeyType="search"
              onSubmitEditing={handleLookup}
            />
            {lookupError && (
              <Text style={styles.lookupError}>{lookupError}</Text>
            )}
            <Pressable
              style={[
                styles.lookupButton,
                (!billRefInput.trim() || lookupLoading) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleLookup}
              disabled={!billRefInput.trim() || lookupLoading}
            >
              {lookupLoading ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.textInverse}
                />
              ) : (
                <Text style={styles.lookupButtonText}>Look Up Sale</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* STEP: SELECT ITEMS */}
      {step === "SELECT" && sale && (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Sale info */}
          <View style={styles.saleInfoCard}>
            <View style={styles.saleInfoRow}>
              <Text style={styles.saleInfoLabel}>Bill #</Text>
              <Text style={styles.saleInfoValue}>{sale.billRef}</Text>
            </View>
            <View style={styles.saleInfoRow}>
              <Text style={styles.saleInfoLabel}>Date</Text>
              <Text style={styles.saleInfoValue}>
                {formatIndianDate(sale.createdAt)}
              </Text>
            </View>
            <View style={styles.saleInfoRow}>
              <Text style={styles.saleInfoLabel}>Total</Text>
              <Text style={styles.saleInfoValue}>
                {formatMoney(sale.totalMinor)}
              </Text>
            </View>
            <View style={styles.saleInfoRow}>
              <Text style={styles.saleInfoLabel}>Payment</Text>
              <Text style={styles.saleInfoValue}>{sale.paymentMode}</Text>
            </View>
          </View>

          {/* Items to return */}
          <Text style={styles.sectionTitle}>Select Items to Return</Text>
          {sale.items.map((item) => {
            const returnQty = returnQuantities[item.id] || 0;
            return (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.productName}
                  </Text>
                  <Text style={styles.itemMeta}>
                    Qty: {item.quantity} x {formatMoney(item.priceMinor)} ={" "}
                    {formatMoney(item.totalMinor)}
                  </Text>
                </View>
                <View style={styles.qtyPicker}>
                  <Pressable
                    style={[
                      styles.qtyButton,
                      returnQty === 0 && styles.qtyButtonDisabled,
                    ]}
                    onPress={() => updateReturnQty(item.id, -1)}
                    disabled={returnQty === 0}
                  >
                    <MaterialCommunityIcons
                      name="minus"
                      size={18}
                      color={
                        returnQty === 0
                          ? theme.colors.textTertiary
                          : theme.colors.error
                      }
                    />
                  </Pressable>
                  <Text
                    style={[
                      styles.qtyValue,
                      returnQty > 0 && styles.qtyValueActive,
                    ]}
                  >
                    {returnQty}
                  </Text>
                  <Pressable
                    style={[
                      styles.qtyButton,
                      returnQty >= item.quantity && styles.qtyButtonDisabled,
                    ]}
                    onPress={() => updateReturnQty(item.id, 1)}
                    disabled={returnQty >= item.quantity}
                  >
                    <MaterialCommunityIcons
                      name="plus"
                      size={18}
                      color={
                        returnQty >= item.quantity
                          ? theme.colors.textTertiary
                          : theme.colors.primary
                      }
                    />
                  </Pressable>
                </View>
              </View>
            );
          })}

          {/* Reason */}
          <Text style={styles.sectionTitle}>Reason for Return</Text>
          {RETURN_REASONS.map((r) => (
            <Pressable
              key={r}
              style={[
                styles.reasonOption,
                reason === r && styles.reasonOptionActive,
              ]}
              onPress={() => setReason(r)}
            >
              <MaterialCommunityIcons
                name={
                  reason === r ? "radiobox-marked" : "radiobox-blank"
                }
                size={20}
                color={
                  reason === r
                    ? theme.colors.primary
                    : theme.colors.textTertiary
                }
              />
              <Text style={styles.reasonText}>{r}</Text>
            </Pressable>
          ))}

          {/* Refund method */}
          <Text style={styles.sectionTitle}>Refund Method</Text>
          <View style={styles.refundMethods}>
            {REFUND_METHODS.map((m) => (
              <Pressable
                key={m.id}
                style={[
                  styles.refundMethodCard,
                  refundMethod === m.id && styles.refundMethodCardActive,
                ]}
                onPress={() => setRefundMethod(m.id)}
              >
                <MaterialCommunityIcons
                  name={m.icon as any}
                  size={24}
                  color={
                    refundMethod === m.id
                      ? theme.colors.primary
                      : theme.colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.refundMethodText,
                    refundMethod === m.id && styles.refundMethodTextActive,
                  ]}
                >
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Summary */}
          {selectedItems.length > 0 && (
            <View style={styles.refundSummary}>
              <Text style={styles.refundSummaryTitle}>Refund Summary</Text>
              {selectedItems.map((item) => (
                <View key={item.id} style={styles.refundSummaryRow}>
                  <Text style={styles.refundSummaryItem} numberOfLines={1}>
                    {item.productName} x {returnQuantities[item.id]}
                  </Text>
                  <Text style={styles.refundSummaryAmount}>
                    {formatMoney(
                      item.priceMinor * (returnQuantities[item.id] || 0)
                    )}
                  </Text>
                </View>
              ))}
              <View style={styles.refundTotalRow}>
                <Text style={styles.refundTotalLabel}>Total Refund</Text>
                <Text style={styles.refundTotalAmount}>
                  {formatMoney(refundTotal)}
                </Text>
              </View>
            </View>
          )}

          {/* Process button */}
          <Pressable
            style={[
              styles.processButton,
              !canProceedToConfirm && styles.buttonDisabled,
            ]}
            onPress={() => {
              Alert.alert(
                "Confirm Return",
                `Process return for ${formatMoney(refundTotal)} via ${
                  REFUND_METHODS.find((m) => m.id === refundMethod)?.label
                }?`,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Process Return", onPress: handleProcessReturn },
                ]
              );
            }}
            disabled={!canProceedToConfirm || processing}
          >
            {processing ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.textInverse}
              />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="rotate-left"
                  size={18}
                  color={theme.colors.textInverse}
                />
                <Text style={styles.processButtonText}>Process Return</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      )}

      {/* STEP: SUCCESS */}
      {step === "SUCCESS" && refundResult && (
        <View style={styles.successContainer}>
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <MaterialCommunityIcons
                name="check"
                size={36}
                color={theme.colors.success}
              />
            </View>
            <Text style={styles.successTitle}>Return Processed</Text>
            <Text style={styles.successAmount}>
              {formatMoney(refundResult.refundAmountMinor)}
            </Text>
            <Text style={styles.successSubtitle}>
              Refund ID: {refundResult.refundId}
            </Text>
            <Text style={styles.successNote}>
              Stock has been reversed server-side.
            </Text>
            <Pressable style={styles.newReturnButton} onPress={handleNewReturn}>
              <Text style={styles.newReturnButtonText}>
                Process Another Return
              </Text>
            </Pressable>
          </View>
        </View>
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
  stepContainer: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.md,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  // Lookup
  lookupCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: "center",
    ...theme.shadows.sm,
  },
  lookupTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  lookupSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  lookupInput: {
    width: "100%",
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  lookupError: {
    fontSize: 13,
    color: theme.colors.error,
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
  lookupButton: {
    width: "100%",
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    marginTop: theme.spacing.md,
  },
  lookupButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // Sale info
  saleInfoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  saleInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  saleInfoLabel: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  saleInfoValue: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Items
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  itemInfo: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  itemMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  qtyPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },
  qtyButtonDisabled: {
    opacity: 0.4,
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textTertiary,
    minWidth: 24,
    textAlign: "center",
  },
  qtyValueActive: {
    color: theme.colors.error,
  },
  // Reason
  reasonOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  reasonOptionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.accentSoft,
  },
  reasonText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  // Refund methods
  refundMethods: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  refundMethodCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  refundMethodCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  refundMethodText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  refundMethodTextActive: {
    color: theme.colors.primary,
  },
  // Summary
  refundSummary: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
    ...theme.shadows.sm,
  },
  refundSummaryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  refundSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  refundSummaryItem: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  refundSummaryAmount: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  refundTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  refundTotalLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  refundTotalAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.error,
  },
  // Process button
  processButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.error,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  processButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  // Success
  successContainer: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.md,
  },
  successCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    alignItems: "center",
    ...theme.shadows.md,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.successSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  successAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.success,
    marginBottom: theme.spacing.sm,
  },
  successSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  successNote: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.lg,
  },
  newReturnButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
  },
  newReturnButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
});
