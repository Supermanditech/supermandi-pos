// T-295: Supplier Portal Chat UI
// Two-panel layout: conversation list (left) + message thread (right)
// R7.SUP.005: Converted inline styles to Tailwind classes
// R7.SUP.006: Fixed height using flex layout instead of calc(100vh - 64px)

'use client';

import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageSquare, Send, Search, Headphones, Image, Paperclip } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
// UIUX-SUP-006: Use centralized apiFetch (auth via HttpOnly cookies, 401 redirect, 30s timeout)
import { apiFetch as globalApiFetch } from '@/lib/api';

interface Conversation {
  id: string;
  type: string;
  title: string | null;
  storeId: string | null;
  supplierId: string | null;
  isActive: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  isMuted: boolean;
  otherParticipantName: string | null;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: string;
  messageType: string;
  content: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  isDeleted: boolean;
  createdAt: string;
}

// UIUX-SUP-006: Thin wrapper adapting globalApiFetch to the JSON-in/JSON-out shape used by react-query below
async function chatApiFetch(url: string, options?: RequestInit): Promise<unknown> {
  return globalApiFetch(url, options);
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' });
}

export default function SupplierChatPageWrapper() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-400 dark:text-slate-500">Loading chat...</div>}>
      <SupplierChatPage />
    </Suspense>
  );
}

function SupplierChatPage() {
  const searchParams = useSearchParams();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [convLimit, setConvLimit] = useState(50);

  // Fetch conversations
  const { data: convData, isLoading: convLoading } = useQuery({
    queryKey: ['supplier-conversations', convLimit],
    queryFn: () => chatApiFetch(`/api/v1/chat/conversations?limit=${convLimit}`),
    refetchInterval: 10000,
  });

  const conversations: Conversation[] = useMemo(() => {
    const raw = (convData as { conversations?: unknown[] })?.conversations;
    if (!Array.isArray(raw)) return [];
    return raw.filter((c): c is Conversation => c != null && typeof (c as Conversation).id === 'string');
  }, [convData]);
  const selectedConv = conversations.find(c => c.id === selectedConvId);

  // Fetch messages for selected conversation
  const { data: msgData, isLoading: msgLoading } = useQuery({
    queryKey: ['supplier-messages', selectedConvId],
    queryFn: () => selectedConvId ? chatApiFetch(`/api/v1/chat/conversations/${selectedConvId}/messages?limit=100`) : null,
    enabled: !!selectedConvId,
    refetchInterval: 5000,
  });

  const messages: ChatMessage[] = useMemo(() => {
    const raw = (msgData as { messages?: unknown[] })?.messages;
    if (!Array.isArray(raw)) return [];
    return raw.filter((m): m is ChatMessage => m != null && typeof (m as ChatMessage).id === 'string').slice().reverse();
  }, [msgData]);

  // Mark as read when selecting conversation (only if it has unread messages)
  useEffect(() => {
    if (selectedConvId) {
      const conv = conversations.find(c => c.id === selectedConvId);
      if (conv && conv.unreadCount > 0) {
        chatApiFetch(`/api/v1/chat/conversations/${selectedConvId}/read`, { method: 'PATCH' }).catch(() => {});
      }
    }
  }, [selectedConvId, conversations]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Send message
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      return chatApiFetch(`/api/v1/chat/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text, messageType: 'text' }),
      });
    },
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['supplier-messages', selectedConvId] });
      queryClient.invalidateQueries({ queryKey: ['supplier-conversations'] });
    },
    // UIUX-SUP-008: Show error feedback instead of silently losing message
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send message. Please try again.');
    },
  });

  const handleSend = useCallback(() => {
    const trimmed = messageText.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  }, [messageText, sendMutation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Filter conversations by search
  const filteredConversations = searchTerm
    ? conversations.filter(c =>
        (c.title || c.otherParticipantName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.lastMessagePreview || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : conversations;

  // R7.SUP.006: Use flex h-full layout to avoid calc(100vh - 64px) overflow
  return (
    <div className="flex h-full bg-slate-50 dark:bg-gray-950 min-h-0">
      {/* Left Panel: Conversation List */}
      <div className="w-80 border-r border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col min-h-0 flex-shrink-0">
        <div className="px-4 py-4 border-b border-slate-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-3 text-slate-800 dark:text-slate-100">Messages</h2>
          <div className="relative">
            <Search size={16} className="absolute left-2.5 top-2.5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700 text-sm outline-none bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 box-border"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {convLoading ? (
            <div className="px-4 py-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3 border-b border-slate-100 dark:border-gray-800">
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-3/5 mb-1.5 animate-pulse" />
                    <div className="h-2.5 bg-slate-100 dark:bg-gray-800 rounded w-4/5 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
              No conversations yet
            </div>
          ) : (
            filteredConversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={`px-4 py-3 cursor-pointer flex items-center gap-3 border-b border-slate-100 dark:border-gray-800 transition-colors ${
                  selectedConvId === conv.id
                    ? 'bg-sky-50 dark:bg-sky-950'
                    : 'hover:bg-slate-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  conv.type === 'support'
                    ? 'bg-violet-100 dark:bg-violet-900'
                    : 'bg-green-50 dark:bg-green-900'
                }`}>
                  {conv.type === 'support' ? (
                    <Headphones size={18} className="text-violet-600 dark:text-violet-400" />
                  ) : (
                    <MessageSquare size={18} className="text-green-600 dark:text-green-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm truncate text-slate-800 dark:text-slate-100">
                      {conv.title || conv.otherParticipantName || 'Conversation'}
                    </span>
                    <span className="text-[0.7rem] text-slate-400 dark:text-slate-500 flex-shrink-0 ml-2">
                      {formatTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <span className="text-[0.8rem] text-slate-500 dark:text-slate-400 truncate">
                      {conv.lastMessagePreview || 'No messages'}
                    </span>
                    {conv.unreadCount > 0 && (
                      <span className="min-w-[18px] h-[18px] rounded-full bg-green-600 dark:bg-green-500 text-white text-[0.65rem] font-bold flex items-center justify-center px-1 flex-shrink-0 ml-1">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {conversations.length >= convLimit && (
            <button
              onClick={() => setConvLimit(l => l + 50)}
              className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 bg-slate-50 dark:bg-gray-900 border-none border-t border-slate-200 dark:border-gray-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors"
            >
              Load more conversations
            </button>
          )}
        </div>
      </div>

      {/* Right Panel: Message Thread */}
      <div className="flex-1 flex flex-col min-h-0">
        {!selectedConvId ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Select a conversation"
              description="Choose a conversation from the list to view messages"
            />
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center gap-3 flex-shrink-0">
              <h3 className="text-[0.95rem] font-semibold m-0 text-slate-800 dark:text-slate-100">
                {selectedConv?.title || selectedConv?.otherParticipantName || 'Chat'}
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {selectedConv?.type === 'support' ? 'Support' : 'Direct'}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {msgLoading ? (
                <div className="text-center text-slate-500 dark:text-slate-400 py-8">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-slate-400 dark:text-slate-500 py-8">No messages yet. Start the conversation!</div>
              ) : (
                messages.map(msg => {
                  const isSystem = msg.senderType === 'system';
                  const isOwn = msg.senderType === 'supplier';

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="text-center my-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400 italic bg-slate-100 dark:bg-gray-800 px-3 py-1 rounded-lg">
                          {msg.content}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className={`flex mb-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded-xl text-sm leading-snug ${
                        isOwn
                          ? 'bg-green-600 dark:bg-green-700 text-white rounded-br-sm'
                          : 'bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-gray-700 rounded-bl-sm'
                      }`}>
                        {msg.attachmentName && (
                          <div className={`text-xs mb-1 ${isOwn ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                            {msg.messageType === 'image'
                              ? <Image size={12} className="inline align-middle mr-1" />
                              : <Paperclip size={12} className="inline align-middle mr-1" />
                            }
                            {msg.attachmentName}
                          </div>
                        )}
                        {msg.content && <div>{msg.content}</div>}
                        <div className={`text-[0.65rem] mt-0.5 text-right ${isOwn ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex gap-2 items-end flex-shrink-0">
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700 text-sm resize-none max-h-24 outline-none font-inherit bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
              />
              <button
                onClick={handleSend}
                disabled={!messageText.trim() || sendMutation.isPending}
                className={`p-2 rounded-lg border-none flex items-center justify-center transition-colors ${
                  messageText.trim()
                    ? 'bg-green-600 dark:bg-green-700 text-white cursor-pointer hover:bg-green-700 dark:hover:bg-green-600'
                    : 'bg-slate-300 dark:bg-gray-700 text-white cursor-default'
                }`}
              >
                <Send size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
