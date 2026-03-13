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

import { useTranslation } from "react-i18next";
import { theme, useThemeColors } from "../theme";
import { formatMoney } from "../utils/money";
import { formatDateTime } from "../i18n/formatters";
import { useKhataStore } from "../stores/khataStore";
import type { KhataCustomer, KhataEntry } from "../services/khataService";
import { BackHeader } from "../components/ui/BackHeader";
import EmptyState from "../components/ui/EmptyState";

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

  // Payment modal state
  const [paymentPhone, setPaymentPhone] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "UPI">("CASH");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

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
      Alert.alert(t("khata.errorTitle"), error);
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
    const phone = creditPhone.trim();
    const amountStr = creditAmount.trim();
    if (!phone || phone.length < 10) {
      Alert.alert(t("khata.invalidPhone"), t("khata.invalidPhoneMessage"));
      return;
    }
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
    const phone = paymentPhone.trim();
    const amountStr = paymentAmount.trim();
    if (!phone || phone.length < 10) {
      Alert.alert(t("khata.invalidPhone"), t("khata.invalidPhoneMessage"));
      return;
    }
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
      fontSize: 11,
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
      fontSize: 11,
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
    ledgerType: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
    },
    ledgerDescription: {
      fontSize: 13,
      color: colors.textPrimary,
      marginTop: 2,
    },
    ledgerDate: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: 2,
    },
    ledgerPaymentMethod: {
      fontSize: 11,
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
      fontSize: 11,
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
      backgroundColor: colors.error,
    },
    submitButtonPayment: {
      backgroundColor: colors.success,
    },
    submitButtonDisabled: {
      opacity: 0.6,
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

      return (
        <Pressable accessibilityRole="button" style={styles.customerCard} onPress={() => handleCustomerTap(item)}>
          <View style={styles.customerInfo}>
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
    [handleCustomerTap, colors, styles]
  );

  // Render ledger entry
  const renderLedgerEntry = useCallback((entry: KhataEntry) => {
    const isCredit = entry.type === "CREDIT";
    const isPayment = entry.type === "PAYMENT";
    const entryColor = isPayment ? colors.success : isCredit ? colors.error : colors.textPrimary;
    const entryIcon = isPayment ? "cash-plus" : isCredit ? "cash-minus" : "swap-horizontal";
    const entrySign = isPayment ? "+" : isCredit ? "-" : "";

    return (
      <View key={entry.id} style={styles.ledgerEntry}>
        <View style={[styles.ledgerIcon, { backgroundColor: entryColor + "15" }]}>
          <MaterialCommunityIcons name={entryIcon as any} size={18} color={entryColor} />
        </View>
        <View style={styles.ledgerDetails}>
          <Text style={styles.ledgerType}>{entry.type}</Text>
          <Text style={styles.ledgerDescription} numberOfLines={1}>
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
          <Text style={[styles.ledgerAmount, { color: entryColor }]}>
            {entrySign}{formatMoney(entry.amountMinor)}
          </Text>
          <Text style={styles.ledgerRunningBalance}>
            {t("khata.bal")}: {formatMoney(entry.runningBalanceMinor)}
          </Text>
        </View>
      </View>
    );
  }, [colors, styles]);

  // Get entries for the selected customer
  const customerEntries = selectedCustomer
    ? entries.get(selectedCustomer.id) || []
    : [];

  return (
    <View style={styles.container}>
      <BackHeader title={t("khata.title")} onBack={onBack} />

      {/* Search bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("khata.searchPlaceholder")}
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable accessibilityRole="button" onPress={() => handleSearch("")} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <Pressable accessibilityRole="button" style={styles.actionButton} onPress={handleOpenCreditModal}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.error} />
          <Text style={[styles.actionButtonText, { color: colors.error }]}>{t("khata.addCredit")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.actionButton} onPress={handleOpenPaymentModal}>
          <MaterialCommunityIcons name="cash-check" size={18} color={colors.success} />
          <Text style={[styles.actionButtonText, { color: colors.success }]}>{t("khata.recordPayment")}</Text>
        </Pressable>
      </View>

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
            <Pressable accessibilityRole="button" style={styles.modalCloseButton} onPress={handleCloseLedger}>
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
            <Pressable accessibilityRole="button" style={styles.modalCloseButton} onPress={() => setShowCreditModal(false)}>
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
              value={creditName}
              onChangeText={setCreditName}
            />

            <Text style={styles.formLabel}>{t("khata.amountLabel")}</Text>
            <TextInput
              style={styles.formInput}
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
              value={creditAmount}
              onChangeText={setCreditAmount}
              keyboardType="decimal-pad"
            />

            <Text style={styles.formLabel}>{t("khata.descriptionLabel")}</Text>
            <TextInput
              style={[styles.formInput, styles.formTextArea]}
              placeholder={t("khata.descriptionPlaceholder")}
              placeholderTextColor={colors.textTertiary}
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
            <Pressable accessibilityRole="button" style={styles.modalCloseButton} onPress={() => setShowPaymentModal(false)}>
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

