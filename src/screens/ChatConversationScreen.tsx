// T-294: POS Chat Conversation Screen
// Message thread view with text input, message bubbles, typing indicator

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, BackHandler, AppState,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import * as chatApi from '../services/api/chatApi';

interface Props {
  conversationId: string;
  conversationTitle: string;
  conversationType: string;
  currentUserId: string;
  currentUserName: string;
  onBack: () => void;
}

export default function ChatConversationScreen({
  conversationId, conversationTitle, conversationType,
  currentUserId, currentUserName, onBack,
}: Props) {
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

  const [messages, setMessages] = useState<chatApi.ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const hasMarkedRead = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  const fetchMessages = useCallback(async (isPolling = false) => {
    if (!isPolling) setError(null);
    try {
      const result = await chatApi.getMessages(conversationId);
      const newMessages = result.messages || [];
      // Only update state if message list actually changed (prevents scroll jump)
      setMessages(prev => {
        if (prev.length === newMessages.length && prev[0]?.id === newMessages[0]?.id) return prev;
        return newMessages;
      });
      // Mark as read only once on mount, not every poll
      if (!hasMarkedRead.current) {
        hasMarkedRead.current = true;
        chatApi.markAsRead(conversationId).catch(() => {});
      }
    } catch (err: unknown) {
      if (!isPolling) setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
    // UIUX-POS-026: Poll every 15s (was 5s), pause when app backgrounded
    const interval = setInterval(() => {
      if (appStateRef.current === 'active') fetchMessages(true);
    }, 15000);
    const appStateSub = AppState.addEventListener('change', (state) => {
      appStateRef.current = state;
    });
    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [fetchMessages]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      const result = await chatApi.sendMessage(conversationId, trimmed, currentUserName);
      setText(''); // POS-038: Only clear on success to avoid losing typed text
      setMessages(prev => [result.message, ...prev]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }, [text, sending, conversationId, currentUserName]);

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function shouldShowDateSeparator(index: number): boolean {
    if (index === messages.length - 1) return true; // Last item (earliest message)
    const current = new Date(messages[index].createdAt).toDateString();
    const next = new Date(messages[index + 1].createdAt).toDateString();
    return current !== next;
  }

  const renderMessage = ({ item, index }: { item: chatApi.ChatMessage; index: number }) => {
    const isOwn = item.senderId === currentUserId;
    const isSystem = item.senderType === 'system';

    if (isSystem) {
      return (
        <View style={styles.systemMessage}>
          {shouldShowDateSeparator(index) && (
            <Text style={styles.dateSeparator}>{formatDate(item.createdAt)}</Text>
          )}
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }

    return (
      <View>
        {shouldShowDateSeparator(index) && (
          <Text style={styles.dateSeparator}>{formatDate(item.createdAt)}</Text>
        )}
        <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
          {/* Attachment */}
          {item.messageType === 'image' && item.attachmentUrl && (
            <View style={styles.attachmentPreview}>
              <MaterialCommunityIcons name="image" size={20} color="#64748b" />
              <Text style={styles.attachmentText}>{item.attachmentName || 'Photo'}</Text>
            </View>
          )}
          {item.messageType === 'document' && item.attachmentUrl && (
            <View style={styles.attachmentPreview}>
              <MaterialCommunityIcons name="file-document" size={20} color="#64748b" />
              <Text style={styles.attachmentText}>{item.attachmentName || 'Document'}</Text>
            </View>
          )}
          {/* Text content */}
          {item.content && (
            <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>
              {item.content}
            </Text>
          )}
          <Text style={[styles.time, isOwn ? styles.ownTime : styles.otherTime]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{conversationTitle}</Text>
          <Text style={styles.headerSubtitle}>
            {conversationType === 'support' ? 'Support' : 'Chat'}
          </Text>
        </View>
      </View>

      {/* Error — POS-039: retry/dismiss buttons */}
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 4 }}>
            <Pressable onPress={() => { setError(null); fetchMessages(); }}>
              <Text style={{ color: '#991b1b', fontSize: 12, fontWeight: '600' }}>Retry</Text>
            </Pressable>
            <Pressable onPress={() => setError(null)}>
              <Text style={{ color: '#64748b', fontSize: 12 }}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Messages */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={
            <View style={styles.emptyCenter}>
              <MaterialCommunityIcons name="chat-processing-outline" size={40} color="#94a3b8" />
              <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
            </View>
          }
        />
      )}

      {/* Input */}
      <View style={[styles.inputBar, { paddingBottom: 8 + insets.bottom }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor="#94a3b8"
          multiline
          maxLength={2000}
          editable={!sending}
        />
        <Pressable
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialCommunityIcons name="send" size={20} color="#fff" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  headerSubtitle: { fontSize: 12, color: '#64748b' },
  errorBar: { padding: 8, backgroundColor: '#fee2e2' },
  errorText: { color: '#991b1b', fontSize: 12, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100, transform: [{ scaleY: -1 }] },
  emptyText: { marginTop: 8, color: '#64748b', fontSize: 14 },
  messagesList: { paddingHorizontal: 12, paddingVertical: 8 },
  dateSeparator: {
    textAlign: 'center', fontSize: 11, color: '#94a3b8', marginVertical: 8,
    backgroundColor: '#f1f5f9', alignSelf: 'center', paddingHorizontal: 12,
    paddingVertical: 3, borderRadius: 10, overflow: 'hidden',
  },
  systemMessage: { alignItems: 'center', marginVertical: 4 },
  systemText: {
    fontSize: 12, color: '#64748b', fontStyle: 'italic',
    backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 8, overflow: 'hidden',
  },
  bubble: {
    maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 16, marginVertical: 2,
  },
  ownBubble: { alignSelf: 'flex-end', backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  otherBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  messageText: { fontSize: 14, lineHeight: 20 },
  ownText: { color: '#fff' },
  otherText: { color: '#1e293b' },
  time: { fontSize: 10, marginTop: 2 },
  ownTime: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  otherTime: { color: '#94a3b8' },
  attachmentPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, marginBottom: 4,
  },
  attachmentText: { fontSize: 12, color: '#64748b' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 8,
    borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff',
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8, fontSize: 14,
    maxHeight: 100, color: '#1e293b', backgroundColor: '#f8fafc',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  sendBtnDisabled: { backgroundColor: '#94a3b8' },
});
