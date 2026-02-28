// T-294: Chat API Service for POS
// Frontend API client for in-app messaging
// STG-152: Chat routes require x-user-id header (set by JWT middleware in gateway).
// POS uses device tokens, not JWT. We route chat calls through /api/v1/pos/chat/*
// so the POS device token middleware handles auth, and the backend can set x-user-id
// from the device context.

import { apiClient } from "./apiClient";

// =============================================================================
// TYPES
// =============================================================================

export interface Conversation {
  id: string;
  type: 'direct' | 'group' | 'support';
  title: string | null;
  storeId: string | null;
  supplierId: string | null;
  isActive: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
  unreadCount: number;
  isMuted: boolean;
  otherParticipantName: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: string;
  messageType: 'text' | 'image' | 'document' | 'system' | 'template';
  content: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  attachmentMime: string | null;
  replyToId: string | null;
  metadata: Record<string, unknown>;
  isDeleted: boolean;
  createdAt: string;
}

// =============================================================================
// API CALLS
// =============================================================================

// STG-152: Use POS chat path so device token auth works (not JWT)
const CHAT_BASE = '/api/v1/pos/chat';

export async function getConversations(limit = 50, offset = 0) {
  return apiClient.get<{ conversations: Conversation[]; total: number }>(
    `${CHAT_BASE}/conversations?limit=${limit}&offset=${offset}`
  );
}

export async function getOrCreateDirectConversation(
  supplierId: string,
  storeId: string,
  displayName: string,
  otherUserId: string,
  otherUserType: string,
  otherUserName: string,
) {
  return apiClient.post<{ conversation: Conversation }>(`${CHAT_BASE}/conversations/direct`, {
    supplierId, storeId, displayName, otherUserId, otherUserType, otherUserName,
  });
}

export async function createSupportConversation(displayName: string, storeId?: string) {
  return apiClient.post<{ conversation: Conversation }>(`${CHAT_BASE}/conversations/support`, {
    displayName, storeId,
  });
}

export async function getMessages(conversationId: string, limit = 50, before?: string) {
  let url = `${CHAT_BASE}/conversations/${conversationId}/messages?limit=${limit}`;
  if (before) url += `&before=${encodeURIComponent(before)}`;
  return apiClient.get<{ messages: ChatMessage[] }>(url);
}

export async function sendMessage(
  conversationId: string,
  content: string,
  displayName?: string,
  replyToId?: string,
) {
  return apiClient.post<{ message: ChatMessage }>(
    `${CHAT_BASE}/conversations/${conversationId}/messages`,
    { content, messageType: 'text', displayName, replyToId }
  );
}

export async function markAsRead(conversationId: string) {
  return apiClient.patch<{ success: boolean }>(
    `${CHAT_BASE}/conversations/${conversationId}/read`, {}
  );
}

export async function toggleMute(conversationId: string) {
  return apiClient.patch<{ isMuted: boolean }>(
    `${CHAT_BASE}/conversations/${conversationId}/mute`, {}
  );
}

export async function getUnreadCount() {
  return apiClient.get<{ unreadCount: number }>(`${CHAT_BASE}/unread-count`);
}
