// T-194: Return/Refund Processing Screen
// Lookup bill, select items to return, choose reason + refund method, process return

import React, { useCallback, useMemo, useState } from "react";
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
import { useTranslation } from "react-i18next";

import { theme, useThemeColors } from "../theme";
import { formatMoney } from "../utils/money";
import { uuidv4 } from "../utils/uuid";
import { BackHeader } from "../components/ui/BackHeader";
import { apiClient } from "../services/api/apiClient";
import { asError } from "../utils/errorUtils";
import NetInfo from "@react-native-community/netinfo";

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

const REFUND_METHODS: { id: RefundMethod; labelKey: string; icon: string }[] = [
  { id: "CASH", labelKey: "returnScreen.refundCash", icon: "cash" },
  { id: "UPI", labelKey: "returnScreen.refundUpi", icon: "cellphone" },
  { id: "KHATA_CREDIT", labelKey: "returnScreen.refundKhataCredit", icon: "notebook-outline" },
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

// STG-468: Include idempotencyKey to prevent duplicate refunds on retry
async function processRefund(data: {
  saleId: string;
  items: ReturnItem[];
  reason: ReturnReason;
  refundMethod: RefundMethod;
  idempotencyKey: string;
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
  const colors = useThemeColors();
  const { t } = useTranslation();
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
  // STG-468: Stable idempotency key generated once per return attempt
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv4());
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
      Alert.alert(t("returnScreen.enterBillTitle"), t("returnScreen.enterBillMessage"));
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
      if (__DEV__) console.error("[ReturnScreen] Lookup failed:", e);
      setLookupError(e?.message || t("returnScreen.billNotFound"));
    } finally {
      setLookupLoading(false);
    }
  }, [billRefInput, t]);

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

    // ISSUE-088: Check connectivity before financial operation
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert(t("returnScreen.noConnectionTitle"), t("returnScreen.noConnectionMessage"));
        return;
      }
    } catch { /* NetInfo failed — proceed anyway */ }

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
        idempotencyKey,
      });
      setRefundResult(result);
      setStep("SUCCESS");
    } catch (_e: unknown) {
    const e = asError(_e);
      if (__DEV__) console.error("[ReturnScreen] Process return failed:", e);
      Alert.alert(
        t("returnScreen.returnFailedTitle"),
        e?.message || t("returnScreen.returnFailedMessage")
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
    setIdempotencyKey(uuidv4()); // ISSUE-087: Regenerate key for next return
    setStep("LOOKUP");
  }, []);

  // ==========================================================================
  // STYLES
  // ==========================================================================

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      alignItems: "center",
      ...theme.shadows.sm,
    },
    lookupTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.xs,
    },
    lookupSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: theme.spacing.lg,
    },
    lookupInput: {
      width: "100%",
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      textAlign: "center",
    },
    lookupError: {
      fontSize: 13,
      color: colors.error,
      marginTop: theme.spacing.sm,
      textAlign: "center",
    },
    lookupButton: {
      width: "100%",
      backgroundColor: colors.primary,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      alignItems: "center",
      marginTop: theme.spacing.md,
    },
    lookupButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textInverse,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    // Sale info
    saleInfoCard: {
      backgroundColor: colors.surface,
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
      color: colors.textTertiary,
    },
    saleInfoValue: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    // Items
    itemCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemInfo: {
      flex: 1,
      marginRight: theme.spacing.sm,
    },
    itemName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    itemMeta: {
      fontSize: 12,
      color: colors.textSecondary,
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
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceAlt,
    },
    qtyButtonDisabled: {
      opacity: 0.5,
    },
    qtyValue: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textTertiary,
      minWidth: 24,
      textAlign: "center",
    },
    qtyValueActive: {
      color: colors.error,
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
      borderColor: colors.border,
      marginBottom: theme.spacing.sm,
      backgroundColor: colors.surface,
    },
    reasonOptionActive: {
      borderColor: colors.primary,
      backgroundColor: colors.accentSoft,
    },
    reasonText: {
      fontSize: 14,
      color: colors.textPrimary,
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
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: theme.spacing.xs,
    },
    refundMethodCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },
    refundMethodText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
      textAlign: "center",
    },
    refundMethodTextActive: {
      color: colors.primary,
    },
    // Summary
    refundSummary: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginTop: theme.spacing.md,
      ...theme.shadows.sm,
    },
    refundSummaryTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
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
      color: colors.textPrimary,
    },
    refundSummaryAmount: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    refundTotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: theme.spacing.sm,
      marginTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    refundTotalLabel: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    refundTotalAmount: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.error,
    },
    // Process button
    processButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.error,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      marginTop: theme.spacing.lg,
      gap: theme.spacing.xs,
    },
    processButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textInverse,
    },
    // Success
    successContainer: {
      flex: 1,
      justifyContent: "center",
      padding: theme.spacing.md,
    },
    successCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.xl,
      alignItems: "center",
      ...theme.shadows.md,
    },
    successIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.successSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.md,
    },
    successTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    successAmount: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.success,
      marginBottom: theme.spacing.sm,
    },
    successSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: theme.spacing.xs,
    },
    successNote: {
      fontSize: 12,
      color: colors.textTertiary,
      marginBottom: theme.spacing.lg,
    },
    newReturnButton: {
      backgroundColor: colors.primary,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.borderRadius.md,
    },
    newReturnButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textInverse,
    },
  }), [colors]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <View style={styles.container}>
      <BackHeader title={t("returnScreen.title")} onBack={onBack} />

      {/* STEP: LOOKUP */}
      {step === "LOOKUP" && (
        <View style={styles.stepContainer}>
          <View style={styles.lookupCard}>
            <MaterialCommunityIcons
              name="magnify"
              size={32}
              color={colors.primary}
            />
            <Text style={styles.lookupTitle}>{t("returnScreen.findOriginalSale")}</Text>
            <Text style={styles.lookupSubtitle}>
              {t("returnScreen.findOriginalSaleSubtitle")}
            </Text>
            <TextInput
              style={styles.lookupInput}
              placeholder={t("returnScreen.billPlaceholder")}
              placeholderTextColor={colors.textTertiary}
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
              accessibilityRole="button"
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
                  color={colors.textInverse}
                />
              ) : (
                <Text style={styles.lookupButtonText}>{t("returnScreen.lookUpSale")}</Text>
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
              <Text style={styles.saleInfoLabel}>{t("returnScreen.billLabel")}</Text>
              <Text style={styles.saleInfoValue}>{sale.billRef}</Text>
            </View>
            <View style={styles.saleInfoRow}>
              <Text style={styles.saleInfoLabel}>{t("returnScreen.dateLabel")}</Text>
              <Text style={styles.saleInfoValue}>
                {formatIndianDate(sale.createdAt)}
              </Text>
            </View>
            <View style={styles.saleInfoRow}>
              <Text style={styles.saleInfoLabel}>{t("returnScreen.totalLabel")}</Text>
              <Text style={styles.saleInfoValue}>
                {formatMoney(sale.totalMinor)}
              </Text>
            </View>
            <View style={styles.saleInfoRow}>
              <Text style={styles.saleInfoLabel}>{t("returnScreen.paymentLabel")}</Text>
              <Text style={styles.saleInfoValue}>{sale.paymentMode}</Text>
            </View>
          </View>

          {/* Items to return */}
          <Text style={styles.sectionTitle}>{t("returnScreen.selectItemsToReturn")}</Text>
          {sale.items.map((item) => {
            const returnQty = returnQuantities[item.id] || 0;
            return (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.productName}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {t("returnScreen.qtyPrefix")}: {item.quantity} x {formatMoney(item.priceMinor)} ={" "}
                    {formatMoney(item.totalMinor)}
                  </Text>
                </View>
                <View style={styles.qtyPicker}>
                  <Pressable
                    accessibilityRole="button"
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
                          ? colors.textTertiary
                          : colors.error
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
                    accessibilityRole="button"
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
                          ? colors.textTertiary
                          : colors.primary
                      }
                    />
                  </Pressable>
                </View>
              </View>
            );
          })}

          {/* Reason */}
          <Text style={styles.sectionTitle}>{t("returnScreen.reasonForReturn")}</Text>
          {RETURN_REASONS.map((r) => (
            <Pressable
              accessibilityRole="radio"
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
                    ? colors.primary
                    : colors.textTertiary
                }
              />
              <Text style={styles.reasonText}>{t(`returnScreen.reason${r.replace(/\s/g, "")}`)}</Text>
            </Pressable>
          ))}

          {/* Refund method */}
          <Text style={styles.sectionTitle}>{t("returnScreen.refundMethod")}</Text>
          <View style={styles.refundMethods}>
            {REFUND_METHODS.map((m) => (
              <Pressable
                accessibilityRole="radio"
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
                      ? colors.primary
                      : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.refundMethodText,
                    refundMethod === m.id && styles.refundMethodTextActive,
                  ]}
                >
                  {t(m.labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Summary */}
          {selectedItems.length > 0 && (
            <View style={styles.refundSummary}>
              <Text style={styles.refundSummaryTitle}>{t("returnScreen.refundSummary")}</Text>
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
                <Text style={styles.refundTotalLabel}>{t("returnScreen.totalRefund")}</Text>
                <Text style={styles.refundTotalAmount}>
                  {formatMoney(refundTotal)}
                </Text>
              </View>
            </View>
          )}

          {/* Process button */}
          <Pressable
            accessibilityRole="button"
            style={[
              styles.processButton,
              !canProceedToConfirm && styles.buttonDisabled,
            ]}
            onPress={() => {
              Alert.alert(
                t("returnScreen.confirmReturnTitle"),
                t("returnScreen.confirmReturnMessage", {
                  amount: formatMoney(refundTotal),
                  method: t(REFUND_METHODS.find((m) => m.id === refundMethod)?.labelKey ?? ""),
                }),
                [
                  { text: t("returnScreen.cancelButton"), style: "cancel" },
                  { text: t("returnScreen.processReturnButton"), onPress: handleProcessReturn },
                ]
              );
            }}
            disabled={!canProceedToConfirm || processing}
          >
            {processing ? (
              <ActivityIndicator
                size="small"
                color={colors.textInverse}
              />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="rotate-left"
                  size={18}
                  color={colors.textInverse}
                />
                <Text style={styles.processButtonText}>{t("returnScreen.processReturnButton")}</Text>
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
                color={colors.success}
              />
            </View>
            <Text style={styles.successTitle}>{t("returnScreen.returnProcessed")}</Text>
            <Text style={styles.successAmount}>
              {formatMoney(refundResult.refundAmountMinor)}
            </Text>
            <Text style={styles.successSubtitle}>
              {t("returnScreen.returnRef", { ref: refundResult.refundId })}
            </Text>
            <Text style={styles.successNote}>
              {t("returnScreen.stockReversedNote")}
            </Text>
            <Pressable accessibilityRole="button" style={styles.newReturnButton} onPress={handleNewReturn}>
              <Text style={styles.newReturnButtonText}>
                {t("returnScreen.processAnotherReturn")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
