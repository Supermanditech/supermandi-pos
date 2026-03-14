// ReorderScreen - V3.0.9 compliant
// Pending reorders list with selection, approve, dismiss, history, and PO submission
// STG-421: Wire approved reorders to PO submission
// STG-422: GRN auto-close marks reorders fulfilled
// STG-412: Manual quick-reorder from history
// STG-414: Reorder history/audit trail tab
// STG-415: Staleness detection for pending reorders
// STG-416: Expired reorder re-trigger option
// STG-427: Approval response includes supplier names
// STG-429: Empty state when auto-reorder is off
// STG-430: Selection bar layout shift fix (absolute positioning)

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

import { theme, useThemeColors } from "../theme";
import { PendingReorderCard } from "../components/reorder/PendingReorderCard";
import { DismissReasonModal } from "../components/reorder/DismissReasonModal";
import { EditReorderModal } from "../components/reorder/EditReorderModal";
import type { PendingReorderUpdates } from "../components/reorder/EditReorderModal";
import * as reorderApi from "../services/api/reorderApi";
import type { PendingReorder, DraftPurchaseOrder, ReorderHistoryEntry } from "../services/api/reorderApi";
import { usePurchaseCartStore } from "../stores/purchaseCartStore";
import { getDeviceStoreId } from "../services/deviceSession";

// =============================================================================
// TYPES
// =============================================================================

export interface ReorderScreenProps {
  onNavigateToBuy?: () => void;
}

type TabKey = "pending" | "history";

// =============================================================================
// COMPONENT
// =============================================================================

export default function ReorderScreen({ onNavigateToBuy }: ReorderScreenProps) {
  const colors = useThemeColors();

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    headerSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    // STG-414: Tab bar for pending/history
    tabBar: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: theme.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    tabActive: {
      borderBottomWidth: 2,
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.textTertiary,
    },
    tabTextActive: {
      color: colors.primary,
      fontWeight: "600",
    },
    // STG-430: Selection bar with reserved space to prevent layout shift
    selectionBarContainer: {
      height: 44, // Fixed height so it doesn't cause layout shift
    },
    selectionBar: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.md,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      zIndex: 10,
    },
    selectAllButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    selectAllText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: "500",
    },
    selectedCount: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.md,
    },
    loadingText: {
      fontSize: 14,
      color: colors.textTertiary,
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
      color: colors.textPrimary,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textTertiary,
      textAlign: "center",
    },
    retryButton: {
      marginTop: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: theme.borderRadius.md,
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textInverse,
    },
    // STG-430: Footer uses absolute positioning to prevent layout shift
    footer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.md,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      ...theme.shadows.lg,
    },
    approveButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.success,
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
      color: colors.textInverse,
    },
    // STG-414: History item styles
    historyItem: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    historyHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.xs,
    },
    historyProductName: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
      marginRight: theme.spacing.sm,
    },
    historyStatusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: theme.borderRadius.sm,
    },
    historyStatusApproved: {
      backgroundColor: colors.successSoft,
    },
    historyStatusDismissed: {
      backgroundColor: colors.errorSoft,
    },
    historyStatusExpired: {
      backgroundColor: colors.warningSoft,
    },
    historyStatusFulfilled: {
      backgroundColor: colors.successSoft,
    },
    historyStatusText: {
      fontSize: 11,
      fontWeight: "600",
    },
    historyStatusTextApproved: {
      color: colors.success,
    },
    historyStatusTextDismissed: {
      color: colors.error,
    },
    historyStatusTextExpired: {
      color: colors.warning,
    },
    historyStatusTextFulfilled: {
      color: colors.success,
    },
    historyMeta: {
      flexDirection: "row",
      gap: theme.spacing.md,
      marginBottom: theme.spacing.xs,
    },
    historyMetaText: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    historyFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: theme.spacing.sm,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    historyDate: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    // STG-412/416: Reorder Again / Re-create button
    reorderAgainButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      backgroundColor: colors.primary,
      borderRadius: theme.borderRadius.md,
    },
    reorderAgainText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textInverse,
    },
    // STG-429: Auto-reorder off empty state
    autoReorderOffContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.xxxl,
      paddingHorizontal: theme.spacing.xl,
    },
    autoReorderOffTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.textPrimary,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    autoReorderOffText: {
      fontSize: 14,
      color: colors.textTertiary,
      textAlign: "center",
      marginBottom: theme.spacing.md,
    },
    enableButton: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: theme.borderRadius.md,
    },
    enableButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textInverse,
    },
    // STG-415: Staleness warning badge
    staleBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.warningSoft,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: theme.borderRadius.sm,
      gap: 2,
      marginTop: 4,
    },
    staleBadgeText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.warning,
    },
  }), [colors]);

  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // State
  const [storeId, setStoreId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [pendingReorders, setPendingReorders] = useState<PendingReorder[]>([]);
  const [historyItems, setHistoryItems] = useState<ReorderHistoryEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // STG-429: auto-reorder settings
  const [autoReorderEnabled, setAutoReorderEnabled] = useState<boolean | null>(null);

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

  // STG-429: Load settings to check if auto-reorder is enabled
  const loadSettings = useCallback(async () => {
    if (!storeId) return;
    try {
      const settings = await reorderApi.getReorderSettings(storeId);
      setAutoReorderEnabled(settings.reorderEnabled);
    } catch {
      // If settings fail to load, assume enabled to not block the UI
      setAutoReorderEnabled(true);
    }
  }, [storeId]);

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
        if (__DEV__) console.error("[ReorderScreen] Failed to load pending reorders:", err);
        setError(t("reorder.loadFailed"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [storeId]
  );

  // STG-414: Load history
  const loadHistory = useCallback(
    async (showLoading = true) => {
      if (!storeId) return;

      if (showLoading) setHistoryLoading(true);
      setHistoryError(null);

      try {
        const response = await reorderApi.listReorderHistory(storeId, {
          limit: 50,
        });
        setHistoryItems(response.data);
      } catch (err) {
        if (__DEV__) console.error("[ReorderScreen] Failed to load history:", err);
        setHistoryError(t("reorder.historyLoadFailed"));
      } finally {
        setHistoryLoading(false);
      }
    },
    [storeId]
  );

  // Initial load
  useEffect(() => {
    if (storeId) {
      loadPendingReorders();
      loadSettings();
    }
  }, [storeId, loadPendingReorders, loadSettings]);

  // Load history when tab changes
  useEffect(() => {
    if (activeTab === "history" && storeId && historyItems.length === 0) {
      loadHistory();
    }
  }, [activeTab, storeId, historyItems.length, loadHistory]);

  // Pull to refresh
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setSelectedIds(new Set());
    if (activeTab === "pending") {
      loadPendingReorders(false);
    } else {
      loadHistory(false).finally(() => setRefreshing(false));
    }
  }, [activeTab, loadPendingReorders, loadHistory]);

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

  // Open dismiss modal (STG-315: confirmation dialog before dismissing)
  const handleOpenDismiss = useCallback((item: PendingReorder) => {
    Alert.alert(
      t("reorder.dismissConfirmTitle"),
      t("reorder.dismissConfirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("reorder.dismissButton"),
          style: "destructive",
          onPress: () => {
            setDismissingItem(item);
            setDismissModalVisible(true);
          },
        },
      ]
    );
  }, [t]);

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

  // STG-413: Save edit changes — persist to DB via PATCH API
  const handleSaveEdit = useCallback(async (updates: PendingReorderUpdates) => {
    if (!storeId) return;

    // Call PATCH API to persist changes
    await reorderApi.patchPendingReorder(storeId, updates.id, {
      suggestedQuantity: updates.suggestedQuantity,
      suggestedSupplierId: updates.suggestedSupplierId,
      suggestedSupplierName: updates.suggestedSupplierName,
      suggestedUnitPrice: updates.suggestedUnitPrice,
      supplierProductId: updates.supplierProductId,
    });

    // Update local state on success
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
  }, [storeId]);

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
          t("reorder.dismissFailedTitle"),
          err instanceof Error ? err.message : t("reorder.dismissFailedMessage")
        );
      }
    },
    [storeId]
  );

  // STG-421 + STG-427: Approve selected with PO submission and supplier names in feedback
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

              // STG-421: Submit PO to backend
              try {
                await reorderApi.submitPurchaseOrders(storeId, {
                  draftPurchaseOrders: response.data.draftPurchaseOrders,
                });
              } catch (poErr) {
                if (__DEV__) console.error("[ReorderScreen] PO submission failed:", poErr);
                // PO submission failure is non-blocking — items are still in cart
              }

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

              // STG-427: Include supplier names in success feedback
              const supplierNames = response.data.draftPurchaseOrders
                .map((po: DraftPurchaseOrder) => po.supplierName)
                .filter(Boolean);
              const supplierList = supplierNames.length > 0
                ? `\n${t("reorder.suppliers")}: ${supplierNames.join(", ")}`
                : "";

              // Show success and navigate
              Alert.alert(
                t("reorder.approvedTitle"),
                t("reorder.approvedMessage", {
                  approved: response.data.approvedCount,
                  drafts: response.data.draftPurchaseOrders.length,
                }) + supplierList,
                [
                  { text: t("reorder.stayHere"), style: "cancel" },
                  {
                    text: t("reorder.goToCart"),
                    onPress: () => onNavigateToBuy?.(),
                  },
                ]
              );
            } catch (err) {
              if (__DEV__) console.error("[ReorderScreen] Failed to approve:", err);
              Alert.alert(t("reorder.errorTitle"), t("reorder.approveFailed"));
            } finally {
              setApproving(false);
            }
          },
        },
      ]
    );
  }, [storeId, selectedIds, loadDraftPOs, onNavigateToBuy, t]);

  // STG-412: Reorder again from history
  const handleReorderAgain = useCallback(
    (entry: ReorderHistoryEntry) => {
      if (!onNavigateToBuy) return;

      const items = [
        {
          supplierProductId: entry.productId,
          productId: entry.productId,
          supplierId: entry.suggestedSupplierId || "",
          supplierName: entry.suggestedSupplierName || "",
          productName: entry.productName,
          suggestedQuantity: entry.suggestedQuantity,
          unitPrice: entry.suggestedUnitPrice || 0,
          moq: 1,
        },
      ];
      loadDraftPOs(items);

      Alert.alert(
        t("reorder.reorderAgainTitle"),
        t("reorder.reorderAgainMessage", {
          product: entry.productName,
          qty: entry.suggestedQuantity,
        }),
        [
          { text: t("reorder.stayHere"), style: "cancel" },
          {
            text: t("reorder.goToCart"),
            onPress: () => onNavigateToBuy?.(),
          },
        ]
      );
    },
    [loadDraftPOs, onNavigateToBuy, t]
  );

  // STG-416: Re-create expired reorder
  const handleReCreate = useCallback(
    (entry: ReorderHistoryEntry) => {
      handleReorderAgain(entry);
    },
    [handleReorderAgain]
  );

  // Computed values
  const allSelected = selectedIds.size === pendingReorders.length && pendingReorders.length > 0;
  const someSelected = selectedIds.size > 0;

  // Render pending item with STG-415 staleness
  const renderItem = useCallback(
    ({ item }: { item: PendingReorder }) => {
      const stale = reorderApi.isStale(item);
      const ageDays = reorderApi.getAgeDays(item);

      return (
        <View>
          <PendingReorderCard
            item={item}
            selected={selectedIds.has(item.id)}
            onToggleSelect={handleToggleSelect}
            onDismiss={handleOpenDismiss}
            onEdit={handleOpenEdit}
          />
          {/* STG-415: Staleness warning */}
          {stale && (
            <View style={styles.staleBadge}>
              <MaterialCommunityIcons
                name="clock-alert-outline"
                size={12}
                color={colors.warning}
              />
              <Text style={styles.staleBadgeText}>
                {t("reorder.staleWarning", { days: ageDays })}
              </Text>
            </View>
          )}
        </View>
      );
    },
    [selectedIds, handleToggleSelect, handleOpenDismiss, handleOpenEdit, styles, colors, t]
  );

  // STG-414: Render history item
  const renderHistoryItem = useCallback(
    ({ item }: { item: ReorderHistoryEntry }) => {
      const statusKey = item.status as string;
      const statusStyle =
        statusKey === "approved"
          ? styles.historyStatusApproved
          : statusKey === "dismissed"
          ? styles.historyStatusDismissed
          : statusKey === "expired"
          ? styles.historyStatusExpired
          : styles.historyStatusFulfilled;
      const statusTextStyle =
        statusKey === "approved"
          ? styles.historyStatusTextApproved
          : statusKey === "dismissed"
          ? styles.historyStatusTextDismissed
          : statusKey === "expired"
          ? styles.historyStatusTextExpired
          : styles.historyStatusTextFulfilled;

      const date = new Date(item.updatedAt);
      const dateStr = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const showReorderAgain =
        statusKey === "approved" || statusKey === "fulfilled";
      const showReCreate = statusKey === "expired";

      return (
        <View style={styles.historyItem}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyProductName} numberOfLines={1}>
              {item.productName}
            </Text>
            <View style={[styles.historyStatusBadge, statusStyle]}>
              <Text style={[styles.historyStatusText, statusTextStyle]}>
                {t(`reorder.status_${statusKey}`)}
              </Text>
            </View>
          </View>

          <View style={styles.historyMeta}>
            <Text style={styles.historyMetaText}>
              {t("reorder.qty")}: {item.suggestedQuantity}
            </Text>
            {item.suggestedSupplierName && (
              <Text style={styles.historyMetaText}>
                {item.suggestedSupplierName}
              </Text>
            )}
            {item.dismissedReason && (
              <Text style={styles.historyMetaText}>
                {t("reorder.reason")}: {item.dismissedReason}
              </Text>
            )}
          </View>

          <View style={styles.historyFooter}>
            <Text style={styles.historyDate}>{dateStr}</Text>

            {/* STG-412: Reorder Again button */}
            {showReorderAgain && (
              <Pressable
                style={styles.reorderAgainButton}
                onPress={() => handleReorderAgain(item)}
                accessibilityRole="button"
                accessibilityLabel={t("reorder.reorderAgain")}
                testID={`history-reorder-again-${item.id}`}
              >
                <MaterialCommunityIcons
                  name="refresh"
                  size={14}
                  color={colors.textInverse}
                />
                <Text style={styles.reorderAgainText}>
                  {t("reorder.reorderAgain")}
                </Text>
              </Pressable>
            )}

            {/* STG-416: Re-create expired reorder */}
            {showReCreate && (
              <Pressable
                style={styles.reorderAgainButton}
                onPress={() => handleReCreate(item)}
                accessibilityRole="button"
                accessibilityLabel={t("reorder.reCreate")}
                testID={`history-recreate-${item.id}`}
              >
                <MaterialCommunityIcons
                  name="plus-circle-outline"
                  size={14}
                  color={colors.textInverse}
                />
                <Text style={styles.reorderAgainText}>
                  {t("reorder.reCreate")}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      );
    },
    [styles, colors, handleReorderAgain, handleReCreate, t]
  );

  // Key extractors
  const keyExtractor = useCallback((item: PendingReorder) => item.id, []);
  const historyKeyExtractor = useCallback(
    (item: ReorderHistoryEntry) => item.id,
    []
  );

  // Empty state for pending
  const ListEmpty = useMemo(() => {
    if (loading) return null;

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={colors.error}
          />
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadPendingReorders()} accessibilityLabel={t("common.retry")} accessibilityRole="button" testID="reorder-retry-btn">
            <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      );
    }

    // STG-429: Empty state when auto-reorder is off
    if (autoReorderEnabled === false) {
      return (
        <View style={styles.autoReorderOffContainer}>
          <MaterialCommunityIcons
            name="sync-off"
            size={48}
            color={colors.textTertiary}
          />
          <Text style={styles.autoReorderOffTitle}>
            {t("reorder.autoReorderOffTitle")}
          </Text>
          <Text style={styles.autoReorderOffText}>
            {t("reorder.autoReorderOffDescription")}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="check-circle-outline"
          size={48}
          color={colors.success}
        />
        <Text style={styles.emptyTitle}>{t("reorder.allCaughtUp")}</Text>
        <Text style={styles.emptyText}>
          {t("reorder.noPendingDescription")}
        </Text>
      </View>
    );
  }, [loading, error, autoReorderEnabled, loadPendingReorders, styles, colors, t]);

  // Empty state for history
  const HistoryListEmpty = useMemo(() => {
    if (historyLoading) return null;

    if (historyError) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={colors.error}
          />
          <Text style={styles.emptyText}>{historyError}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadHistory()} accessibilityRole="button">
            <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="history"
          size={48}
          color={colors.textTertiary}
        />
        <Text style={styles.emptyTitle}>{t("reorder.noHistory")}</Text>
        <Text style={styles.emptyText}>
          {t("reorder.noHistoryDescription")}
        </Text>
      </View>
    );
  }, [historyLoading, historyError, loadHistory, styles, colors, t]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("reorder.pendingReorders")}</Text>
        <Text style={styles.headerSubtitle}>
          {activeTab === "pending"
            ? t("reorder.itemsNeedAttention", { count: pendingReorders.length })
            : t("reorder.historySubtitle")}
        </Text>
      </View>

      {/* STG-414: Tab Bar */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === "pending" && styles.tabActive]}
          onPress={() => setActiveTab("pending")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "pending" }}
          testID="reorder-tab-pending"
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "pending" && styles.tabTextActive,
            ]}
          >
            {t("reorder.tabPending")}
            {pendingReorders.length > 0 ? ` (${pendingReorders.length})` : ""}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "history" && styles.tabActive]}
          onPress={() => setActiveTab("history")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "history" }}
          testID="reorder-tab-history"
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "history" && styles.tabTextActive,
            ]}
          >
            {t("reorder.tabHistory")}
          </Text>
        </Pressable>
      </View>

      {/* Pending Tab Content */}
      {activeTab === "pending" && (
        <>
          {/* STG-430: Selection Bar with fixed height container */}
          {pendingReorders.length > 0 && (
            <View style={styles.selectionBarContainer}>
              <View style={styles.selectionBar}>
                <Pressable
                  style={styles.selectAllButton}
                  onPress={allSelected ? handleDeselectAll : handleSelectAll}
                  accessibilityLabel={allSelected ? t("reorder.deselectAll") : t("reorder.selectAll")}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allSelected }}
                  testID="reorder-select-all"
                >
                  <MaterialCommunityIcons
                    name={allSelected ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={styles.selectAllText}>
                    {allSelected ? t("reorder.deselectAll") : t("reorder.selectAll")}
                  </Text>
                </Pressable>

                {someSelected && (
                  <Text style={styles.selectedCount}>
                    {t("reorder.selectedCount", { count: selectedIds.size })}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{t("reorder.loadingPending")}</Text>
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
                  colors={[colors.primary]}
                  tintColor={colors.primary}
                />
              }
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* Action Footer — STG-430: absolute positioned */}
          {someSelected && (
            <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
              <Pressable
                style={[styles.approveButton, approving && styles.approveButtonDisabled]}
                onPress={handleApproveSelected}
                disabled={approving}
                accessibilityLabel={t("reorder.approveSelectedLabel", { count: selectedIds.size })}
                accessibilityRole="button"
                testID="reorder-approve-btn"
              >
                {approving ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={20}
                      color={colors.textInverse}
                    />
                    <Text style={styles.approveButtonText}>
                      {t("reorder.approveSelected", { count: selectedIds.size })}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* STG-414: History Tab Content */}
      {activeTab === "history" && (
        <>
          {historyLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{t("reorder.loadingHistory")}</Text>
            </View>
          ) : (
            <FlatList
              data={historyItems}
              renderItem={renderHistoryItem}
              keyExtractor={historyKeyExtractor}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + theme.spacing.lg },
              ]}
              ListEmptyComponent={HistoryListEmpty}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  colors={[colors.primary]}
                  tintColor={colors.primary}
                />
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
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
