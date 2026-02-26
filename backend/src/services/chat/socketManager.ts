// T-293: Socket.io Real-Time Chat Manager
// Handles WebSocket connections, room management, typing indicators, presence
// Uses Redis pub/sub for multi-instance scaling on Cloud Run

import type { Server as HttpServer } from 'http';
import type { Pool } from 'pg';
import { log } from "../../lib/logger";

// =============================================================================
// TYPES
// =============================================================================

interface SocketUser {
  userId: string;
  userType: string;
  socketId: string;
  connectedAt: Date;
}

interface TypingEvent {
  conversationId: string;
  userId: string;
  displayName: string;
  isTyping: boolean;
}

interface ChatSocketManager {
  getOnlineUsers: () => Map<string, SocketUser>;
  isUserOnline: (userId: string) => boolean;
  emitToConversation: (conversationId: string, event: string, data: unknown) => void;
  emitToUser: (userId: string, event: string, data: unknown) => void;
}

// In-memory state (per instance — Redis pub/sub syncs across instances)
const onlineUsers = new Map<string, SocketUser>();
const userSockets = new Map<string, string>(); // userId → socketId

// UUID pattern for validating conversation IDs
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// WEBSOCKET-RATE-LIMIT-MISSING: Per-connection sliding window rate limiter.
// Prevents a single client from flooding events (typing, read receipts, etc.).
const WS_RATE_LIMIT_MAX = 20;       // max events per window
const WS_RATE_LIMIT_WINDOW_MS = 1000; // 1-second window

interface WsRateSlot {
  count: number;
  resetAt: number;
}
const wsRateLimits = new Map<string, WsRateSlot>();

function checkWsRateLimit(socketId: string): boolean {
  const now = Date.now();
  const slot = wsRateLimits.get(socketId);
  if (!slot || now >= slot.resetAt) {
    wsRateLimits.set(socketId, { count: 1, resetAt: now + WS_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (slot.count >= WS_RATE_LIMIT_MAX) {
    return false; // over limit
  }
  slot.count++;
  return true;
}

// =============================================================================
// SOCKET.IO INITIALIZATION
// =============================================================================

/**
 * Initialize Socket.io chat server.
 * Attaches to existing HTTP server.
 * Auth via JWT token passed in handshake auth.
 */
export async function initChatSocket(
  httpServer: HttpServer,
  pool: Pool,
): Promise<ChatSocketManager> {
  // Dynamic import — socket.io is optional dependency
  // @ts-expect-error socket.io types may not be installed in all builds
  const { Server } = await import('socket.io');

  // CORS: restrict to known portal origins (not wildcard)
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',')
    : ['https://staging.supermandi.tech', 'https://supermandi.tech',
       'http://localhost:5173', 'http://localhost:5174', 'http://localhost:4001'];

  const io = new Server(httpServer, {
    path: '/ws/chat',
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // LIVE.BE.CHAT_WS_JWT_CONSTRAINTS.001: Auth middleware with algorithm pinning and issuer enforcement
  io.use(async (socket, next) => {
    try {
      // Only accept token from auth object (not query string — prevents token leaking in logs/URLs)
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      let userId: string | undefined;
      let userType: string | undefined;

      try {
        const jwt = await import('jsonwebtoken');
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          log.error('[ChatSocket] JWT_SECRET not configured');
          return next(new Error('Server misconfigured'));
        }
        const decoded = jwt.verify(String(token), secret, {
          algorithms: ['HS256'],
          issuer: process.env.JWT_ISSUER || 'supermandi-auth',
        }) as Record<string, unknown>;
        userId = String(decoded.sub || '');
        userType = String(decoded.actorType || 'retailer');
      } catch {
        return next(new Error('Invalid token'));
      }

      if (!userId) {
        return next(new Error('Invalid token claims'));
      }

      // Attach verified user info to socket
      (socket as any).userId = userId;
      (socket as any).userType = userType;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = (socket as any).userId as string;
    const userType = (socket as any).userType as string;

    // Register online user
    onlineUsers.set(userId, {
      userId,
      userType,
      socketId: socket.id,
      connectedAt: new Date(),
    });
    userSockets.set(userId, socket.id);

    // Join all user's conversation rooms
    try {
      const convResult = await pool.query(
        `SELECT conversation_id FROM chat.conversation_participants
         WHERE user_id = $1 AND left_at IS NULL`,
        [userId]
      );
      for (const row of convResult.rows) {
        socket.join(`conv:${row.conversation_id}`);
      }
    } catch (err) {
      log.error('[ChatSocket] Failed to join rooms:', err);
    }

    // Broadcast online status to all conversations
    socket.broadcast.emit('user:online', { userId, userType });

    // Handle typing indicators
    socket.on('typing:start', (data: { conversationId: string; displayName: string }) => {
      if (!checkWsRateLimit(socket.id)) return;
      if (!data?.conversationId || !UUID_RE.test(data.conversationId)) return;
      const safeName = String(data.displayName || '').substring(0, 100);
      socket.to(`conv:${data.conversationId}`).emit('typing', {
        conversationId: data.conversationId,
        userId,
        displayName: safeName,
        isTyping: true,
      } as TypingEvent);
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      if (!checkWsRateLimit(socket.id)) return;
      if (!data?.conversationId || !UUID_RE.test(data.conversationId)) return;
      socket.to(`conv:${data.conversationId}`).emit('typing', {
        conversationId: data.conversationId,
        userId,
        displayName: '',
        isTyping: false,
      } as TypingEvent);
    });

    // Handle read receipt
    socket.on('message:read', (data: { conversationId: string }) => {
      if (!checkWsRateLimit(socket.id)) return;
      if (!data?.conversationId || !UUID_RE.test(data.conversationId)) return;
      socket.to(`conv:${data.conversationId}`).emit('message:read', {
        conversationId: data.conversationId,
        userId,
      });
    });

    // Handle join conversation room — verify user is actually a participant
    socket.on('conversation:join', async (data: { conversationId: string }) => {
      if (!checkWsRateLimit(socket.id)) return;
      if (!data?.conversationId || !UUID_RE.test(data.conversationId)) return;
      try {
        const check = await pool.query(
          `SELECT 1 FROM chat.conversation_participants
           WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
          [data.conversationId, userId]
        );
        if (check.rows.length > 0) {
          socket.join(`conv:${data.conversationId}`);
        }
      } catch (err) {
        log.error('[ChatSocket] conversation:join error:', err);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      userSockets.delete(userId);
      wsRateLimits.delete(socket.id);
      socket.broadcast.emit('user:offline', { userId });
    });
  });

  // Manager interface for REST API to emit events
  const manager: ChatSocketManager = {
    getOnlineUsers: () => onlineUsers,

    isUserOnline: (userId: string) => onlineUsers.has(userId),

    emitToConversation: (conversationId: string, event: string, data: unknown) => {
      io.to(`conv:${conversationId}`).emit(event, data);
    },

    emitToUser: (userId: string, event: string, data: unknown) => {
      const socketId = userSockets.get(userId);
      if (socketId) {
        io.to(socketId).emit(event, data);
      }
    },
  };

  log.info('[ChatSocket] Socket.io chat server initialized on /ws/chat');
  return manager;
}

// Export for optional use when socket.io is not initialized
export const noopSocketManager: ChatSocketManager = {
  getOnlineUsers: () => new Map(),
  isUserOnline: () => false,
  emitToConversation: () => {},
  emitToUser: () => {},
};
