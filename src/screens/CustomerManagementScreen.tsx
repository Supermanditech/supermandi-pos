// T-196: Customer Management Screen
// Customer list with search, detail view, purchase history, Khata balance, add/edit customer

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
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
  const [addCreditLimit, setAddCreditLimit] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // Load customers on mount
  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  // Search with debounce
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
  const handleOpenDetail = useCallback(
    async (customer: Customer) => {
      setDetailVisible(true);
      setEditMode(false);
      await fetchCustomerDetail(customer.id);
    },
    [fetchCustomerDetail]
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
      Alert.alert("Error", "Failed to update customer.");
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
      Alert.alert("Required", "Customer name is required.");
      return;
    }
    if (!addPhone.trim() || addPhone.trim().length < 10) {
      Alert.alert("Required", "A valid 10-digit phone number is required.");
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
      setAddCreditLimit("");
      Alert.alert("Success", "Customer added successfully.");
    } else {
      Alert.alert("Error", error || "Failed to add customer.");
    }
  }, [addName, addPhone, addEmail, addAddress, createCustomer, error]);

  // Render customer card
  const renderCustomerItem = useCallback(
    ({ item }: { item: Customer }) => (
      <Pressable style={styles.customerCard} onPress={() => handleOpenDetail(item)}>
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
          color={theme.colors.textSecondary}
        />
      </Pressable>
    ),
    [handleOpenDetail]
  );

  return (
    <View style={styles.container}>
      <BackHeader title="Customers" onBack={onBack} />

      {/* Search bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons
          name="magnify"
          size={20}
          color={theme.colors.textTertiary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone..."
          placeholderTextColor={theme.colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")}>
            <MaterialCommunityIcons
              name="close-circle"
              size={18}
              color={theme.colors.textTertiary}
            />
          </Pressable>
        )}
      </View>

      {/* Customer list */}
      {loading && customers.length === 0 ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
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
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}

      {/* FAB: Add Customer */}
      <Pressable
        style={styles.fab}
        onPress={() => setAddVisible(true)}
      >
        <MaterialCommunityIcons
          name="plus"
          size={24}
          color={theme.colors.textInverse}
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
            <Pressable style={styles.modalCloseButton} onPress={handleCloseDetail}>
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={theme.colors.textPrimary}
              />
            </Pressable>
            <Text style={styles.modalTitle}>Customer Detail</Text>
            {selectedCustomer && !editMode && (
              <Pressable style={styles.editButton} onPress={handleEditMode}>
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={20}
                  color={theme.colors.primary}
                />
              </Pressable>
            )}
            {editMode && (
              <Pressable
                style={styles.saveButton}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </Pressable>
            )}
            {!selectedCustomer && !editMode && <View style={styles.headerSpacer} />}
          </View>

          {detailLoading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
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
                      placeholderTextColor={theme.colors.textTertiary}
                    />
                    <Text style={styles.editFieldLabel}>Email</Text>
                    <TextInput
                      style={styles.editFieldInput}
                      value={editEmail}
                      onChangeText={setEditEmail}
                      placeholder="Email (optional)"
                      placeholderTextColor={theme.colors.textTertiary}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    <Text style={styles.editFieldLabel}>Address</Text>
                    <TextInput
                      style={[styles.editFieldInput, styles.editFieldMultiline]}
                      value={editAddress}
                      onChangeText={setEditAddress}
                      placeholder="Address (optional)"
                      placeholderTextColor={theme.colors.textTertiary}
                      multiline
                      numberOfLines={3}
                    />
                  </View>
                ) : (
                  <>
                    <Text style={styles.profileName}>{selectedCustomer.name}</Text>
                    <Text style={styles.profilePhone}>
                      +91 {selectedCustomer.phone}
                    </Text>
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
                    style={styles.callButton}
                    onPress={() => handleCall(selectedCustomer.phone)}
                  >
                    <MaterialCommunityIcons
                      name="phone-outline"
                      size={18}
                      color={theme.colors.textInverse}
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
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable
              style={styles.modalCloseButton}
              onPress={() => setAddVisible(false)}
            >
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={theme.colors.textPrimary}
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
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="words"
            />

            <Text style={styles.editFieldLabel}>Phone *</Text>
            <TextInput
              style={styles.editFieldInput}
              value={addPhone}
              onChangeText={setAddPhone}
              placeholder="10-digit phone number"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={styles.editFieldLabel}>Email</Text>
            <TextInput
              style={styles.editFieldInput}
              value={addEmail}
              onChangeText={setAddEmail}
              placeholder="Email (optional)"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.editFieldLabel}>Address</Text>
            <TextInput
              style={[styles.editFieldInput, styles.editFieldMultiline]}
              value={addAddress}
              onChangeText={setAddAddress}
              placeholder="Address (optional)"
              placeholderTextColor={theme.colors.textTertiary}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.editFieldLabel}>Credit Limit</Text>
            <TextInput
              style={styles.editFieldInput}
              value={addCreditLimit}
              onChangeText={setAddCreditLimit}
              placeholder="Credit limit in rupees (optional)"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="numeric"
            />

            <Pressable
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
                  color={theme.colors.textInverse}
                />
              ) : (
                <Text style={styles.addButtonText}>Add Customer</Text>
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
    padding: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  customerAvatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  customerPhone: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  customerMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  customerMetaText: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  customerMetaDot: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  // FAB
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.lg,
  },
  // Modal shared
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
    color: theme.colors.primary,
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
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  profileAvatarText: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  profileName: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  profilePhone: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  profileAddress: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.success,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  callButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  // Stats
  statsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    alignItems: "center",
    ...theme.shadows.sm,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 2,
    textAlign: "center",
  },
  statLabel: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    textAlign: "center",
  },
  // Purchases
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  purchaseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  purchaseInfo: {
    flex: 1,
  },
  purchaseBill: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  purchaseDate: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  purchaseAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primaryDark,
  },
  // Edit fields
  editFields: {
    width: "100%",
    marginTop: theme.spacing.md,
  },
  editFieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  editFieldInput: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  editFieldMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  // Add button
  addButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    marginTop: theme.spacing.lg,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
