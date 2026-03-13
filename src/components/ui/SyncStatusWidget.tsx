// T-175: Sync progress indicator + queue depth display
// Small widget showing sync status, outbox queue depth, and last sync time.
// Tappable to expand with queue details and "Sync Now" button.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSyncStore, type ConnectionStatus } from "../../stores/syncStore";
import { retryAll as retryDeadletter, clearAll as clearDeadletter } from "../../services/deadletterService";
import { showToast } from "../../utils/showToast";
import { theme } from "../../theme";
// T-213: Import conflict resolution panel
import { SyncConflictPanel } from "./SyncConflictPanel";

type StatusColor = typeof theme.colors.success | typeof theme.colors.warning | typeof theme.colors.error;

function getStatusColor(status: ConnectionStatus, syncing: boolean): StatusColor {
  if (syncing) return theme.colors.warning;
  switch (status) {
    case "connected":
      return theme.colors.success;
    case "connecting":
      return theme.colors.warning;
    case "disconnected":
      return theme.colors.error;
    default:
      return theme.colors.error;
  }
}

function getStatusIcon(
  status: ConnectionStatus,
  syncing: boolean
): React.ComponentProps<typeof MaterialCommunityIcons>["name"] {
  if (syncing) return "sync";
  switch (status) {
    case "connected":
      return "cloud-check";
    case "connecting":
      return "cloud-sync";
    case "disconnected":
      return "cloud-off-outline";
    default:
      return "cloud-off-outline";
  }
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "Never";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

export function SyncStatusWidget() {
  const connectionStatus = useSyncStore((s) => s.connectionStatus);
  const outboxCount = useSyncStore((s) => s.outboxCount);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const lastSyncError = useSyncStore((s) => s.lastSyncError); // FIX-033
  const deadletterCount = useSyncStore((s) => s.deadletterCount);
  const stockDrifts = useSyncStore((s) => s.stockDrifts);
  const syncing = useSyncStore((s) => s.syncing);
  const syncNow = useSyncStore((s) => s.syncNow);

  const [expanded, setExpanded] = useState(false);
  const [conflictPanelVisible, setConflictPanelVisible] = useState(false); // T-213
  const [relativeTime, setRelativeTime] = useState(formatRelativeTime(lastSyncAt));
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Update relative time every 15 seconds
  useEffect(() => {
    setRelativeTime(formatRelativeTime(lastSyncAt));
    const timer = setInterval(() => {
      setRelativeTime(formatRelativeTime(lastSyncAt));
    }, 15000);
    return () => clearInterval(timer);
  }, [lastSyncAt]);

  // Pulse animation when syncing
  useEffect(() => {
    if (syncing) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [pulseAnim, syncing]);

  const statusColor = useMemo(
    () => getStatusColor(connectionStatus, syncing),
    [connectionStatus, syncing]
  );
  const statusIcon = useMemo(
    () => getStatusIcon(connectionStatus, syncing),
    [connectionStatus, syncing]
  );

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleSyncNow = useCallback(() => {
    void syncNow();
    showToast("Sync started");
  }, [syncNow]);

  const handleRetryDeadletter = useCallback(async () => {
    try {
      const result = await retryDeadletter();
      showToast(`Retried ${result.retried} failed items`);
    } catch (error) {
      showToast("Retry failed");
      console.error("[SyncWidget] Retry deadletter failed:", error);
    }
  }, []);

  const handleClearDeadletter = useCallback(async () => {
    try {
      const cleared = await clearDeadletter();
      showToast(`Cleared ${cleared} failed items`);
    } catch (error) {
      showToast("Clear failed");
      console.error("[SyncWidget] Clear deadletter failed:", error);
    }
  }, []);

  // Compact display: status dot + pending count
  const hasPendingItems = outboxCount > 0;
  const hasDeadletterItems = deadletterCount > 0;
  const hasDrifts = stockDrifts.length > 0;
  const hasSyncError = !!lastSyncError; // FIX-033

  // STG-006: Collapse when healthy — only show when there's something to report
  const isHealthy = connectionStatus === "connected" && !syncing && !hasPendingItems && !hasDeadletterItems && !hasDrifts && !hasSyncError;

  // STG-006: If healthy and not expanded, minimize to a single dot
  if (isHealthy && !expanded) {
    return (
      <Pressable
        style={styles.healthyBar}
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={`Synced ${relativeTime}. Tap for details.`}
      >
        {/* STG-071: Checkmark connected with last sync time */}
        <MaterialCommunityIcons name="check-circle" size={12} color={theme.colors.success} />
        <Text style={styles.healthySyncText}>{relativeTime}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      {/* Compact bar — visible when issues exist or expanded */}
      <Pressable
        style={styles.compactBar}
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={`Sync status: ${connectionStatus}. ${outboxCount} pending. Last synced ${relativeTime}`}
      >
        <Animated.View style={{ opacity: pulseAnim }}>
          <MaterialCommunityIcons name={statusIcon} size={14} color={statusColor} />
        </Animated.View>

        {hasPendingItems ? (
          <Text style={styles.pendingText}>
            {outboxCount} pending
          </Text>
        ) : null}

        {hasDeadletterItems ? (
          <View style={styles.deadletterBadge}>
            <MaterialCommunityIcons name="alert-circle" size={10} color={theme.colors.error} />
            <Text style={styles.deadletterBadgeText}>{deadletterCount}</Text>
          </View>
        ) : null}

        {hasDrifts ? (
          <View style={styles.driftBadge}>
            <MaterialCommunityIcons name="swap-vertical" size={10} color={theme.colors.warning} />
          </View>
        ) : null}

        {/* FIX-033: Sync error indicator in compact bar */}
        {hasSyncError ? (
          <MaterialCommunityIcons name="alert" size={12} color={theme.colors.error} />
        ) : null}

        {/* STG-071: Last sync time next to status */}
        <Text style={styles.lastSyncText}>{relativeTime}</Text>

        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={theme.colors.textTertiary}
        />
      </Pressable>

      {/* Expanded details panel */}
      {expanded ? (
        <View style={styles.expandedPanel}>
          {/* STG-010: Plain-language labels */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Connection</Text>
            <Text style={[styles.detailValue, { color: statusColor }]}>
              {syncing ? "Uploading data..." : connectionStatus === "connected" ? "Connected" : connectionStatus === "connecting" ? "Reconnecting..." : "Offline"}
            </Text>
          </View>

          {/* STG-021: Queue count with badge */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Pending bills</Text>
            <Text style={styles.detailValue}>
              {outboxCount === 0 ? "All sent" : `${outboxCount} waiting`}
            </Text>
          </View>

          {/* Last sync timestamp */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Last upload</Text>
            <Text style={styles.detailValue}>{relativeTime}</Text>
          </View>

          {/* FIX-033: Show sync error */}
          {lastSyncError ? (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.colors.error }]}>
                Sync error
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.error, flex: 1, textAlign: "right" }]} numberOfLines={2}>
                {lastSyncError}
              </Text>
            </View>
          ) : null}

          {/* Deadletter items */}
          {hasDeadletterItems ? (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.colors.error }]}>
                Failed items
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.error }]}>
                {deadletterCount}
              </Text>
            </View>
          ) : null}

          {/* Stock drifts */}
          {hasDrifts ? (
            <View style={styles.driftSection}>
              <Text style={styles.driftHeader}>
                Stock drifts ({stockDrifts.length})
              </Text>
              {stockDrifts.slice(0, 3).map((drift) => (
                <Text key={drift.productId} style={styles.driftItem}>
                  {drift.productName}: local {drift.localStock} vs server {drift.serverStock}
                </Text>
              ))}
              {stockDrifts.length > 3 ? (
                <Text style={styles.driftMore}>
                  +{stockDrifts.length - 3} more...
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Action buttons */}
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, styles.syncButton]}
              onPress={handleSyncNow}
              disabled={syncing}
            >
              <MaterialCommunityIcons name="sync" size={14} color={theme.colors.textInverse} />
              <Text style={styles.syncButtonText}>
                {syncing ? "Syncing..." : "Sync Now"}
              </Text>
            </Pressable>

            {hasDeadletterItems ? (
              <>
                <Pressable
                  style={[styles.actionButton, styles.retryButton]}
                  onPress={handleRetryDeadletter}
                >
                  <Text style={styles.retryButtonText}>Retry All</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.clearButton]}
                  onPress={handleClearDeadletter}
                >
                  <Text style={styles.clearButtonText}>Clear</Text>
                </Pressable>
              </>
            ) : null}

            {/* T-213: View Details button to open full conflict panel */}
            <Pressable
              style={[styles.actionButton, styles.detailsButton]}
              onPress={() => setConflictPanelVisible(true)}
            >
              <Text style={styles.detailsButtonText}>View Details</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* T-213: Full sync conflict resolution panel */}
      <SyncConflictPanel
        visible={conflictPanelVisible}
        onClose={() => setConflictPanelVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // STG-006: Healthy collapsed state — minimal footprint
  healthyBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 3,
    gap: 4,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  healthySyncText: {
    fontSize: 9,
    fontWeight: "500",
    color: theme.colors.success,
  },
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  compactBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  pendingText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.warning,
  },
  deadletterBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  deadletterBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.error,
  },
  driftBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  lastSyncText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    color: theme.colors.textTertiary,
    textAlign: "right",
  },
  expandedPanel: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  detailValue: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  driftSection: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 2,
  },
  driftHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.warning,
  },
  driftItem: {
    fontSize: 10,
    fontWeight: "500",
    color: theme.colors.textSecondary,
    paddingLeft: 8,
  },
  driftMore: {
    fontSize: 10,
    fontWeight: "500",
    color: theme.colors.textTertiary,
    paddingLeft: 8,
    fontStyle: "italic",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  syncButton: {
    backgroundColor: theme.colors.primary,
  },
  syncButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  retryButton: {
    backgroundColor: theme.colors.warningSoft,
    borderWidth: 1,
    borderColor: theme.colors.warning,
  },
  retryButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.warning,
  },
  clearButton: {
    backgroundColor: theme.colors.errorSoft,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  clearButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.error,
  },
  // T-213: View Details button
  detailsButton: {
    backgroundColor: theme.colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  detailsButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
});
