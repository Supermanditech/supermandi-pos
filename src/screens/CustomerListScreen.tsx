// T-155: Customer Profiles Screen
// List of all customers, search, detail view with purchase history, add/edit customer
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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

import { useTranslation } from "react-i18next";
import { theme, useThemeColors } from "../theme";
import { formatMoney } from "../utils/money";
import { formatDateTime } from "../i18n/formatters";
import { useCustomerStore } from "../stores/customerStore";
import type { Customer, CustomerPurchase } from "../services/customerService";
import { BackHeader } from "../components/ui/BackHeader";
import EmptyState from "../components/ui/EmptyState";

// =============================================================================
// HELPERS
// =============================================================================

function formatDateDDMMYYYY(dateStr: string | null): string {
  if (!dateStr) return "--";
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

interface CustomerListScreenProps {
  onBack?: () => void;
}

export default function CustomerListScreen({ onBack }: CustomerListScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
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
  // UIUX-POS-020: Debounce search timer ref
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Add customer form state
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

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

  // STG-449: Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (error) {
      Alert.alert(t("customerList.errorTitle"), error);
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
    (customer: Customer) => {
      void fetchCustomerDetail(customer.id);
      setShowDetail(true);
    },
    [fetchCustomerDetail]
  );

  const handleCloseDetail = useCallback(() => {
    setShowDetail(false);
    setSelectedCustomer(null);
  }, [setSelectedCustomer]);

  // Add customer
  const handleOpenAddModal = useCallback(() => {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormAddress("");
    setShowAddModal(true);
  }, []);

  const handleSubmitAdd = useCallback(async () => {
    const name = formName.trim();
    const phone = formPhone.trim();
    if (!name) {
      Alert.alert(t("customerList.requiredTitle"), t("customerList.nameRequired"));
      return;
    }
    if (!phone || phone.length < 10) {
      Alert.alert(t("customerList.requiredTitle"), t("customerList.phoneRequired"));
      return;
    }
    setFormSubmitting(true);
    try {
      const success = await createCustomer({
        name,
        phone,
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
      });
      if (success) {
        setShowAddModal(false);
        Alert.alert(t("customerList.successTitle"), t("customerList.customerAdded"));
      }
    } catch (err) {
      // ISSUE-150: Prevent form lock on unexpected errors
      Alert.alert(t("customerList.errorTitle"), err instanceof Error ? err.message : t("customerList.addFailed"));
    } finally {
      setFormSubmitting(false);
    }
  }, [formName, formPhone, formEmail, formAddress, createCustomer]);

  // Edit customer
  const handleOpenEditModal = useCallback(() => {
    if (!selectedCustomer) return;
    setFormName(selectedCustomer.name);
    setFormPhone(selectedCustomer.phone);
    setFormEmail(selectedCustomer.email || "");
    setFormAddress(selectedCustomer.address || "");
    setShowEditModal(true);
  }, [selectedCustomer]);

  const handleSubmitEdit = useCallback(async () => {
    if (!selectedCustomer) return;
    const name = formName.trim();
    if (!name) {
      Alert.alert(t("customerList.requiredTitle"), t("customerList.nameRequired"));
      return;
    }
    setFormSubmitting(true);
    const success = await updateCustomer(selectedCustomer.id, {
      name,
      email: formEmail.trim() || undefined,
      address: formAddress.trim() || undefined,
    });
    setFormSubmitting(false);
    if (success) {
      setShowEditModal(false);
      // Refresh detail
      void fetchCustomerDetail(selectedCustomer.id);
      Alert.alert(t("customerList.successTitle"), t("customerList.customerUpdated"));
    }
  }, [selectedCustomer, formName, formEmail, formAddress, updateCustomer, fetchCustomerDetail]);

  // Render customer card
  const renderCustomerCard = useCallback(
    ({ item }: { item: Customer }) => (
      <Pressable accessibilityRole="button" style={styles.customerCard} onPress={() => handleCustomerTap(item)}>
        <View style={styles.customerAvatar}>
          <Text style={styles.customerAvatarText}>
            {(item.name || "?").charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.customerInfo}>
          <Text style={styles.customerName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.customerPhone}>{item.phone}</Text>
          <View style={styles.customerStats}>
            <Text style={styles.customerStat}>
              {t("customerList.spentAmount", { amount: formatMoney(item.totalPurchasesMinor) })}
            </Text>
            <Text style={styles.customerStatDivider}>|</Text>
            <Text style={styles.customerStat}>{t("customerList.visitCount", { count: item.visitCount })}</Text>
          </View>
          {item.lastVisitAt && (
            <Text style={styles.customerLastVisit}>
              {t("customerList.lastVisitDate", { date: formatDateDDMMYYYY(item.lastVisitAt) })}
            </Text>
          )}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
      </Pressable>
    ),
    [handleCustomerTap]
  );

  // Render purchase history item in detail view
  const renderPurchaseItem = useCallback((purchase: CustomerPurchase) => (
    <View key={purchase.saleId} style={styles.purchaseItem}>
      <View style={styles.purchaseInfo}>
        <Text style={styles.purchaseBillRef}>{t("customerList.billRef", { ref: purchase.billRef })}</Text>
        <Text style={styles.purchaseDate}>{formatDateDDMMYYYY(purchase.createdAt)}</Text>
        <View style={styles.purchaseMeta}>
          <Text style={styles.purchaseMetaText}>{t("customerList.itemCount", { count: purchase.itemCount })}</Text>
          <Text style={styles.purchaseMetaDivider}>|</Text>
          <Text style={styles.purchaseMetaText}>{purchase.paymentMode}</Text>
        </View>
      </View>
      <Text style={styles.purchaseAmount}>{formatMoney(purchase.totalMinor)}</Text>
    </View>
  ), []);

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
      marginBottom: theme.spacing.sm,
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
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.xs,
      backgroundColor: colors.surface,
      marginHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    addButtonText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.primary,
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
    customerStats: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
      gap: 6,
    },
    customerStat: {
      fontSize: 12,
      color: colors.textTertiary,
      fontWeight: "500",
    },
    customerStatDivider: {
      fontSize: 12,
      color: colors.border,
    },
    customerLastVisit: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: 2,
    },
    // Modal styles
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
    modalEditButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    modalFormContent: {
      padding: theme.spacing.md,
    },
    // Detail view
    detailContent: {
      flex: 1,
    },
    detailContentContainer: {
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
    },
    profileCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      alignItems: "center",
      ...theme.shadows.sm,
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
    },
    profilePhoneRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
    },
    profilePhone: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    whatsappIconButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    profileEmail: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 2,
    },
    profileAddress: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 2,
      textAlign: "center",
    },
    statsRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
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
    },
    statLabel: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: 4,
      textAlign: "center",
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.md,
    },
    noPurchases: {
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: "center",
      paddingVertical: theme.spacing.lg,
    },
    purchaseItem: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    purchaseInfo: {
      flex: 1,
    },
    purchaseBillRef: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    purchaseDate: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    purchaseMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    },
    purchaseMetaText: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    purchaseMetaDivider: {
      fontSize: 11,
      color: colors.border,
    },
    purchaseAmount: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.primaryDark,
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
    formInputDisabled: {
      backgroundColor: colors.surfaceAlt,
      color: colors.textTertiary,
    },
    formTextArea: {
      minHeight: 80,
      textAlignVertical: "top",
    },
    submitButton: {
      backgroundColor: colors.primary,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      alignItems: "center",
      justifyContent: "center",
      marginTop: theme.spacing.lg,
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

  return (
    <View style={styles.container}>
      <BackHeader title={t("customerList.title")} onBack={onBack} />

      {/* Search bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("customerList.searchPlaceholder")}
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

      {/* Add button */}
      <Pressable accessibilityRole="button" style={styles.addButton} onPress={handleOpenAddModal}>
        <MaterialCommunityIcons name="account-plus-outline" size={18} color={colors.primary} />
        <Text style={styles.addButtonText}>{t("customerList.addCustomer")}</Text>
      </Pressable>

      {/* Customer list */}
      {loading && customers.length === 0 ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t("customerList.loadingCustomers")}</Text>
        </View>
      ) : customers.length === 0 ? (
        <EmptyState
          icon="account-group-outline"
          title={t("customerList.noCustomersTitle")}
          description={t("customerList.noCustomersDescription")}
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

      {/* Detail Modal */}
      <Modal
        visible={showDetail}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseDetail}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable accessibilityRole="button" style={styles.modalCloseButton} onPress={handleCloseDetail}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t("customerList.customerProfile")}</Text>
            <Pressable accessibilityRole="button" style={styles.modalEditButton} onPress={handleOpenEditModal}>
              <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.primary} />
            </Pressable>
          </View>

          {detailLoading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : selectedCustomer ? (
            <ScrollView style={styles.detailContent} contentContainerStyle={styles.detailContentContainer}>
              {/* Profile card */}
              <View style={styles.profileCard}>
                <View style={styles.profileAvatarLarge}>
                  <Text style={styles.profileAvatarText}>
                    {(selectedCustomer.name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.profileName}>{selectedCustomer.name}</Text>
                <View style={styles.profilePhoneRow}>
                  <Text style={styles.profilePhone}>{selectedCustomer.phone}</Text>
                  {selectedCustomer.phone && selectedCustomer.phone.replace(/\D/g, "").length >= 10 && (
                  <Pressable
                    accessibilityRole="link"
                    style={styles.whatsappIconButton}
                    onPress={() => {
                      const name = selectedCustomer.name || t("customerList.defaultCustomerName");
                      const message = encodeURIComponent(
                        t("customerList.whatsappGreeting", { name })
                      );
                      let phone = selectedCustomer.phone.replace(/\D/g, "");
                      // STG-470: Prepend India country code if 10-digit number
                      if (phone.length === 10) phone = `91${phone}`;
                      // wa.me universal link works on both Android and iOS
                      const url = `https://wa.me/${phone}?text=${message}`;
                      Linking.openURL(url).catch(() => {
                        Alert.alert(t("customerList.whatsappNotFoundTitle"), t("customerList.whatsappNotFoundMessage"));
                      });
                    }}
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons name="whatsapp" size={20} color={colors.whatsapp} />
                  </Pressable>
                  )}
                </View>
                {selectedCustomer.email && (
                  <Text style={styles.profileEmail}>{selectedCustomer.email}</Text>
                )}
                {selectedCustomer.address && (
                  <Text style={styles.profileAddress}>{selectedCustomer.address}</Text>
                )}
              </View>

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>
                    {formatMoney(selectedCustomer.totalPurchasesMinor)}
                  </Text>
                  <Text style={styles.statLabel}>{t("customerList.totalPurchases")}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{selectedCustomer.visitCount}</Text>
                  <Text style={styles.statLabel}>{t("customerList.visits")}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>
                    {formatDateDDMMYYYY(selectedCustomer.lastVisitAt)}
                  </Text>
                  <Text style={styles.statLabel}>{t("customerList.lastVisit")}</Text>
                </View>
              </View>

              {/* Purchase history */}
              <Text style={styles.sectionTitle}>{t("customerList.purchaseHistory")}</Text>
              {selectedCustomer.purchases.length === 0 ? (
                <Text style={styles.noPurchases}>{t("customerList.noPurchaseHistory")}</Text>
              ) : (
                selectedCustomer.purchases.map(renderPurchaseItem)
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      {/* Add Customer Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable accessibilityRole="button" style={styles.modalCloseButton} onPress={() => setShowAddModal(false)}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t("customerList.addCustomer")}</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView style={styles.modalFormContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>{t("customerList.nameLabel")}</Text>
            <TextInput
              style={styles.formInput}
              placeholder={t("customerList.namePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={formName}
              onChangeText={setFormName}
            />

            <Text style={styles.formLabel}>{t("customerList.phoneLabel")}</Text>
            <TextInput
              style={styles.formInput}
              placeholder={t("customerList.phonePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={formPhone}
              onChangeText={setFormPhone}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={styles.formLabel}>{t("customerList.emailLabel")}</Text>
            <TextInput
              style={styles.formInput}
              placeholder={t("customerList.emailPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={formEmail}
              onChangeText={setFormEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.formLabel}>{t("customerList.addressLabel")}</Text>
            <TextInput
              style={[styles.formInput, styles.formTextArea]}
              placeholder={t("customerList.addressPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={formAddress}
              onChangeText={setFormAddress}
              multiline
              numberOfLines={3}
            />

            <Pressable
              accessibilityRole="button"
              style={[styles.submitButton, formSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmitAdd}
              disabled={formSubmitting}
            >
              {formSubmitting ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.submitButtonText}>{t("customerList.addCustomer")}</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Customer Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable accessibilityRole="button" style={styles.modalCloseButton} onPress={() => setShowEditModal(false)}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t("customerList.editCustomer")}</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView style={styles.modalFormContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>{t("customerList.nameLabel")}</Text>
            <TextInput
              style={styles.formInput}
              placeholder={t("customerList.namePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={formName}
              onChangeText={setFormName}
            />

            <Text style={styles.formLabel}>{t("customerList.phoneReadOnly")}</Text>
            <TextInput
              style={[styles.formInput, styles.formInputDisabled]}
              value={formPhone}
              editable={false}
            />

            <Text style={styles.formLabel}>{t("customerList.emailLabel")}</Text>
            <TextInput
              style={styles.formInput}
              placeholder={t("customerList.emailPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={formEmail}
              onChangeText={setFormEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.formLabel}>{t("customerList.addressLabel")}</Text>
            <TextInput
              style={[styles.formInput, styles.formTextArea]}
              placeholder={t("customerList.addressPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={formAddress}
              onChangeText={setFormAddress}
              multiline
              numberOfLines={3}
            />

            <Pressable
              accessibilityRole="button"
              style={[styles.submitButton, formSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmitEdit}
              disabled={formSubmitting}
            >
              {formSubmitting ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.submitButtonText}>{t("customerList.saveChanges")}</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
