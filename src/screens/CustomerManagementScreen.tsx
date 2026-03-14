// T-196: Customer Management Screen
// Customer list with search, detail view, purchase history, Khata balance, add/edit customer

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import { BackHeader } from "../components/ui/BackHeader";
import EmptyState from "../components/ui/EmptyState";
import { useCustomerStore } from "../stores/customerStore";
import type { Customer, CustomerDetail } from "../services/customerService";

// =============================================================================
// HELPERS
// =============================================================================

function formatIndianDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
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

interface CustomerManagementScreenProps {
  onBack?: () => void;
}

export default function CustomerManagementScreen({
  onBack,
}: CustomerManagementScreenProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const {
    customers,
    selectedCustomer,
    loading,
    detailLoading,
    error,
    fetchCustomers,
    fetchCustomerDetail,
    createCustomer,
    updateCustomer,
    setSelectedCustomer,
    clearError,
  } = useCustomerStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Detail modal
  const [detailVisible, setDetailVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [saving, setSaving] = useState(false);

  // Add customer modal
  const [addVisible, setAddVisible] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addAddress, setAddAddress] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // POS-032: Single fetch effect — debounced search covers initial mount too
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchCustomers(searchQuery || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchCustomers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCustomers(searchQuery || undefined);
    setRefreshing(false);
  }, [fetchCustomers, searchQuery]);

  // Open customer detail
  // UIUX-POS-014: Close modal on detail fetch failure instead of leaving it open/empty
  const handleOpenDetail = useCallback(
    async (customer: Customer) => {
      setDetailVisible(true);
      setEditMode(false);
      await fetchCustomerDetail(customer.id);
      // If fetch failed (error set, no selectedCustomer), close modal
      const state = useCustomerStore.getState();
      if (state.error && !state.selectedCustomer) {
        setDetailVisible(false);
        Alert.alert(t("common.error"), state.error);
      }
    },
    [fetchCustomerDetail, t]
  );

  // Close detail
  const handleCloseDetail = useCallback(() => {
    setDetailVisible(false);
    setSelectedCustomer(null);
    setEditMode(false);
  }, [setSelectedCustomer]);

  // Enable edit mode
  const handleEditMode = useCallback(() => {
    if (!selectedCustomer) return;
    setEditName(selectedCustomer.name);
    setEditEmail(selectedCustomer.email || "");
    setEditAddress(selectedCustomer.address || "");
    setEditMode(true);
  }, [selectedCustomer]);

  // Save edit
  const handleSaveEdit = useCallback(async () => {
    if (!selectedCustomer) return;
    setSaving(true);
    const success = await updateCustomer(selectedCustomer.id, {
      name: editName || undefined,
      email: editEmail || undefined,
      address: editAddress || undefined,
    });
    setSaving(false);
    if (success) {
      setEditMode(false);
      // Refresh detail
      await fetchCustomerDetail(selectedCustomer.id);
    } else {
      Alert.alert(t("common.error"), t("common.tryAgain"));
    }
  }, [
    selectedCustomer,
    editName,
    editEmail,
    editAddress,
    updateCustomer,
    fetchCustomerDetail,
  ]);

  // Call customer
  const handleCall = useCallback((phone: string) => {
    const phoneNumber = phone.startsWith("+91")
      ? phone
      : `+91${phone.replace(/^0+/, "")}`;
    void Linking.openURL(`tel:${phoneNumber}`);
  }, []);

  // Add customer
  const handleAddCustomer = useCallback(async () => {
    if (!addName.trim()) {
      Alert.alert(t("common.required"), t("validation.nameRequired"));
      return;
    }
    if (!addPhone.trim() || addPhone.trim().length < 10) {
      Alert.alert(t("common.required"), t("validation.phoneRequired"));
      return;
    }

    setAddSaving(true);
    const success = await createCustomer({
      name: addName.trim(),
      phone: addPhone.trim(),
      email: addEmail.trim() || undefined,
      address: addAddress.trim() || undefined,
    });
    setAddSaving(false);

    if (success) {
      setAddVisible(false);
      setAddName("");
      setAddPhone("");
      setAddEmail("");
      setAddAddress("");
      Alert.alert(t("common.success"), t("common.done"));
    } else {
      // UIUX-POS-010: Read fresh error from store to avoid stale closure
      const freshError = useCustomerStore.getState().error;
      Alert.alert(t("common.error"), freshError || t("common.tryAgain"));
    }
  }, [addName, addPhone, addEmail, addAddress, createCustomer, t]);

  // =========================================================================
  // STYLES
  // =========================================================================

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContent: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing.xl,
    },
    loadingText: {
      marginTop: theme.spacing.md,
      fontSize: 14,
      color: colors.textSecondary,
    },
    // Search
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      margin: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: theme.spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.textPrimary,
      paddingVertical: 2,
    },
    // Customer list
    listContent: {
      padding: theme.spacing.md,
      paddingTop: 0,
      paddingBottom: theme.spacing.xxxl,
    },
    customerCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      gap: theme.spacing.md,
    },
    customerAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primaryLight,
      alignItems: "center",
      justifyContent: "center",
    },
    customerAvatarText: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.primary,
    },
    customerInfo: {
      flex: 1,
    },
    customerName: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    customerPhone: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    customerMeta: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
    },
    customerMetaText: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    customerMetaDot: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    // FAB
    fab: {
      position: "absolute",
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...theme.shadows.lg,
    },
    // Modal shared
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
    headerSpacer: {
      width: 40,
    },
    editButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    saveButton: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
    },
    saveButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.primary,
    },
    // Detail
    detailScroll: {
      flex: 1,
    },
    detailContent: {
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
    },
    profileCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      alignItems: "center",
      ...theme.shadows.sm,
      marginBottom: theme.spacing.md,
    },
    profileAvatarLarge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primaryLight,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.md,
    },
    profileAvatarText: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.primary,
    },
    profileName: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    profilePhoneRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 4,
    },
    profilePhone: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    profileEmail: {
      fontSize: 13,
      color: colors.textTertiary,
      marginBottom: 2,
    },
    profileAddress: {
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: "center",
      marginBottom: theme.spacing.sm,
    },
    callButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.success,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.borderRadius.md,
      marginTop: theme.spacing.sm,
      gap: theme.spacing.xs,
    },
    callButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textInverse,
    },
    // Stats
    statsRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm,
      alignItems: "center",
      ...theme.shadows.sm,
    },
    statValue: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 2,
      textAlign: "center",
    },
    statLabel: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: "center",
    },
    // Purchases
    detailSectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    purchaseRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    purchaseInfo: {
      flex: 1,
    },
    purchaseBill: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    purchaseDate: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    purchaseAmount: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.primaryDark,
    },
    // Edit fields
    editFields: {
      width: "100%",
      marginTop: theme.spacing.md,
    },
    editFieldLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: theme.spacing.xs,
      marginTop: theme.spacing.sm,
    },
    editFieldInput: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      fontSize: 14,
      color: colors.textPrimary,
    },
    editFieldMultiline: {
      minHeight: 80,
      textAlignVertical: "top",
    },
    // Add button
    addButton: {
      backgroundColor: colors.primary,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      alignItems: "center",
      marginTop: theme.spacing.lg,
    },
    addButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textInverse,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
  }), [colors]);

  // Render customer card
  const renderCustomerItem = useCallback(
    ({ item }: { item: Customer }) => (
      <Pressable accessibilityRole="button" style={styles.customerCard} onPress={() => handleOpenDetail(item)}>
        <View style={styles.customerAvatar}>
          <Text style={styles.customerAvatarText}>
            {(item.name || "?").charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.customerInfo}>
          <Text style={styles.customerName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.customerPhone}>+91 {item.phone}</Text>
          <View style={styles.customerMeta}>
            <Text style={styles.customerMetaText}>
              {formatMoney(item.totalPurchasesMinor)} purchases
            </Text>
            <Text style={styles.customerMetaDot}> | </Text>
            <Text style={styles.customerMetaText}>
              Last: {formatIndianDate(item.lastVisitAt)}
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={22}
          color={colors.textSecondary}
        />
      </Pressable>
    ),
    [handleOpenDetail, styles]
  );

  return (
    <View style={styles.container}>
      <BackHeader title="Customers" onBack={onBack} />

      {/* Search bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons
          name="magnify"
          size={20}
          color={colors.textTertiary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable accessibilityRole="button" onPress={() => setSearchQuery("")}>
            <MaterialCommunityIcons
              name="close-circle"
              size={18}
              color={colors.textTertiary}
            />
          </Pressable>
        )}
      </View>

      {/* Customer list */}
      {loading && customers.length === 0 ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading customers...</Text>
        </View>
      ) : customers.length === 0 ? (
        <EmptyState
          icon="account-group-outline"
          title="No customers found"
          description={
            searchQuery
              ? "Try a different search term."
              : "Add your first customer to get started."
          }
        />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomerItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        />
      )}

      {/* FAB: Add Customer */}
      <Pressable
        accessibilityRole="button"
        style={styles.fab}
        onPress={() => setAddVisible(true)}
      >
        <MaterialCommunityIcons
          name="plus"
          size={24}
          color={colors.textInverse}
        />
      </Pressable>

      {/* ================================================================= */}
      {/* DETAIL MODAL */}
      {/* ================================================================= */}
      <Modal
        visible={detailVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseDetail}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable accessibilityRole="button" style={styles.modalCloseButton} onPress={handleCloseDetail}>
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={colors.textPrimary}
              />
            </Pressable>
            <Text style={styles.modalTitle}>Customer Detail</Text>
            {selectedCustomer && !editMode && (
              <Pressable accessibilityRole="button" style={styles.editButton} onPress={handleEditMode}>
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={20}
                  color={colors.primary}
                />
              </Pressable>
            )}
            {editMode && (
              <Pressable
                accessibilityRole="button"
                style={styles.saveButton}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </Pressable>
            )}
            {!selectedCustomer && !editMode && <View style={styles.headerSpacer} />}
          </View>

          {detailLoading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : selectedCustomer ? (
            <ScrollView
              style={styles.detailScroll}
              contentContainerStyle={styles.detailContent}
            >
              {/* Profile section */}
              <View style={styles.profileCard}>
                <View style={styles.profileAvatarLarge}>
                  <Text style={styles.profileAvatarText}>
                    {(selectedCustomer.name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>

                {editMode ? (
                  <View style={styles.editFields}>
                    <Text style={styles.editFieldLabel}>Name</Text>
                    <TextInput
                      style={styles.editFieldInput}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Customer name"
                      placeholderTextColor={colors.textTertiary}
                    />
                    <Text style={styles.editFieldLabel}>Email</Text>
                    <TextInput
                      style={styles.editFieldInput}
                      value={editEmail}
                      onChangeText={setEditEmail}
                      placeholder="Email (optional)"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    <Text style={styles.editFieldLabel}>Address</Text>
                    <TextInput
                      style={[styles.editFieldInput, styles.editFieldMultiline]}
                      value={editAddress}
                      onChangeText={setEditAddress}
                      placeholder="Address (optional)"
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      numberOfLines={3}
                    />
                  </View>
                ) : (
                  <>
                    <Text style={styles.profileName}>{selectedCustomer.name}</Text>
                    <View style={styles.profilePhoneRow}>
                      <MaterialCommunityIcons name="phone-outline" size={16} color={colors.textSecondary} />
                      <Text style={styles.profilePhone}>
                        +91 {selectedCustomer.phone}
                      </Text>
                      {selectedCustomer.phone && selectedCustomer.phone.replace(/\D/g, "").length >= 10 && (
                        <Pressable
                          accessibilityRole="link"
                          hitSlop={8}
                          onPress={() => {
                            let phone = selectedCustomer.phone.replace(/\D/g, "");
                            if (phone.length === 10) phone = `91${phone}`;
                            void Linking.openURL(`https://wa.me/${phone}`);
                          }}
                        >
                          <MaterialCommunityIcons name="whatsapp" size={20} color="#25D366" />
                        </Pressable>
                      )}
                    </View>
                    {selectedCustomer.email && (
                      <Text style={styles.profileEmail}>{selectedCustomer.email}</Text>
                    )}
                    {selectedCustomer.address && (
                      <Text style={styles.profileAddress}>
                        {selectedCustomer.address}
                      </Text>
                    )}
                  </>
                )}

                {/* Call button */}
                {!editMode && (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.callButton}
                    onPress={() => handleCall(selectedCustomer.phone)}
                  >
                    <MaterialCommunityIcons
                      name="phone-outline"
                      size={18}
                      color={colors.textInverse}
                    />
                    <Text style={styles.callButtonText}>Call Customer</Text>
                  </Pressable>
                )}
              </View>

              {/* Stats */}
              {!editMode && (
                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                      {formatMoney(selectedCustomer.totalPurchasesMinor)}
                    </Text>
                    <Text style={styles.statLabel}>Total Purchases</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                      {selectedCustomer.visitCount}
                    </Text>
                    <Text style={styles.statLabel}>Visits</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                      {formatIndianDate(selectedCustomer.lastVisitAt)}
                    </Text>
                    <Text style={styles.statLabel}>Last Visit</Text>
                  </View>
                </View>
              )}

              {/* Purchase history */}
              {!editMode && selectedCustomer.purchases && selectedCustomer.purchases.length > 0 && (
                <>
                  <Text style={styles.detailSectionTitle}>
                    Purchase History ({selectedCustomer.purchases.length})
                  </Text>
                  {selectedCustomer.purchases.slice(0, 20).map((purchase) => (
                    <View key={purchase.saleId} style={styles.purchaseRow}>
                      <View style={styles.purchaseInfo}>
                        <Text style={styles.purchaseBill}>
                          #{purchase.billRef}
                        </Text>
                        <Text style={styles.purchaseDate}>
                          {formatIndianDate(purchase.createdAt)} |{" "}
                          {purchase.itemCount} items | {purchase.paymentMode}
                        </Text>
                      </View>
                      <Text style={styles.purchaseAmount}>
                        {formatMoney(purchase.totalMinor)}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      {/* ================================================================= */}
      {/* ADD CUSTOMER MODAL */}
      {/* ================================================================= */}
      <Modal
        visible={addVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable
              accessibilityRole="button"
              style={styles.modalCloseButton}
              onPress={() => setAddVisible(false)}
            >
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={colors.textPrimary}
              />
            </Pressable>
            <Text style={styles.modalTitle}>Add Customer</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.detailScroll}
            contentContainerStyle={styles.detailContent}
          >
            <Text style={styles.editFieldLabel}>Name *</Text>
            <TextInput
              style={styles.editFieldInput}
              value={addName}
              onChangeText={setAddName}
              placeholder="Customer name"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="words"
            />

            <Text style={styles.editFieldLabel}>Phone *</Text>
            <TextInput
              style={styles.editFieldInput}
              value={addPhone}
              onChangeText={setAddPhone}
              placeholder="10-digit phone number"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={styles.editFieldLabel}>Email</Text>
            <TextInput
              style={styles.editFieldInput}
              value={addEmail}
              onChangeText={setAddEmail}
              placeholder="Email (optional)"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.editFieldLabel}>Address</Text>
            <TextInput
              style={[styles.editFieldInput, styles.editFieldMultiline]}
              value={addAddress}
              onChangeText={setAddAddress}
              placeholder="Address (optional)"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
            />

            {/* POS-031: Credit limit field removed — not sent to API */}

            <Pressable
              accessibilityRole="button"
              style={[
                styles.addButton,
                (!addName.trim() || !addPhone.trim() || addSaving) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleAddCustomer}
              disabled={!addName.trim() || !addPhone.trim() || addSaving}
            >
              {addSaving ? (
                <ActivityIndicator
                  size="small"
                  color={colors.textInverse}
                />
              ) : (
                <Text style={styles.addButtonText}>Add Customer</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
