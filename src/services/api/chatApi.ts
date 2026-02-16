// T-294: Chat API Service for POS
// Frontend API client for in-app messaging

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

export async function getConversations(limit = 50, offset = 0) {
  return apiClient.get<{ conversations: Conversation[]; total: number }>(
    `/chat/conversations?limit=${limit}&offset=${offset}`
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
  return apiClient.post<{ conversation: Conversation }>('/chat/conversations/direct', {
    supplierId, storeId, displayName, otherUserId, otherUserType, otherUserName,
  });
}

export async function createSupportConversation(displayName: string, storeId?: string) {
  return apiClient.post<{ conversation: Conversation }>('/chat/conversations/support', {
    displayName, storeId,
  });
}

export async function getMessages(conversationId: string, limit = 50, before?: string) {
  let url = `/chat/conversations/${conversationId}/messages?limit=${limit}`;
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
    `/chat/conversations/${conversationId}/messages`,
    { content, messageType: 'text', displayName, replyToId }
  );
}

export async function markAsRead(conversationId: string) {
  return apiClient.patch<{ success: boolean }>(
    `/chat/conversations/${conversationId}/read`, {}
  );
}

export async function toggleMute(conversationId: string) {
  return apiClient.patch<{ isMuted: boolean }>(
    `/chat/conversations/${conversationId}/mute`, {}
  );
}

export async function getUnreadCount() {
  return apiClient.get<{ unreadCount: number }>('/chat/unread-count');
}
