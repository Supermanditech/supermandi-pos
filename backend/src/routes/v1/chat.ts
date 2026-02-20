// T-292: Chat API Routes
// T-299: FCM push notifications for chat events
// T-300: Support channel routes
// T-301: Attachment upload
// T-302: Template management (admin)

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { getPool } from '../../db/client';
import * as chatService from '../../services/chat/chatService';
import { noopSocketManager } from '../../services/chat/socketManager';
import { log } from "../../lib/logger";

export const chatRouter = Router();

// Auth middleware: require x-user-id header (set by API gateway after JWT validation)
function requireChatAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'] || req.headers['x-actor-id'];
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

// Apply auth middleware to all chat routes
chatRouter.use(requireChatAuth);

// UUID validation helper
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(s: string): boolean { return UUID_RE.test(s); }

// Multer for attachment uploads (memory storage, 10MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel', 'text/csv'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Socket manager reference (set by server init)
let socketManager = noopSocketManager;
export function setChatSocketManager(mgr: typeof noopSocketManager) {
  socketManager = mgr;
}

// Helper: extract user from gateway headers
function getUser(req: any): { userId: string; userType: string } {
  const userId = req.headers['x-user-id'] || req.headers['x-actor-id'];
  const userType = req.headers['x-actor-type'] || 'retailer';
  if (!userId) throw new Error('Authentication required');
  return { userId: String(userId), userType: String(userType).toLowerCase() };
}

// =============================================================================
// CONVERSATION ROUTES
// =============================================================================

// GET /api/v1/chat/conversations — List user's conversations
chatRouter.get('/conversations', async (req, res) => {
  try {
    const { userId } = getUser(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const pool = getPool();
    const result = await chatService.listConversations(pool, userId, limit, offset);

    res.json({
      conversations: result.conversations,
      total: result.total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list conversations';
    res.status(message === 'Authentication required' ? 401 : 500).json({ error: message });
  }
});

// POST /api/v1/chat/conversations/direct — Get or create direct conversation
chatRouter.post('/conversations/direct', async (req, res) => {
  try {
    const { userId, userType } = getUser(req);
    const { supplierId, storeId, displayName, otherUserId, otherUserType, otherUserName } = req.body;

    if (!supplierId || !storeId) {
      return res.status(400).json({ error: 'supplierId and storeId are required' });
    }

    const pool = getPool();
    const conversation = await chatService.getOrCreateDirectConversation(
      pool, storeId, supplierId, userId, userType,
      displayName || 'User', otherUserId || supplierId,
      otherUserType || 'supplier', otherUserName || 'Supplier'
    );

    res.json({ conversation });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create conversation';
    res.status(500).json({ error: message });
  }
});

// POST /api/v1/chat/conversations/support — Create support conversation (T-300)
chatRouter.post('/conversations/support', async (req, res) => {
  try {
    const { userId, userType } = getUser(req);
    const { displayName, storeId } = req.body;

    const pool = getPool();
    const conversation = await chatService.createSupportConversation(
      pool, userId, userType, displayName || 'User', storeId
    );

    res.json({ conversation });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create support conversation';
    res.status(500).json({ error: message });
  }
});

// GET /api/v1/chat/conversations/:id/messages — Get messages
chatRouter.get('/conversations/:id/messages', async (req, res) => {
  try {
    const { userId } = getUser(req);
    const conversationId = req.params.id;
    if (!isValidUUID(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const before = req.query.before as string | undefined;

    const pool = getPool();
    const messages = await chatService.getMessages(pool, conversationId, userId, limit, before);

    res.json({ messages });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load messages';
    const status = message === 'Not a participant in this conversation' ? 403 : 500;
    res.status(status).json({ error: message });
  }
});

// POST /api/v1/chat/conversations/:id/messages — Send message
chatRouter.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { userId, userType } = getUser(req);
    const conversationId = req.params.id;
    const { content, messageType, replyToId, metadata } = req.body;

    if (!content && messageType === 'text') {
      return res.status(400).json({ error: 'Message content is required' });
    }
    // Content length validation — prevent abuse
    if (content && typeof content === 'string' && content.length > 10000) {
      return res.status(400).json({ error: 'Message too long (max 10000 characters)' });
    }

    const pool = getPool();
    const msg = await chatService.sendMessage(pool, {
      conversationId,
      senderId: userId,
      senderType: userType as any,
      messageType: messageType || 'text',
      content,
      replyToId,
      metadata,
    });

    // T-293: Emit real-time event
    socketManager.emitToConversation(conversationId, 'message:new', msg);

    // T-299: Send FCM push to offline participants
    try {
      const participants = await chatService.getNotifiableParticipants(pool, conversationId, userId);
      const { sendToUser } = await import('../../services/fcmService.js');

      for (const participant of participants) {
        if (!socketManager.isUserOnline(participant.userId)) {
          const senderName = req.body.displayName || userType;
          const preview = messageType === 'image' ? '📷 Photo'
            : messageType === 'document' ? '📎 Document'
            : (content || '').substring(0, 100);

          sendToUser(participant.userId, {
            title: `${senderName}`,
            body: preview,
            data: {
              type: 'chat_message',
              conversationId,
              messageId: msg.id,
              senderId: userId,
            },
            channel: 'chat',
          }).catch(err => log.error('[Chat FCM] Failed:', err));
        }
      }
    } catch (fcmErr) {
      // FCM failures should not block message sending
      log.error('[Chat FCM] Push notification error:', fcmErr);
    }

    res.status(201).json({ message: msg });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send message';
    const status = message === 'Not a participant in this conversation' ? 403 : 500;
    res.status(status).json({ error: message });
  }
});

// PATCH /api/v1/chat/conversations/:id/read — Mark as read
chatRouter.patch('/conversations/:id/read', async (req, res) => {
  try {
    const { userId } = getUser(req);
    const conversationId = req.params.id;

    const pool = getPool();
    await chatService.markAsRead(pool, conversationId, userId);

    // Emit read receipt via socket
    socketManager.emitToConversation(conversationId, 'message:read', {
      conversationId,
      userId,
    });

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to mark as read' });
  }
});

// PATCH /api/v1/chat/conversations/:id/mute — Toggle mute
chatRouter.patch('/conversations/:id/mute', async (req, res) => {
  try {
    const { userId } = getUser(req);
    const conversationId = req.params.id;

    const pool = getPool();
    const isMuted = await chatService.toggleMute(pool, conversationId, userId);

    res.json({ isMuted });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to toggle mute' });
  }
});

// GET /api/v1/chat/unread-count — Total unread badge count
chatRouter.get('/unread-count', async (req, res) => {
  try {
    const { userId } = getUser(req);
    const pool = getPool();
    const count = await chatService.getTotalUnreadCount(pool, userId);

    res.json({ unreadCount: count });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get unread count' });
  }
});

// =============================================================================
// T-301: ATTACHMENT UPLOAD
// =============================================================================

// POST /api/v1/chat/conversations/:id/upload — Upload attachment and send as message
chatRouter.post('/conversations/:id/upload', upload.single('file'), async (req, res) => {
  try {
    const { userId, userType } = getUser(req);
    const conversationId = req.params.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Determine message type from mime
    const messageType = file.mimetype.startsWith('image/') ? 'image' : 'document';

    // Try GCS upload, fallback to local
    let attachmentUrl: string;
    try {
      const { uploadBuffer } = await import('@supermandi/common/storage/gcsStorageService.js');
      const bucket = process.env.GCS_CHAT_BUCKET || process.env.GCS_BUCKET || 'supermandi-chat';
      const key = `chat/${conversationId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await uploadBuffer(bucket, key, file.buffer, file.mimetype);
      attachmentUrl = `https://storage.googleapis.com/${bucket}/${key}`;
    } catch {
      // Fallback: store as data URI for dev/staging (not ideal for production)
      attachmentUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64').substring(0, 100)}...`;
      log.warn('[Chat Upload] GCS unavailable, using fallback');
    }

    const pool = getPool();
    const msg = await chatService.sendMessage(pool, {
      conversationId,
      senderId: userId,
      senderType: userType as any,
      messageType: messageType as any,
      content: req.body.caption || null,
      attachmentUrl,
      attachmentName: file.originalname,
      attachmentSize: file.size,
      attachmentMime: file.mimetype,
    });

    // Emit real-time event
    socketManager.emitToConversation(conversationId, 'message:new', msg);

    res.status(201).json({ message: msg });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to upload';
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// T-300: SUPPORT ADMIN ROUTES
// =============================================================================

// GET /api/v1/chat/support/queue — List support conversations (admin only)
chatRouter.get('/support/queue', async (req, res) => {
  try {
    const { userType } = getUser(req);
    if (userType !== 'admin' && userType !== 'support' && userType !== 'superadmin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const status = (req.query.status as 'open' | 'resolved' | 'all') || 'open';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const pool = getPool();
    const result = await chatService.listSupportConversations(pool, status, limit, offset);

    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load support queue' });
  }
});

// POST /api/v1/chat/support/:id/assign — Assign support agent
chatRouter.post('/support/:id/assign', async (req, res) => {
  try {
    const { userId, userType } = getUser(req);
    if (userType !== 'admin' && userType !== 'support' && userType !== 'superadmin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { agentName } = req.body;
    const pool = getPool();
    await chatService.assignSupportAgent(pool, req.params.id, userId, agentName || 'Support Agent');

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to assign agent' });
  }
});

// POST /api/v1/chat/support/:id/resolve — Resolve support conversation
chatRouter.post('/support/:id/resolve', async (req, res) => {
  try {
    const { userId, userType } = getUser(req);
    if (userType !== 'admin' && userType !== 'support' && userType !== 'superadmin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const pool = getPool();
    await chatService.resolveSupportConversation(pool, req.params.id, userId);

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to resolve conversation' });
  }
});

// =============================================================================
// T-302: TEMPLATE MANAGEMENT (ADMIN)
// =============================================================================

// GET /api/v1/chat/templates — List all templates
chatRouter.get('/templates', async (req, res) => {
  try {
    const pool = getPool();
    const templates = await chatService.listTemplates(pool);
    res.json({ templates });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list templates' });
  }
});

// POST /api/v1/chat/templates — Create/update template (admin)
chatRouter.post('/templates', async (req, res) => {
  try {
    const { userType } = getUser(req);
    if (userType !== 'admin' && userType !== 'superadmin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, category, channel, language, bodyTemplate, variables, isActive } = req.body;
    if (!name || !category || !bodyTemplate) {
      return res.status(400).json({ error: 'name, category, and bodyTemplate are required' });
    }

    const pool = getPool();
    const result = await chatService.upsertTemplate(pool, {
      name, category, channel: channel || 'in_app', language,
      bodyTemplate, variables: variables || [], isActive,
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save template' });
  }
});

// POST /api/v1/chat/templates/send — Send template message to conversation
chatRouter.post('/templates/send', async (req, res) => {
  try {
    const { conversationId, templateName, variables } = req.body;
    if (!conversationId || !templateName) {
      return res.status(400).json({ error: 'conversationId and templateName are required' });
    }

    const pool = getPool();
    const msg = await chatService.sendTemplateMessage(pool, conversationId, templateName, variables || {});

    if (!msg) {
      return res.status(404).json({ error: 'Template not found or inactive' });
    }

    // Emit real-time event
    socketManager.emitToConversation(conversationId, 'message:new', msg);

    res.status(201).json({ message: msg });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send template message' });
  }
});
