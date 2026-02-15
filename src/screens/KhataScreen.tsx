// T-154: Khata (Credit Book) Screen
// Main list of customers with credit/debit balance, ledger view, add credit/payment modals
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../theme";
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

  useEffect(() => {
    void fetchCustomers();
  }, []);

  useEffect(() => {
    if (error) {
      Alert.alert("Error", error);
      clearError();
    }
  }, [error]);

  const handleSearch = useCallback(
    (text: string) => {
      setSearchQuery(text);
      void fetchCustomers(text || undefined);
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
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit phone number.");
      return;
    }
    const amountMinor = Math.round(parseFloat(amountStr) * 100);
    if (!amountStr || isNaN(amountMinor) || amountMinor <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }
    setCreditSubmitting(true);
    const success = await addEntry({
      customerPhone: phone,
      customerName: creditName.trim() || undefined,
      type: "CREDIT",
      amountMinor,
      description: creditDescription.trim() || "Credit given",
    });
    setCreditSubmitting(false);
    if (success) {
      setShowCreditModal(false);
      void fetchCustomers(searchQuery || undefined);
      Alert.alert("Success", "Credit entry added.");
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
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit phone number.");
      return;
    }
    const amountMinor = Math.round(parseFloat(amountStr) * 100);
    if (!amountStr || isNaN(amountMinor) || amountMinor <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
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
      Alert.alert("Success", "Payment recorded.");
    }
  }, [paymentPhone, paymentAmount, paymentMethod, recordPayment, fetchCustomers, searchQuery]);

  // Render customer card
  const renderCustomerCard = useCallback(
    ({ item }: { item: KhataCustomer }) => {
      const isOwes = item.balanceMinor > 0; // They owe store
      const isCredit = item.balanceMinor < 0; // Store owes them
      const balanceColor = isOwes
        ? theme.colors.error
        : isCredit
          ? theme.colors.success
          : theme.colors.textSecondary;
      const balanceLabel = isOwes ? "Owes" : isCredit ? "Advance" : "Settled";

      return (
        <Pressable style={styles.customerCard} onPress={() => handleCustomerTap(item)}>
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
                  Last: {formatDateDDMMYYYY(item.lastEntryAt)}
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
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textTertiary} />
        </Pressable>
      );
    },
    [handleCustomerTap]
  );

  // Render ledger entry
  const renderLedgerEntry = useCallback((entry: KhataEntry) => {
    const isCredit = entry.type === "CREDIT";
    const isPayment = entry.type === "PAYMENT";
    const entryColor = isPayment ? theme.colors.success : isCredit ? theme.colors.error : theme.colors.textPrimary;
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
            <Text style={styles.ledgerPaymentMethod}>via {entry.paymentMethod}</Text>
          )}
        </View>
        <View style={styles.ledgerAmounts}>
          <Text style={[styles.ledgerAmount, { color: entryColor }]}>
            {entrySign}{formatMoney(entry.amountMinor)}
          </Text>
          <Text style={styles.ledgerRunningBalance}>
            Bal: {formatMoney(entry.runningBalanceMinor)}
          </Text>
        </View>
      </View>
    );
  }, []);

  // Get entries for the selected customer
  const customerEntries = selectedCustomer
    ? entries.get(selectedCustomer.id) || []
    : [];

  return (
    <View style={styles.container}>
      <BackHeader title="Khata (Credit Book)" onBack={onBack} />

      {/* Search bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone..."
          placeholderTextColor={theme.colors.textTertiary}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => handleSearch("")} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={18} color={theme.colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <Pressable style={styles.actionButton} onPress={handleOpenCreditModal}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color={theme.colors.error} />
          <Text style={[styles.actionButtonText, { color: theme.colors.error }]}>Add Credit</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={handleOpenPaymentModal}>
          <MaterialCommunityIcons name="cash-check" size={18} color={theme.colors.success} />
          <Text style={[styles.actionButtonText, { color: theme.colors.success }]}>Record Payment</Text>
        </Pressable>
      </View>

      {/* Customer list */}
      {loading && customers.length === 0 ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading khata...</Text>
        </View>
      ) : customers.length === 0 ? (
        <EmptyState
          icon="book-open-variant"
          title="No credit entries yet"
          description="Add credit or record payments to start tracking your khata."
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
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
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
            <Pressable style={styles.modalCloseButton} onPress={handleCloseLedger}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>
              {selectedCustomer?.name || "Customer"} Ledger
            </Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          {selectedCustomer && (
            <View style={styles.ledgerSummaryCard}>
              <Text style={styles.ledgerSummaryName}>{selectedCustomer.name}</Text>
              <Text style={styles.ledgerSummaryPhone}>{selectedCustomer.phone}</Text>
              <View style={styles.ledgerSummaryBalance}>
                <Text style={styles.ledgerSummaryLabel}>Current Balance</Text>
                <Text
                  style={[
                    styles.ledgerSummaryAmount,
                    {
                      color:
                        selectedCustomer.balanceMinor > 0
                          ? theme.colors.error
                          : selectedCustomer.balanceMinor < 0
                            ? theme.colors.success
                            : theme.colors.textSecondary,
                    },
                  ]}
                >
                  {formatMoney(Math.abs(selectedCustomer.balanceMinor))}
                  {selectedCustomer.balanceMinor > 0
                    ? " (owes)"
                    : selectedCustomer.balanceMinor < 0
                      ? " (advance)"
                      : " (settled)"}
                </Text>
              </View>
            </View>
          )}

          {entriesLoading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : customerEntries.length === 0 ? (
            <EmptyState
              icon="notebook-outline"
              title="No entries"
              description="No credit or payment entries found for this customer."
            />
          ) : (
            <ScrollView style={styles.ledgerList} contentContainerStyle={styles.ledgerListContent}>
              {customerEntries.map(renderLedgerEntry)}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Add Credit Modal */}
      <Modal
        visible={showCreditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreditModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalCloseButton} onPress={() => setShowCreditModal(false)}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>Add Credit</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>Customer Phone *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="10-digit phone number"
              placeholderTextColor={theme.colors.textTertiary}
              value={creditPhone}
              onChangeText={setCreditPhone}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={styles.formLabel}>Customer Name (new customer)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Name (optional for existing)"
              placeholderTextColor={theme.colors.textTertiary}
              value={creditName}
              onChangeText={setCreditName}
            />

            <Text style={styles.formLabel}>Amount (₹) *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textTertiary}
              value={creditAmount}
              onChangeText={setCreditAmount}
              keyboardType="decimal-pad"
            />

            <Text style={styles.formLabel}>Description</Text>
            <TextInput
              style={[styles.formInput, styles.formTextArea]}
              placeholder="e.g. Purchased groceries on credit"
              placeholderTextColor={theme.colors.textTertiary}
              value={creditDescription}
              onChangeText={setCreditDescription}
              multiline
              numberOfLines={3}
            />

            <Pressable
              style={[styles.submitButton, styles.submitButtonCredit, creditSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmitCredit}
              disabled={creditSubmitting}
            >
              {creditSubmitting ? (
                <ActivityIndicator size="small" color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.submitButtonText}>Add Credit Entry</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        visible={showPaymentModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalCloseButton} onPress={() => setShowPaymentModal(false)}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>Record Payment</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>Customer Phone *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="10-digit phone number"
              placeholderTextColor={theme.colors.textTertiary}
              value={paymentPhone}
              onChangeText={setPaymentPhone}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={styles.formLabel}>Amount (₹) *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textTertiary}
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="decimal-pad"
            />

            <Text style={styles.formLabel}>Payment Method *</Text>
            <View style={styles.paymentMethodRow}>
              <Pressable
                style={[
                  styles.paymentMethodOption,
                  paymentMethod === "CASH" && styles.paymentMethodActive,
                ]}
                onPress={() => setPaymentMethod("CASH")}
              >
                <MaterialCommunityIcons
                  name="cash"
                  size={20}
                  color={paymentMethod === "CASH" ? theme.colors.primary : theme.colors.textTertiary}
                />
                <Text
                  style={[
                    styles.paymentMethodText,
                    paymentMethod === "CASH" && styles.paymentMethodTextActive,
                  ]}
                >
                  Cash
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.paymentMethodOption,
                  paymentMethod === "UPI" && styles.paymentMethodActive,
                ]}
                onPress={() => setPaymentMethod("UPI")}
              >
                <MaterialCommunityIcons
                  name="cellphone-nfc"
                  size={20}
                  color={paymentMethod === "UPI" ? theme.colors.primary : theme.colors.textTertiary}
                />
                <Text
                  style={[
                    styles.paymentMethodText,
                    paymentMethod === "UPI" && styles.paymentMethodTextActive,
                  ]}
                >
                  UPI
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.submitButton, styles.submitButtonPayment, paymentSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmitPayment}
              disabled={paymentSubmitting}
            >
              {paymentSubmitting ? (
                <ActivityIndicator size="small" color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.submitButtonText}>Record Payment</Text>
              )}
            </Pressable>
          </ScrollView>
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
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    margin: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    backgroundColor: theme.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  customerAvatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  customerPhone: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  customerLastEntry: {
    fontSize: 11,
    color: theme.colors.textTertiary,
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
  modalCloseButton: {
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
  modalHeaderSpacer: {
    width: 40,
  },
  modalContent: {
    padding: theme.spacing.md,
  },
  ledgerSummaryCard: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.sm,
  },
  ledgerSummaryName: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  ledgerSummaryPhone: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  ledgerSummaryBalance: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  ledgerSummaryLabel: {
    fontSize: 12,
    color: theme.colors.textTertiary,
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
  },
  ledgerDescription: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
  ledgerDate: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  ledgerPaymentMethod: {
    fontSize: 11,
    color: theme.colors.primary,
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
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  // Form styles
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  formInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 15,
    color: theme.colors.textPrimary,
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
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  paymentMethodActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  paymentMethodText: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textTertiary,
  },
  paymentMethodTextActive: {
    color: theme.colors.primary,
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
    backgroundColor: theme.colors.error,
  },
  submitButtonPayment: {
    backgroundColor: theme.colors.success,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
});
