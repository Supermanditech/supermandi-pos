// T-213: Offline sync conflict resolution panel
// Full-screen modal showing pending items, failed items, and stock drifts
// with resolution actions (retry, discard, accept server value)
// STG-274: Converted to useThemeColors() for dark mode support

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useThemeColors } from "../../theme";
import { useSyncStore, type StockDrift } from "../../stores/syncStore";
import { getPendingEvents, type OfflineEvent } from "../../services/offline/outbox";
import {
  retryAll as retryDeadletter,
  clearAll as clearDeadletter,
} from "../../services/deadletterService";
import { showToast } from "../../utils/showToast";

type TabKey = "pending" | "failed" | "drifts";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SyncConflictPanel({ visible, onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [pendingItems, setPendingItems] = useState<OfflineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const outboxCount = useSyncStore((s) => s.outboxCount);
  const deadletterCount = useSyncStore((s) => s.deadletterCount);
  const stockDrifts = useSyncStore((s) => s.stockDrifts);
  const syncing = useSyncStore((s) => s.syncing);
  const syncNow = useSyncStore((s) => s.syncNow);

  const loadPendingItems = useCallback(async () => {
    setLoading(true);
    try {
      const events = await getPendingEvents(50);
      setPendingItems(events);
    } catch (e) {
      console.error("[SyncConflict] Failed to load pending items:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadPendingItems();
    }
  }, [visible, loadPendingItems]);

  const handleSyncAll = useCallback(async () => {
    await syncNow();
    showToast("Sync started");
    loadPendingItems();
  }, [syncNow, loadPendingItems]);

  const handleRetryFailed = useCallback(async () => {
    try {
      const result = await retryDeadletter();
      showToast(`Retried ${result.retried} items`);
      loadPendingItems();
    } catch (e) {
      showToast("Retry failed");
    }
  }, [loadPendingItems]);

  const handleClearFailed = useCallback(async () => {
    try {
      const cleared = await clearDeadletter();
      showToast(`Cleared ${cleared} failed items`);
    } catch (e) {
      showToast("Clear failed");
    }
  }, []);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "pending", label: "Pending", count: outboxCount },
    { key: "failed", label: "Failed", count: deadletterCount },
    { key: "drifts", label: "Drifts", count: stockDrifts.length },
  ];

  function renderEventItem(item: OfflineEvent) {
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <MaterialCommunityIcons
            name="clock-outline"
            size={14}
            color={colors.warning}
          />
          <Text style={styles.itemType}>{item.type.replace(/_/g, " ")}</Text>
        </View>
        <Text style={styles.itemId} numberOfLines={1}>
          ID: {item.eventId.slice(0, 12)}...
        </Text>
        <Text style={styles.itemTime}>
          Created: {new Date(item.createdAt).toLocaleString("en-IN")}
        </Text>
      </View>
    );
  }

  function renderDriftItem(drift: StockDrift) {
    const direction = drift.delta > 0 ? "up" : "down";
    const color = drift.delta > 0 ? colors.success : colors.error;
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <MaterialCommunityIcons
            name={`arrow-${direction}`}
            size={14}
            color={color}
          />
          <Text style={styles.itemType} numberOfLines={1}>
            {drift.productName}
          </Text>
        </View>
        <View style={styles.driftValues}>
          <Text style={styles.driftLabel}>
            Local: <Text style={styles.driftNumber}>{drift.localStock}</Text>
          </Text>
          <MaterialCommunityIcons
            name="arrow-right"
            size={12}
            color={colors.textTertiary}
          />
          <Text style={styles.driftLabel}>
            Server: <Text style={styles.driftNumber}>{drift.serverStock}</Text>
          </Text>
          <Text style={[styles.driftDelta, { color }]}>
            ({drift.delta > 0 ? "+" : ""}{drift.delta})
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Sync Status</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <MaterialCommunityIcons
              name="close"
              size={22}
              color={colors.textPrimary}
            />
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              style={[
                styles.tab,
                activeTab === tab.key && styles.tabActive,
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.key && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{tab.count}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === "pending" && (
            <>
              {outboxCount === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons
                    name="check-circle-outline"
                    size={48}
                    color={colors.success}
                  />
                  <Text style={styles.emptyTitle}>All synced!</Text>
                  <Text style={styles.emptySubtitle}>
                    No pending items in the outbox.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={pendingItems}
                  keyExtractor={(item) => item.eventId}
                  renderItem={({ item }) => renderEventItem(item)}
                  contentContainerStyle={styles.listContent}
                />
              )}
              <View style={styles.actionBar}>
                <Pressable
                  style={[styles.actionBtn, styles.primaryBtn]}
                  onPress={handleSyncAll}
                  disabled={syncing || outboxCount === 0}
                >
                  <MaterialCommunityIcons
                    name="sync"
                    size={16}
                    color={colors.textInverse}
                  />
                  <Text style={styles.primaryBtnText}>
                    {syncing ? "Syncing..." : "Sync All"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {activeTab === "failed" && (
            <>
              {deadletterCount === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons
                    name="check-circle-outline"
                    size={48}
                    color={colors.success}
                  />
                  <Text style={styles.emptyTitle}>No failures</Text>
                  <Text style={styles.emptySubtitle}>
                    All sync operations completed successfully.
                  </Text>
                </View>
              ) : (
                <View style={styles.failedInfo}>
                  <MaterialCommunityIcons
                    name="alert-circle"
                    size={32}
                    color={colors.error}
                  />
                  <Text style={styles.failedCount}>
                    {deadletterCount} failed item{deadletterCount !== 1 ? "s" : ""}
                  </Text>
                  <Text style={styles.failedHelp}>
                    These items failed to sync after multiple attempts. You can retry
                    them or clear the failed queue.
                  </Text>
                </View>
              )}
              {deadletterCount > 0 && (
                <View style={styles.actionBar}>
                  <Pressable
                    style={[styles.actionBtn, styles.primaryBtn]}
                    onPress={handleRetryFailed}
                  >
                    <MaterialCommunityIcons
                      name="refresh"
                      size={16}
                      color={colors.textInverse}
                    />
                    <Text style={styles.primaryBtnText}>Retry All</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.dangerBtn]}
                    onPress={handleClearFailed}
                  >
                    <MaterialCommunityIcons
                      name="delete-outline"
                      size={16}
                      color={colors.error}
                    />
                    <Text style={styles.dangerBtnText}>Clear All</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}

          {activeTab === "drifts" && (
            <>
              {stockDrifts.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons
                    name="check-circle-outline"
                    size={48}
                    color={colors.success}
                  />
                  <Text style={styles.emptyTitle}>No drifts</Text>
                  <Text style={styles.emptySubtitle}>
                    Local and server stock values are in sync.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={stockDrifts}
                  keyExtractor={(item) => item.productId}
                  renderItem={({ item }) => renderDriftItem(item)}
                  contentContainerStyle={styles.listContent}
                  ListHeaderComponent={
                    <Text style={styles.driftExplainer}>
                      Stock drifts indicate differences between local cache and server
                      values. These resolve automatically on next full sync.
                    </Text>
                  }
                />
              )}
              {stockDrifts.length > 0 && (
                <View style={styles.actionBar}>
                  <Pressable
                    style={[styles.actionBtn, styles.primaryBtn]}
                    onPress={handleSyncAll}
                    disabled={syncing}
                  >
                    <MaterialCommunityIcons
                      name="sync"
                      size={16}
                      color={colors.textInverse}
                    />
                    <Text style={styles.primaryBtnText}>
                      {syncing ? "Syncing..." : "Force Sync"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textTertiary,
  },
  tabTextActive: {
    color: colors.primary,
  },
  tabBadge: {
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textInverse,
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: "center",
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemType: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
  },
  itemId: {
    fontSize: 10,
    fontFamily: "monospace",
    color: colors.textTertiary,
  },
  itemTime: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  driftValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  driftLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  driftNumber: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  driftDelta: {
    fontSize: 12,
    fontWeight: "700",
  },
  driftExplainer: {
    fontSize: 12,
    color: colors.textTertiary,
    padding: 12,
    lineHeight: 18,
  },
  failedInfo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  failedCount: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.error,
    marginTop: 8,
  },
  failedHelp: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: "center",
    lineHeight: 18,
  },
  actionBar: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textInverse,
  },
  dangerBtn: {
    backgroundColor: colors.errorSoft,
    borderWidth: 1,
    borderColor: colors.error,
  },
  dangerBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.error,
  },
}); }

export default SyncConflictPanel;
