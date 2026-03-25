/**
 * GCP-STG-0749: POS Notification Center screen
 * Shows notification list with type icons, unread filter, mark-all-read,
 * pull-to-refresh, and 4-state UX (loading/data/error/empty).
 */
import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Text,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
  type NotificationType,
} from "../../services/api/notificationApi";

type Props = { onClose: () => void };

// Icon map per notification type
const TYPE_ICONS: Record<NotificationType, string> = {
  ORDER_STATUS: "\uD83D\uDCE6",    // 📦
  LOW_STOCK: "\u26A0\uFE0F",        // ⚠️
  PAYMENT_RECEIVED: "\uD83D\uDCB0", // 💰
  EXPIRY_ALERT: "\uD83D\uDD34",     // 🔴
  SYSTEM: "\u2139\uFE0F",           // ℹ️
};

function getTypeIcon(type: NotificationType): string {
  return TYPE_ICONS[type] ?? "\u2139\uFE0F";
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationsScreenV3({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const fetchData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const data = await getNotifications({
          unread: unreadOnly || undefined,
          limit: 50,
        });
        setNotifications(data.notifications ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load notifications");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [unreadOnly]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData({ silent: true });
  }, [fetchData]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore — next refresh will reconcile
    }
  }, []);

  const handleTap = useCallback(
    async (item: Notification) => {
      // Mark as read
      if (!item.read) {
        try {
          await markNotificationRead(item.id);
          setNotifications((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
          );
        } catch {
          // ignore
        }
      }
      // Deep link navigation
      if (item.data?.screen && typeof item.data.screen === "string") {
        navigation.navigate(item.data.screen as any, item.data as any);
      }
    },
    [navigation]
  );

  const hasUnread = notifications.some((n) => !n.read);

  // --- Render ---

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <Pressable
        style={styles.notifRow}
        onPress={() => handleTap(item)}
        testID={`notif-row-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${item.read ? "" : "Unread "}notification: ${item.title}`}
      >
        {/* Unread indicator */}
        <View style={styles.unreadDotCol}>
          {!item.read ? <View style={styles.unreadDot} testID="unread-dot" /> : null}
        </View>
        {/* Type icon */}
        <Text style={styles.typeIcon}>{getTypeIcon(item.type)}</Text>
        {/* Content */}
        <View style={styles.notifContent}>
          <Text
            style={[styles.notifTitle, !item.read && styles.notifTitleUnread]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.notifBody} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.notifTime}>{timeAgo(item.createdAt)}</Text>
        </View>
      </Pressable>
    ),
    [styles, handleTap]
  );

  const keyExtractor = useCallback((item: Notification) => item.id, []);

  return (
    <View
      style={[styles.container, { paddingTop: insets.top }]}
      testID="notifications-screen"
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="notif-back-btn"
        >
          <Text style={styles.backArrow}>{"\u2190"}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerActions}>
          {hasUnread ? (
            <Pressable
              onPress={handleMarkAllRead}
              style={styles.markAllBtn}
              accessibilityRole="button"
              accessibilityLabel="Mark all read"
              testID="mark-all-read-btn"
            >
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Unread filter toggle */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setUnreadOnly(false)}
          style={[styles.filterTab, !unreadOnly && styles.filterTabActive]}
          testID="filter-all"
        >
          <Text
            style={[
              styles.filterTabText,
              !unreadOnly && styles.filterTabTextActive,
            ]}
          >
            All
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setUnreadOnly(true)}
          style={[styles.filterTab, unreadOnly && styles.filterTabActive]}
          testID="filter-unread"
        >
          <Text
            style={[
              styles.filterTabText,
              unreadOnly && styles.filterTabTextActive,
            ]}
          >
            Unread
          </Text>
        </Pressable>
      </View>

      {/* 4-state UX */}
      {loading && !refreshing ? (
        <View style={styles.centerState} testID="notif-loading">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>Loading notifications...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState} testID="notif-error">
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => fetchData()}
            style={styles.retryBtn}
            testID="notif-retry-btn"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centerState} testID="notif-empty">
          <Text style={styles.emptyIcon}>{"\uD83C\uDF89"}</Text>
          <Text style={styles.emptyText}>
            No notifications yet {"\u2014"} you're all caught up!
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          testID="notif-list"
        />
      )}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  const pad = getScreenPadding();
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: pad,
      paddingVertical: 12,
      backgroundColor: colors.primary,
    },
    backBtn: {
      marginRight: 8,
      padding: 4,
    },
    backArrow: {
      color: colors.textInverse,
      fontSize: 20,
      fontWeight: "700",
    },
    headerTitle: {
      flex: 1,
      color: colors.textInverse,
      fontSize: 18,
      fontWeight: "700",
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
    },
    markAllBtn: {
      backgroundColor: colors.overlayInverse,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    markAllText: {
      color: colors.textInverse,
      fontSize: 12,
      fontWeight: "600",
    },
    filterRow: {
      flexDirection: "row",
      paddingHorizontal: pad,
      paddingVertical: 8,
      gap: 8,
      backgroundColor: colors.backgroundSecondary,
    },
    filterTab: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.background,
    },
    filterTabActive: {
      backgroundColor: colors.primary,
    },
    filterTabText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    filterTabTextActive: {
      color: colors.textInverse,
    },
    centerState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: pad,
    },
    stateText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.textSecondary,
    },
    errorText: {
      fontSize: 14,
      color: colors.error,
      textAlign: "center",
      marginBottom: 12,
    },
    retryBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 8,
    },
    retryText: {
      color: colors.textInverse,
      fontWeight: "600",
    },
    emptyIcon: {
      fontSize: 40,
      marginBottom: 12,
    },
    emptyText: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: "center",
    },
    listContent: {
      paddingBottom: 40,
    },
    notifRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: pad,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    unreadDotCol: {
      width: 12,
      paddingTop: 6,
      alignItems: "center",
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    typeIcon: {
      fontSize: 20,
      marginRight: 10,
      marginTop: 2,
    },
    notifContent: {
      flex: 1,
    },
    notifTitle: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    notifTitleUnread: {
      fontWeight: "700",
    },
    notifBody: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 4,
    },
    notifTime: {
      fontSize: 11,
      color: colors.textTertiary,
    },
  });
}
