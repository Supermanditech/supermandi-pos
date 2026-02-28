// T-294: POS Chat List Screen
// Shows conversation list with unread badges, last message preview

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator,
  BackHandler, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, colors as staticColors, useThemeColors } from '../theme';
import * as chatApi from '../services/api/chatApi';

// Support-type conversation uses primary brand color (module-level, uses static colors)
const SUPPORT_ICON_COLOR = staticColors.primary;
const SUPPORT_BG_COLOR = staticColors.primarySoft;

interface Props {
  onSelectConversation: (conversation: chatApi.Conversation) => void;
  onContactSupport: () => void;
  onBack: () => void;
}

export default function ChatListScreen({ onSelectConversation, onContactSupport, onBack }: Props) {
  const colors = useThemeColors();

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    backBtn: { padding: 4, marginRight: 8 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: colors.textPrimary },
    supportBtn: { padding: 4 },
    errorBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: 12, backgroundColor: colors.errorSoft,
    },
    errorText: { color: colors.errorDark, fontSize: 13 },
    retryText: { color: colors.errorDark, fontWeight: '600', textDecorationLine: 'underline' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    loadingText: { marginTop: 12, color: colors.textTertiary, fontSize: 14 },
    emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    emptyText: { marginTop: 4, fontSize: 13, color: colors.textTertiary, textAlign: 'center' },
    supportCta: {
      marginTop: 16, flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10,
      borderRadius: 8, gap: 6,
    },
    supportCtaText: { color: colors.textInverse, fontWeight: '600', fontSize: 14 },
    list: { paddingBottom: 16 },
    conversationItem: {
      flexDirection: 'row', alignItems: 'center', padding: 14,
      borderBottomWidth: 1, borderBottomColor: colors.backgroundSecondary, backgroundColor: colors.surface,
    },
    avatar: {
      width: 44, height: 44, borderRadius: 22, backgroundColor: colors.successSoft,
      alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    avatarSupport: { backgroundColor: colors.primarySoft },
    conversationContent: { flex: 1 },
    conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    conversationName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1, marginRight: 8 },
    timestamp: { fontSize: 11, color: colors.textTertiary },
    conversationFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    preview: { fontSize: 13, color: colors.textTertiary, flex: 1, marginRight: 8 },
    badge: {
      minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
    },
    badgeText: { color: colors.textInverse, fontSize: 11, fontWeight: '700' },
  }), [colors]);

  const insets = useSafeAreaInsets();

  // UIUX-POS-004: Android hardware back button support
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const [conversations, setConversations] = useState<chatApi.Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    setError(null);
    try {
      const result = await chatApi.getConversations();
      setConversations(result.conversations || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchConversations();
  }, [fetchConversations]);

  function formatTime(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' });
  }

  function getConversationIcon(type: string): string {
    switch (type) {
      case 'support': return 'headset';
      case 'group': return 'account-group';
      default: return 'store';
    }
  }

  const renderItem = ({ item }: { item: chatApi.Conversation }) => (
    <Pressable
      style={styles.conversationItem}
      onPress={() => onSelectConversation(item)}
      accessibilityLabel={`${item.title || item.otherParticipantName || 'Conversation'}${item.unreadCount > 0 ? `, ${item.unreadCount} unread` : ''}`}
      accessibilityRole="button"
    >
      <View style={[styles.avatar, item.type === 'support' ? styles.avatarSupport : null]}>
        <MaterialCommunityIcons
          name={getConversationIcon(item.type) as any}
          size={22}
          color={item.type === 'support' ? colors.primary : colors.primary}
        />
      </View>

      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationName} numberOfLines={1}>
            {item.title || item.otherParticipantName || 'Conversation'}
          </Text>
          <Text style={styles.timestamp}>{formatTime(item.lastMessageAt)}</Text>
        </View>
        <View style={styles.conversationFooter}>
          <Text style={styles.preview} numberOfLines={1}>
            {item.lastMessagePreview || 'No messages yet'}
          </Text>
          {item.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Messages</Text>
        <Pressable onPress={onContactSupport} style={styles.supportBtn} accessibilityLabel="Contact support" accessibilityRole="button">
          <MaterialCommunityIcons name="headset" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={fetchConversations} accessibilityLabel="Retry" accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Loading */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="chat-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptyText}>
            Start a chat with your supplier or contact support
          </Text>
          <Pressable style={styles.supportCta} onPress={onContactSupport} accessibilityLabel="Contact Support" accessibilityRole="button">
            <MaterialCommunityIcons name="headset" size={18} color={colors.textInverse} />
            <Text style={styles.supportCtaText}>Contact Support</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}
