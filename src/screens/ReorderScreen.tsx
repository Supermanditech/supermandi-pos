// ReorderScreen - V3.0.9 compliant
// Pending reorders list with selection, approve, and dismiss functionality

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { theme } from "../theme";
import { PendingReorderCard } from "../components/reorder/PendingReorderCard";
import { DismissReasonModal } from "../components/reorder/DismissReasonModal";
import { EditReorderModal } from "../components/reorder/EditReorderModal";
import type { PendingReorderUpdates } from "../components/reorder/EditReorderModal";
import * as reorderApi from "../services/api/reorderApi";
import type { PendingReorder, DraftPurchaseOrder } from "../services/api/reorderApi";
import { usePurchaseCartStore } from "../stores/purchaseCartStore";
import { getDeviceStoreId } from "../services/deviceSession";

// =============================================================================
// TYPES
// =============================================================================

export interface ReorderScreenProps {
  onNavigateToBuy?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ReorderScreen({ onNavigateToBuy }: ReorderScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // State
  const [storeId, setStoreId] = useState<string | null>(null);
  const [pendingReorders, setPendingReorders] = useState<PendingReorder[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dismiss modal state
  const [dismissModalVisible, setDismissModalVisible] = useState(false);
  const [dismissingItem, setDismissingItem] = useState<PendingReorder | null>(null);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PendingReorder | null>(null);

  // Cart store for loading draft POs
  const loadDraftPOs = usePurchaseCartStore((state) => state.loadDraftPOs);

  // Load store ID on mount
  useEffect(() => {
    getDeviceStoreId().then(setStoreId);
  }, []);

  // Load pending reorders
  const loadPendingReorders = useCallback(
    async (showLoading = true) => {
      if (!storeId) return;

      if (showLoading) setLoading(true);
      setError(null);

      try {
        const response = await reorderApi.listPendingReorders(storeId, {
          status: "pending",
          limit: 100,
        });
        setPendingReorders(response.data);
      } catch (err) {
        console.error("[ReorderScreen] Failed to load pending reorders:", err);
        setError("Failed to load pending reorders");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [storeId]
  );

  // Initial load
  useEffect(() => {
    if (storeId) {
      loadPendingReorders();
    }
  }, [storeId, loadPendingReorders]);

  // Pull to refresh
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setSelectedIds(new Set());
    loadPendingReorders(false);
  }, [loadPendingReorders]);

  // Toggle selection
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Select all
  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(pendingReorders.map((p) => p.id)));
  }, [pendingReorders]);

  // Deselect all
  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Open dismiss modal
  const handleOpenDismiss = useCallback((item: PendingReorder) => {
    setDismissingItem(item);
    setDismissModalVisible(true);
  }, []);

  // Close dismiss modal
  const handleCloseDismiss = useCallback(() => {
    setDismissModalVisible(false);
    setDismissingItem(null);
  }, []);

  // Open edit modal
  const handleOpenEdit = useCallback((item: PendingReorder) => {
    setEditingItem(item);
    setEditModalVisible(true);
  }, []);

  // Close edit modal
  const handleCloseEdit = useCallback(() => {
    setEditModalVisible(false);
    setEditingItem(null);
  }, []);

  // Save edit changes (local update only)
  const handleSaveEdit = useCallback(async (updates: PendingReorderUpdates) => {
    setPendingReorders((prev) =>
      prev.map((p) =>
        p.id === updates.id
          ? {
              ...p,
              suggestedQuantity: updates.suggestedQuantity,
              suggestedSupplierId: updates.suggestedSupplierId,
              suggestedSupplierName: updates.suggestedSupplierName,
              suggestedUnitPrice: updates.suggestedUnitPrice,
              supplierProductId: updates.supplierProductId,
            }
          : p
      )
    );
  }, []);

  // Dismiss pending reorder
  const handleDismiss = useCallback(
    async (id: string, reason: string) => {
      if (!storeId) return;

      try {
        await reorderApi.dismissPendingReorder(storeId, id, reason);

        // Remove from list
        setPendingReorders((prev) => prev.filter((p) => p.id !== id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch (err) {
        Alert.alert(
          "Dismiss Failed",
          err instanceof Error ? err.message : "Could not dismiss reorder. Please try again."
        );
      }
    },
    [storeId]
  );

  // Approve selected
  const handleApproveSelected = useCallback(async () => {
    if (!storeId || selectedIds.size === 0) return;

    Alert.alert(
      t("reorder.approveTitle"),
      t("reorder.approveConfirmation", { count: selectedIds.size }),
      [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: t("reorder.approve"),
          onPress: async () => {
            setApproving(true);

            try {
              const response = await reorderApi.approvePendingReorders(
                storeId,
                Array.from(selectedIds)
              );

              // Convert draft POs to cart items
              const draftItems = response.data.draftPurchaseOrders.flatMap(
                (po: DraftPurchaseOrder) =>
                  po.items.map((item) => ({
                    supplierProductId: item.supplierProductId || item.productId,
                    productId: item.productId,
                    supplierId: po.supplierId,
                    supplierName: po.supplierName,
                    productName: item.productName,
                    suggestedQuantity: item.quantity,
                    unitPrice: item.unitPrice,
                    moq: 1, // Default MOQ
                  }))
              );

              // Load into cart
              loadDraftPOs(draftItems);

              // Remove approved items from list
              setPendingReorders((prev) =>
                prev.filter((p) => !selectedIds.has(p.id))
              );
              setSelectedIds(new Set());

              // Show success and navigate
              Alert.alert(
                t("reorder.approvedTitle"),
                t("reorder.approvedMessage", {
                  approved: response.data.approvedCount,
                  drafts: response.data.draftPurchaseOrders.length,
                }),
                [
                  { text: t("reorder.stayHere"), style: "cancel" },
                  {
                    text: t("reorder.goToCart"),
                    onPress: () => onNavigateToBuy?.(),
                  },
                ]
              );
            } catch (err) {
              console.error("[ReorderScreen] Failed to approve:", err);
              Alert.alert(t("reorder.errorTitle"), t("reorder.approveFailed"));
            } finally {
              setApproving(false);
            }
          },
        },
      ]
    );
  }, [storeId, selectedIds, loadDraftPOs, onNavigateToBuy]);

  // Computed values
  const allSelected = selectedIds.size === pendingReorders.length && pendingReorders.length > 0;
  const someSelected = selectedIds.size > 0;

  // Render item
  const renderItem = useCallback(
    ({ item }: { item: PendingReorder }) => (
      <PendingReorderCard
        item={item}
        selected={selectedIds.has(item.id)}
        onToggleSelect={handleToggleSelect}
        onDismiss={handleOpenDismiss}
        onEdit={handleOpenEdit}
      />
    ),
    [selectedIds, handleToggleSelect, handleOpenDismiss, handleOpenEdit]
  );

  // Key extractor
  const keyExtractor = useCallback((item: PendingReorder) => item.id, []);

  // Empty state
  const ListEmpty = useMemo(() => {
    if (loading) return null;

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={theme.colors.error}
          />
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadPendingReorders()} accessibilityLabel="Retry loading reorders" accessibilityRole="button" testID="reorder-retry-btn">
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="check-circle-outline"
          size={48}
          color={theme.colors.success}
        />
        <Text style={styles.emptyTitle}>All caught up!</Text>
        <Text style={styles.emptyText}>
          No pending reorders at this time. The system will automatically detect low stock items.
        </Text>
      </View>
    );
  }, [loading, error, loadPendingReorders]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pending Reorders</Text>
        <Text style={styles.headerSubtitle}>
          {pendingReorders.length} item{pendingReorders.length !== 1 ? "s" : ""} need attention
        </Text>
      </View>

      {/* Selection Bar */}
      {pendingReorders.length > 0 && (
        <View style={styles.selectionBar}>
          <Pressable
            style={styles.selectAllButton}
            onPress={allSelected ? handleDeselectAll : handleSelectAll}
            accessibilityLabel={allSelected ? "Deselect All" : "Select All"}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allSelected }}
            testID="reorder-select-all"
          >
            <MaterialCommunityIcons
              name={allSelected ? "checkbox-marked" : "checkbox-blank-outline"}
              size={20}
              color={theme.colors.primary}
            />
            <Text style={styles.selectAllText}>
              {allSelected ? "Deselect All" : "Select All"}
            </Text>
          </Pressable>

          {someSelected && (
            <Text style={styles.selectedCount}>
              {selectedIds.size} selected
            </Text>
          )}
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading pending reorders...</Text>
        </View>
      ) : (
        <FlatList
          data={pendingReorders}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: someSelected ? 100 + insets.bottom : insets.bottom + theme.spacing.lg },
          ]}
          ListEmptyComponent={ListEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Action Footer */}
      {someSelected && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          <Pressable
            style={[styles.approveButton, approving && styles.approveButtonDisabled]}
            onPress={handleApproveSelected}
            disabled={approving}
            accessibilityLabel={`Approve ${selectedIds.size} selected reorders`}
            accessibilityRole="button"
            testID="reorder-approve-btn"
          >
            {approving ? (
              <ActivityIndicator size="small" color={theme.colors.textInverse} />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={20}
                  color={theme.colors.textInverse}
                />
                <Text style={styles.approveButtonText}>
                  Approve Selected ({selectedIds.size})
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {/* Dismiss Modal */}
      <DismissReasonModal
        visible={dismissModalVisible}
        item={dismissingItem}
        onDismiss={handleDismiss}
        onClose={handleCloseDismiss}
      />

      {/* Edit Modal */}
      <EditReorderModal
        visible={editModalVisible}
        item={editingItem}
        onSave={handleSaveEdit}
        onClose={handleCloseEdit}
      />
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
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  selectAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  selectAllText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  selectedCount: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  listContent: {
    padding: theme.spacing.md,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: "center",
  },
  retryButton: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    ...theme.shadows.lg,
  },
  approveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.success,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing.sm,
  },
  approveButtonDisabled: {
    opacity: 0.6,
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
});
