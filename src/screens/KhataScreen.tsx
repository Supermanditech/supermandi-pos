// T-154: Khata (Credit Book) Screen
// Main list of customers with credit/debit balance, ledger view, add credit/payment modals
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
// STG-397: Safe area handling for notched phones
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { theme, useThemeColors } from "../theme";
import { formatMoney } from "../utils/money";
import { formatDateTime } from "../i18n/formatters";
import { useKhataStore } from "../stores/khataStore";
import type { KhataCustomer, KhataEntry } from "../services/khataService";
import { BackHeader } from "../components/ui/BackHeader";
import EmptyState from "../components/ui/EmptyState";
// STG-472: Bulk actions API
import { apiClient } from "../services/api/apiClient";

// =============================================================================
// HELPERS
// =============================================================================

/** Format date as DD/MM/YYYY */
function formatDateDDMMYYYY(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "--";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// =============================================================================
// COMPONENT
// =============================================================================

interface KhataScreenProps {
  onBack?: () => void;
}

export default function KhataScreen({ onBack }: KhataScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  // STG-397: Safe area insets for notched phones
  const insets = useSafeAreaInsets();
  const {
    customers,
    entries,
    selectedCustomer,
    loading,
    entriesLoading,
    error,
    fetchCustomers,
    fetchEntries,
    addEntry,
    recordPayment,
    setSelectedCustomer,
    clearError,
  } = useKhataStore();

  const [searchQuery, setSearchQuery] = useState("");
  // UIUX-POS-020: Debounce search to avoid firing API on every keystroke
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Credit modal state
  const [creditPhone, setCreditPhone] = useState("");
  const [creditName, setCreditName] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDescription, setCreditDescription] = useState("");
  const [creditSubmitting, setCreditSubmitting] = useState(false);

  // STG-471: Track voided entries locally
  const [voidedEntries, setVoidedEntries] = useState<Set<string>>(new Set());

  // Payment modal state
  const [paymentPhone, setPaymentPhone] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "UPI">("CASH");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // STG-472: Bulk actions state
  const [bulkSelecting, setBulkSelecting] = useState(false);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // STG-472: Toggle bulk selection mode
  const handleToggleBulkSelect = useCallback(() => {
    setBulkSelecting((prev) => !prev);
    setSelectedPhones(new Set());
  }, []);

  // STG-472: Toggle customer selection
  const handleToggleCustomer = useCallback((phone: string) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  }, []);

  // STG-472: Bulk mark paid
  const handleBulkMarkPaid = useCallback(async () => {
    if (selectedPhones.size === 0) return;
    setBulkProcessing(true);
    try {
      await apiClient.post("/api/v1/pos/khata/bulk/mark-paid", {
        customerPhones: Array.from(selectedPhones),
      });
      Alert.alert(t("khata.successTitle"), t("khata.bulkMarkPaidSuccess", "{{count}} customers marked as paid.", { count: selectedPhones.size }));
      setBulkSelecting(false);
      setSelectedPhones(new Set());
      void fetchCustomers(searchQuery || undefined);
    } catch {
      Alert.alert(t("khata.errorTitle"), t("khata.bulkActionFailed", "Bulk action failed. Please try again."));
    } finally {
      setBulkProcessing(false);
    }
  }, [selectedPhones, fetchCustomers, searchQuery, t]);

  // STG-472: Bulk send reminders
  const handleBulkSendReminders = useCallback(async () => {
    if (selectedPhones.size === 0) return;
    setBulkProcessing(true);
    try {
      await apiClient.post("/api/v1/pos/khata/bulk/send-reminders", {
        customerPhones: Array.from(selectedPhones),
      });
      Alert.alert(t("khata.successTitle"), t("khata.bulkRemindersQueued", "Reminders queued for {{count}} customers.", { count: selectedPhones.size }));
      setBulkSelecting(false);
      setSelectedPhones(new Set());
    } catch {
      Alert.alert(t("khata.errorTitle"), t("khata.bulkActionFailed", "Bulk action failed. Please try again."));
    } finally {
      setBulkProcessing(false);
    }
  }, [selectedPhones, t]);

  // ISSUE-112: Android hardware back button support
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack?.();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  useEffect(() => {
    void fetchCustomers();
  }, []);

  // STG-446: Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (error) {
      Alert.alert(t("khata.errorTitle", "Connection Error"), error + "\n\n" + t("khata.retryGuidance", "Check your connection and try again."));
      clearError();
    }
  }, [error]);

  // UIUX-POS-020: 300ms debounced search to reduce API calls
  const handleSearch = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      searchTimerRef.current = setTimeout(() => {
        void fetchCustomers(text || undefined);
      }, 300);
    },
    [fetchCustomers]
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCustomers(searchQuery || undefined).finally(() => setRefreshing(false));
  }, [fetchCustomers, searchQuery]);

  const handleCustomerTap = useCallback(
    (customer: KhataCustomer) => {
      setSelectedCustomer(customer);
      void fetchEntries(customer.phone);
      setShowLedger(true);
    },
    [fetchEntries, setSelectedCustomer]
  );

  const handleCloseLedger = useCallback(() => {
    setShowLedger(false);
    setSelectedCustomer(null);
  }, [setSelectedCustomer]);

  // Credit modal handlers
  const handleOpenCreditModal = useCallback(() => {
    setCreditPhone("");
    setCreditName("");
    setCreditAmount("");
    setCreditDescription("");
    setShowCreditModal(true);
  }, []);

  const handleSubmitCredit = useCallback(async () => {
    // STG-469: Phone validation — strip +91 prefix, validate 10 digits
    let phone = creditPhone.trim().replace(/\s+/g, "");
    if (phone.startsWith("+91")) phone = phone.slice(3);
    else if (phone.startsWith("91") && phone.length === 12) phone = phone.slice(2);
    else if (phone.startsWith("0")) phone = phone.slice(1);
    if (!/^\d{10}$/.test(phone)) {
      Alert.alert(t("khata.invalidPhone"), t("khata.invalidPhoneMessage"));
      return;
    }
    const amountStr = creditAmount.trim();
    const amountMinor = Math.round(parseFloat(amountStr) * 100);
    if (!amountStr || isNaN(amountMinor) || amountMinor <= 0) {
      Alert.alert(t("khata.invalidAmount"), t("khata.invalidAmountMessage"));
      return;
    }
    setCreditSubmitting(true);
    const success = await addEntry({
      customerPhone: phone,
      customerName: creditName.trim() || undefined,
      type: "CREDIT",
      amountMinor,
      description: creditDescription.trim() || t("khata.creditGiven"),
    });
    setCreditSubmitting(false);
    if (success) {
      setShowCreditModal(false);
      void fetchCustomers(searchQuery || undefined);
      Alert.alert(t("khata.successTitle"), t("khata.creditEntryAdded"));
    }
  }, [creditPhone, creditName, creditAmount, creditDescription, addEntry, fetchCustomers, searchQuery]);

  // Payment modal handlers
  const handleOpenPaymentModal = useCallback(() => {
    setPaymentPhone("");
    setPaymentAmount("");
    setPaymentMethod("CASH");
    setShowPaymentModal(true);
  }, []);

  const handleSubmitPayment = useCallback(async () => {
    // STG-469: Phone validation — strip +91 prefix, validate 10 digits
    let phone = paymentPhone.trim().replace(/\s+/g, "");
    if (phone.startsWith("+91")) phone = phone.slice(3);
    else if (phone.startsWith("91") && phone.length === 12) phone = phone.slice(2);
    else if (phone.startsWith("0")) phone = phone.slice(1);
    if (!/^\d{10}$/.test(phone)) {
      Alert.alert(t("khata.invalidPhone"), t("khata.invalidPhoneMessage"));
      return;
    }
    const amountStr = paymentAmount.trim();
    const amountMinor = Math.round(parseFloat(amountStr) * 100);
    if (!amountStr || isNaN(amountMinor) || amountMinor <= 0) {
      Alert.alert(t("khata.invalidAmount"), t("khata.invalidAmountMessage"));
      return;
    }
    setPaymentSubmitting(true);
    const success = await recordPayment({
      customerPhone: phone,
      amountMinor,
      method: paymentMethod,
    });
    setPaymentSubmitting(false);
    if (success) {
      setShowPaymentModal(false);
      void fetchCustomers(searchQuery || undefined);
      Alert.alert(t("khata.successTitle"), t("khata.paymentRecorded"));
    }
  }, [paymentPhone, paymentAmount, paymentMethod, recordPayment, fetchCustomers, searchQuery]);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContent: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: {
      marginTop: theme.spacing.md,
      fontSize: 14,
      color: colors.textSecondary,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      margin: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: theme.spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.textPrimary,
      paddingVertical: 4,
    },
    actionRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    actionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.xs,
      backgroundColor: colors.surface,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionButtonText: {
      fontSize: 13,
      fontWeight: "600",
    },
    listContent: {
      padding: theme.spacing.md,
      paddingTop: 0,
      paddingBottom: theme.spacing.xl,
    },
    customerCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    customerInfo: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    customerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primaryLight,
      alignItems: "center",
      justifyContent: "center",
    },
    customerAvatarText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.primary,
    },
    customerDetails: {
      flex: 1,
    },
    customerName: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    customerPhone: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    customerLastEntry: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    customerBalance: {
      alignItems: "flex-end",
      marginRight: theme.spacing.xs,
    },
    balanceAmount: {
      fontSize: 15,
      fontWeight: "700",
    },
    balanceLabel: {
      fontSize: 12,
      fontWeight: "500",
      marginTop: 2,
    },
    // Ledger modal styles
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
    modalCloseButton: {
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
    modalHeaderSpacer: {
      width: 40,
    },
    modalContent: {
      padding: theme.spacing.md,
    },
    ledgerSummaryCard: {
      margin: theme.spacing.md,
      padding: theme.spacing.md,
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      ...theme.shadows.sm,
    },
    ledgerSummaryName: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    ledgerSummaryPhone: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    ledgerSummaryBalance: {
      marginTop: theme.spacing.md,
      paddingTop: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    ledgerSummaryLabel: {
      fontSize: 12,
      color: colors.textTertiary,
      marginBottom: 4,
    },
    ledgerSummaryAmount: {
      fontSize: 22,
      fontWeight: "700",
    },
    ledgerList: {
      flex: 1,
    },
    ledgerListContent: {
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
    },
    ledgerEntry: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    ledgerIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    ledgerDetails: {
      flex: 1,
    },
    ledgerTypeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    ledgerType: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
    },
    // STG-471: Voided entry styles
    ledgerEntryVoided: {
      opacity: 0.6,
      borderStyle: "dashed",
    },
    ledgerTextVoided: {
      textDecorationLine: "line-through",
      color: colors.textTertiary,
    },
    voidButton: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.error,
    },
    ledgerDescription: {
      fontSize: 13,
      color: colors.textPrimary,
      marginTop: 2,
    },
    ledgerDate: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    ledgerPaymentMethod: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: "500",
      marginTop: 2,
    },
    ledgerAmounts: {
      alignItems: "flex-end",
    },
    ledgerAmount: {
      fontSize: 14,
      fontWeight: "700",
    },
    ledgerRunningBalance: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    // Form styles
    formLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: theme.spacing.xs,
      marginTop: theme.spacing.md,
    },
    formInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      fontSize: 15,
      color: colors.textPrimary,
    },
    formTextArea: {
      minHeight: 80,
      textAlignVertical: "top",
    },
    paymentMethodRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    paymentMethodOption: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    paymentMethodActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },
    paymentMethodText: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.textTertiary,
    },
    paymentMethodTextActive: {
      color: colors.primary,
      fontWeight: "600",
    },
    submitButton: {
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      alignItems: "center",
      justifyContent: "center",
      marginTop: theme.spacing.lg,
    },
    submitButtonCredit: {
      backgroundColor: colors.primary,
    },
    submitButtonPayment: {
      backgroundColor: colors.success,
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textInverse,
    },
  }), [colors]);

  // Render customer card
  const renderCustomerCard = useCallback(
    ({ item }: { item: KhataCustomer }) => {
      const isOwes = item.balanceMinor > 0; // They owe store
      const isCredit = item.balanceMinor < 0; // Store owes them
      const balanceColor = isOwes
        ? colors.error
        : isCredit
          ? colors.success
          : colors.textSecondary;
      const balanceLabel = isOwes ? t("khata.owes") : isCredit ? t("khata.advance") : t("khata.settled");

      const isSelected = bulkSelecting && selectedPhones.has(item.phone);

      return (
        <Pressable
          accessibilityRole="button"
          style={[styles.customerCard, isSelected && { borderColor: colors.primary, borderWidth: 2 }]}
          onPress={() => bulkSelecting ? handleToggleCustomer(item.phone) : handleCustomerTap(item)}
          onLongPress={() => { if (!bulkSelecting) { setBulkSelecting(true); handleToggleCustomer(item.phone); } }}
        >
          <View style={styles.customerInfo}>
            {/* STG-472: Show checkbox in bulk selection mode */}
            {bulkSelecting && (
              <View style={{ marginRight: 8 }}>
                <MaterialCommunityIcons
                  name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
                  size={22}
                  color={isSelected ? colors.primary : colors.textTertiary}
                />
              </View>
            )}
            <View style={styles.customerAvatar}>
              <Text style={styles.customerAvatarText}>
                {(item.name || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.customerDetails}>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.customerPhone}>{item.phone}</Text>
              {item.lastEntryAt && (
                <Text style={styles.customerLastEntry}>
                  {t("khata.last")}: {formatDateDDMMYYYY(item.lastEntryAt)}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.customerBalance}>
            <Text style={[styles.balanceAmount, { color: balanceColor }]}>
              {formatMoney(Math.abs(item.balanceMinor))}
            </Text>
            <Text style={[styles.balanceLabel, { color: balanceColor }]}>{balanceLabel}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
        </Pressable>
      );
    },
    [handleCustomerTap, handleToggleCustomer, bulkSelecting, selectedPhones, colors, styles]
  );

  // STG-471: Handle voiding a khata entry — calls backend API to persist void
  const handleVoidEntry = useCallback((entry: KhataEntry) => {
    Alert.alert(
      t("khata.voidEntryTitle", "Void Entry"),
      t("khata.voidEntryConfirm", "Are you sure you want to void this {{type}} entry of {{amount}}? This will mark it as cancelled.", {
        type: entry.type === "CREDIT" ? t("khata.creditGivenLabel", "Credit Given").toLowerCase() : t("khata.paymentReceivedLabel", "Payment Received").toLowerCase(),
        amount: formatMoney(entry.amountMinor),
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("khata.voidButton", "Void"),
          style: "destructive",
          onPress: async () => {
            try {
              await apiClient.post(`/api/v1/pos/khata/entries/${entry.id}/void`);
              setVoidedEntries((prev) => new Set(prev).add(entry.id));
            } catch (err) {
              Alert.alert(
                t("common.error", "Error"),
                t("khata.voidFailed", "Failed to void entry. Please try again.")
              );
            }
          },
        },
      ]
    );
  }, [t]);

  // Render ledger entry
  const renderLedgerEntry = useCallback((entry: KhataEntry) => {
    const isVoided = voidedEntries.has(entry.id);
    const isCredit = entry.type === "CREDIT";
    const isPayment = entry.type === "PAYMENT";
    const entryColor = isVoided ? colors.textTertiary : isPayment ? colors.success : isCredit ? colors.error : colors.textPrimary;
    const entryIcon = isVoided ? "cancel" : isPayment ? "cash-plus" : isCredit ? "cash-minus" : "swap-horizontal";
    const entrySign = isPayment ? "+" : isCredit ? "-" : "";

    return (
      <View key={entry.id} style={[styles.ledgerEntry, isVoided && styles.ledgerEntryVoided]}>
        <View style={[styles.ledgerIcon, { backgroundColor: entryColor + "15" }]}>
          <MaterialCommunityIcons name={entryIcon as any} size={18} color={entryColor} />
        </View>
        <View style={styles.ledgerDetails}>
          <View style={styles.ledgerTypeRow}>
            <Text style={[styles.ledgerType, isVoided && styles.ledgerTextVoided]}>
              {isVoided
                ? t("khata.voided", "VOIDED")
                : entry.type === "CREDIT"
                  ? t("khata.creditGivenLabel", "Credit Given")
                  : entry.type === "PAYMENT"
                    ? t("khata.paymentReceivedLabel", "Payment Received")
                    : entry.type}
            </Text>
            {!isVoided && (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => handleVoidEntry(entry)}>
                <Text style={styles.voidButton}>{t("khata.voidButton", "Void")}</Text>
              </Pressable>
            )}
          </View>
          <Text style={[styles.ledgerDescription, isVoided && styles.ledgerTextVoided]} numberOfLines={1}>
            {entry.description}
          </Text>
          <Text style={styles.ledgerDate}>
            {formatDateDDMMYYYY(entry.createdAt)}{" "}
            {formatDateTime(entry.createdAt, { dateStyle: "short", timeStyle: "short" }).split(",").pop()?.trim()}
          </Text>
          {entry.paymentMethod && (
            <Text style={styles.ledgerPaymentMethod}>{t("khata.viaMethod", { method: entry.paymentMethod })}</Text>
          )}
        </View>
        <View style={styles.ledgerAmounts}>
          <Text style={[styles.ledgerAmount, { color: entryColor }, isVoided && styles.ledgerTextVoided]}>
            {entrySign}{formatMoney(entry.amountMinor)}
          </Text>
          {!isVoided && (
            <Text style={styles.ledgerRunningBalance}>
              {t("khata.bal")}: {formatMoney(entry.runningBalanceMinor)}
            </Text>
          )}
        </View>
      </View>
    );
  }, [colors, styles, voidedEntries, handleVoidEntry]);

  // Get entries for the selected customer
  const customerEntries = selectedCustomer
    ? entries.get(selectedCustomer.id) || []
    : [];

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <BackHeader title={t("khata.title")} onBack={onBack} />

      {/* Search bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("khata.searchPlaceholder")}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Search customers"
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => handleSearch("")} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <Pressable accessibilityRole="button" style={styles.actionButton} onPress={handleOpenCreditModal}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.actionButtonText, { color: colors.primary }]}>{t("khata.addCredit")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.actionButton} onPress={handleOpenPaymentModal}>
          <MaterialCommunityIcons name="cash-check" size={18} color={colors.success} />
          <Text style={[styles.actionButtonText, { color: colors.success }]}>{t("khata.recordPayment")}</Text>
        </Pressable>
      </View>

      {/* STG-472: Bulk actions bar */}
      {bulkSelecting && (
        <View style={[styles.actionRow, { backgroundColor: colors.primaryLight, paddingVertical: theme.spacing.sm, borderRadius: theme.borderRadius.md, marginHorizontal: theme.spacing.md, marginBottom: theme.spacing.sm }]}>
          <Pressable
            accessibilityRole="button"
            style={[styles.actionButton, { borderColor: colors.success }]}
            onPress={handleBulkMarkPaid}
            disabled={bulkProcessing || selectedPhones.size === 0}
          >
            {bulkProcessing ? (
              <ActivityIndicator size="small" color={colors.success} />
            ) : (
              <>
                <MaterialCommunityIcons name="check-all" size={18} color={colors.success} />
                <Text style={[styles.actionButtonText, { color: colors.success }]}>
                  {t("khata.bulkMarkPaid", "Mark Paid")} ({selectedPhones.size})
                </Text>
              </>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[styles.actionButton, { borderColor: colors.warning }]}
            onPress={handleBulkSendReminders}
            disabled={bulkProcessing || selectedPhones.size === 0}
          >
            <MaterialCommunityIcons name="bell-ring-outline" size={18} color={colors.warning} />
            <Text style={[styles.actionButtonText, { color: colors.warning }]}>
              {t("khata.bulkRemind", "Remind")} ({selectedPhones.size})
            </Text>
          </Pressable>
          <Pressable accessibilityLabel="Cancel bulk selection" accessibilityRole="button" onPress={handleToggleBulkSelect} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}

      {/* Customer list */}
      {loading && customers.length === 0 ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t("khata.loadingKhata")}</Text>
        </View>
      ) : customers.length === 0 ? (
        <EmptyState
          icon="book-open-variant"
          title={t("khata.emptyTitle")}
          description={t("khata.emptyDescription")}
        />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomerCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        />
      )}

      {/* Ledger Modal */}
      <Modal
        visible={showLedger}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseLedger}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable accessibilityLabel="Close ledger" accessibilityRole="button" style={styles.modalCloseButton} onPress={handleCloseLedger}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>
              {t("khata.customerLedger", { name: selectedCustomer?.name || t("khata.customer") })}
            </Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          {selectedCustomer && (
            <View style={styles.ledgerSummaryCard}>
              <Text style={styles.ledgerSummaryName}>{selectedCustomer.name}</Text>
              <Text style={styles.ledgerSummaryPhone}>{selectedCustomer.phone}</Text>
              <View style={styles.ledgerSummaryBalance}>
                <Text style={styles.ledgerSummaryLabel}>{t("khata.currentBalance")}</Text>
                <Text
                  style={[
                    styles.ledgerSummaryAmount,
                    {
                      color:
                        selectedCustomer.balanceMinor > 0
                          ? colors.error
                          : selectedCustomer.balanceMinor < 0
                            ? colors.success
                            : colors.textSecondary,
                    },
                  ]}
                >
                  {formatMoney(Math.abs(selectedCustomer.balanceMinor))}
                  {selectedCustomer.balanceMinor > 0
                    ? ` (${t("khata.owes").toLowerCase()})`
                    : selectedCustomer.balanceMinor < 0
                      ? ` (${t("khata.advance").toLowerCase()})`
                      : ` (${t("khata.settled").toLowerCase()})`}
                </Text>
              </View>
            </View>
          )}

          {entriesLoading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : customerEntries.length === 0 ? (
            <EmptyState
              icon="notebook-outline"
              title={t("khata.noEntries")}
              description={t("khata.noEntriesDescription")}
            />
          ) : (
            <ScrollView style={styles.ledgerList} contentContainerStyle={styles.ledgerListContent}>
              {customerEntries.map(renderLedgerEntry)}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Add Credit Modal — POS-027: KeyboardAvoidingView */}
      <Modal
        visible={showCreditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreditModal(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable accessibilityLabel="Close" accessibilityRole="button" style={styles.modalCloseButton} onPress={() => setShowCreditModal(false)}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t("khata.addCredit")}</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>{t("khata.customerPhoneLabel")}</Text>
            <TextInput
              style={styles.formInput}
              placeholder={t("khata.phonePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Customer phone number"
              value={creditPhone}
              onChangeText={setCreditPhone}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={styles.formLabel}>{t("khata.customerNameLabel")}</Text>
            <TextInput
              style={styles.formInput}
              placeholder={t("khata.namePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Customer name"
              value={creditName}
              onChangeText={setCreditName}
            />

            <Text style={styles.formLabel}>{t("khata.amountLabel")}</Text>
            <TextInput
              style={styles.formInput}
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Credit amount"
              value={creditAmount}
              onChangeText={setCreditAmount}
              keyboardType="decimal-pad"
            />

            <Text style={styles.formLabel}>{t("khata.descriptionLabel")}</Text>
            <TextInput
              style={[styles.formInput, styles.formTextArea]}
              placeholder={t("khata.descriptionPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Credit description"
              value={creditDescription}
              onChangeText={setCreditDescription}
              multiline
              numberOfLines={3}
            />

            <Pressable
              accessibilityRole="button"
              style={[styles.submitButton, styles.submitButtonCredit, creditSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmitCredit}
              disabled={creditSubmitting}
            >
              {creditSubmitting ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.submitButtonText}>{t("khata.addCreditEntry")}</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Record Payment Modal — POS-027: KeyboardAvoidingView */}
      <Modal
        visible={showPaymentModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable accessibilityLabel="Close" accessibilityRole="button" style={styles.modalCloseButton} onPress={() => setShowPaymentModal(false)}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t("khata.recordPayment")}</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>{t("khata.customerPhoneLabel")}</Text>
            <TextInput
              style={styles.formInput}
              placeholder={t("khata.phonePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Customer phone number"
              value={paymentPhone}
              onChangeText={setPaymentPhone}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={styles.formLabel}>{t("khata.amountLabel")}</Text>
            <TextInput
              style={styles.formInput}
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Payment amount"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="decimal-pad"
            />

            <Text style={styles.formLabel}>{t("khata.paymentMethodLabel")}</Text>
            <View style={styles.paymentMethodRow}>
              <Pressable
                accessibilityRole="button"
                style={[
                  styles.paymentMethodOption,
                  paymentMethod === "CASH" && styles.paymentMethodActive,
                ]}
                onPress={() => setPaymentMethod("CASH")}
              >
                <MaterialCommunityIcons
                  name="cash"
                  size={20}
                  color={paymentMethod === "CASH" ? colors.primary : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.paymentMethodText,
                    paymentMethod === "CASH" && styles.paymentMethodTextActive,
                  ]}
                >
                  {t("khata.cash")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={[
                  styles.paymentMethodOption,
                  paymentMethod === "UPI" && styles.paymentMethodActive,
                ]}
                onPress={() => setPaymentMethod("UPI")}
              >
                <MaterialCommunityIcons
                  name="cellphone-nfc"
                  size={20}
                  color={paymentMethod === "UPI" ? colors.primary : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.paymentMethodText,
                    paymentMethod === "UPI" && styles.paymentMethodTextActive,
                  ]}
                >
                  {t("khata.upi")}
                </Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              style={[styles.submitButton, styles.submitButtonPayment, paymentSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmitPayment}
              disabled={paymentSubmitting}
            >
              {paymentSubmitting ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.submitButtonText}>{t("khata.recordPayment")}</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

