// T-292: Chat Service — Core business logic for in-app messaging
// T-300: Support channel creation
// T-301: Attachment support
// T-302: Message template rendering

import type { Pool } from 'pg';

// =============================================================================
// TYPES
// =============================================================================

export interface Conversation {
  id: string;
  type: 'direct' | 'group' | 'support';
  title: string | null;
  storeId: string | null;
  supplierId: string | null;
  createdBy: string;
  isActive: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithParticipant extends Conversation {
  unreadCount: number;
  isMuted: boolean;
  otherParticipantName: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: string;
  messageType: string;
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

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  senderType: 'retailer' | 'supplier' | 'admin' | 'support' | 'system';
  messageType?: 'text' | 'image' | 'document' | 'system' | 'template';
  content?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
  attachmentMime?: string;
  replyToId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateConversationInput {
  type: 'direct' | 'group' | 'support';
  title?: string;
  storeId?: string;
  supplierId?: string;
  createdBy: string;
  participants: { userId: string; userType: string; displayName?: string }[];
}

export interface RenderedTemplate {
  name: string;
  body: string;
  category: string;
}

// =============================================================================
// CONVERSATION OPERATIONS
// =============================================================================

/**
 * Get or create a direct conversation between store and supplier.
 * Avoids duplicates by checking existing direct conversations.
 */
export async function getOrCreateDirectConversation(
  pool: Pool,
  storeId: string,
  supplierId: string,
  createdBy: string,
  createdByType: string,
  createdByName: string,
  otherUserId: string,
  otherUserType: string,
  otherUserName: string,
): Promise<Conversation> {
  // Check for existing direct conversation
  const existing = await pool.query(
    `SELECT c.* FROM chat.conversations c
     WHERE c.type = 'direct' AND c.store_id = $1 AND c.supplier_id = $2 AND c.is_active = true
     LIMIT 1`,
    [storeId, supplierId]
  );

  if (existing.rows.length > 0) {
    return mapConversation(existing.rows[0]);
  }

  // Create new conversation + participants in transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const convResult = await client.query(
      `INSERT INTO chat.conversations (type, store_id, supplier_id, created_by)
       VALUES ('direct', $1, $2, $3) RETURNING *`,
      [storeId, supplierId, createdBy]
    );
    const conv = convResult.rows[0];

    // Add both participants
    await client.query(
      `INSERT INTO chat.conversation_participants (conversation_id, user_id, user_type, display_name)
       VALUES ($1, $2, $3, $4), ($1, $5, $6, $7)`,
      [conv.id, createdBy, createdByType, createdByName, otherUserId, otherUserType, otherUserName]
    );

    await client.query('COMMIT');
    return mapConversation(conv);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Create a support conversation for a user.
 */
export async function createSupportConversation(
  pool: Pool,
  userId: string,
  userType: string,
  displayName: string,
  storeId?: string,
): Promise<Conversation> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const convResult = await client.query(
      `INSERT INTO chat.conversations (type, store_id, created_by, title)
       VALUES ('support', $1, $2, $3) RETURNING *`,
      [storeId || null, userId, `Support: ${displayName}`]
    );
    const conv = convResult.rows[0];

    // Add user as participant
    await client.query(
      `INSERT INTO chat.conversation_participants (conversation_id, user_id, user_type, display_name)
       VALUES ($1, $2, $3, $4)`,
      [conv.id, userId, userType, displayName]
    );

    // Send welcome system message
    await client.query(
      `INSERT INTO chat.messages (conversation_id, sender_id, sender_type, message_type, content)
       VALUES ($1, $2, 'system', 'system', 'Welcome to SuperMandi Support! How can we help you today?')`,
      [conv.id, userId]
    );

    // Update last message preview
    await client.query(
      `UPDATE chat.conversations SET last_message_at = NOW(), last_message_preview = 'Welcome to SuperMandi Support! How can we help you today?' WHERE id = $1`,
      [conv.id]
    );

    await client.query('COMMIT');
    return mapConversation(conv);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * List conversations for a user with unread counts.
 */
export async function listConversations(
  pool: Pool,
  userId: string,
  limit = 50,
  offset = 0,
): Promise<{ conversations: ConversationWithParticipant[]; total: number }> {
  const result = await pool.query(
    `SELECT c.*, cp.unread_count, cp.is_muted,
            (SELECT cp2.display_name FROM chat.conversation_participants cp2
             WHERE cp2.conversation_id = c.id AND cp2.user_id != $1 AND cp2.left_at IS NULL
             LIMIT 1) AS other_participant_name
     FROM chat.conversations c
     JOIN chat.conversation_participants cp ON cp.conversation_id = c.id
     WHERE cp.user_id = $1 AND cp.left_at IS NULL AND c.is_active = true
     ORDER BY c.last_message_at DESC NULLS LAST
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM chat.conversations c
     JOIN chat.conversation_participants cp ON cp.conversation_id = c.id
     WHERE cp.user_id = $1 AND cp.left_at IS NULL AND c.is_active = true`,
    [userId]
  );

  return {
    conversations: result.rows.map(row => ({
      ...mapConversation(row),
      unreadCount: parseInt(row.unread_count, 10) || 0,
      isMuted: row.is_muted || false,
      otherParticipantName: row.other_participant_name,
    })),
    total: parseInt(countResult.rows[0].total, 10),
  };
}

/**
 * Get messages for a conversation (paginated, newest first).
 */
export async function getMessages(
  pool: Pool,
  conversationId: string,
  userId: string,
  limit = 50,
  before?: string,
): Promise<Message[]> {
  // Verify user is a participant
  const check = await pool.query(
    `SELECT 1 FROM chat.conversation_participants
     WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [conversationId, userId]
  );
  if (check.rows.length === 0) {
    throw new Error('Not a participant in this conversation');
  }

  const params: (string | number)[] = [conversationId, limit];
  let whereClause = 'WHERE m.conversation_id = $1';

  if (before) {
    whereClause += ' AND m.created_at < $3';
    params.push(before);
  }

  const result = await pool.query(
    `SELECT m.* FROM chat.messages m
     ${whereClause}
     ORDER BY m.created_at DESC
     LIMIT $2`,
    params
  );

  return result.rows.map(mapMessage);
}

/**
 * Send a message to a conversation.
 */
export async function sendMessage(
  pool: Pool,
  input: SendMessageInput,
): Promise<Message> {
  // Verify sender is a participant
  const check = await pool.query(
    `SELECT 1 FROM chat.conversation_participants
     WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [input.conversationId, input.senderId]
  );
  if (check.rows.length === 0) {
    throw new Error('Not a participant in this conversation');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert message
    const msgResult = await client.query(
      `INSERT INTO chat.messages (conversation_id, sender_id, sender_type, message_type, content,
         attachment_url, attachment_name, attachment_size, attachment_mime, reply_to_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        input.conversationId, input.senderId, input.senderType,
        input.messageType || 'text', input.content || null,
        input.attachmentUrl || null, input.attachmentName || null,
        input.attachmentSize || null, input.attachmentMime || null,
        input.replyToId || null, JSON.stringify(input.metadata || {}),
      ]
    );

    // Build preview text
    const preview = input.messageType === 'image' ? '📷 Photo'
      : input.messageType === 'document' ? '📎 Document'
      : (input.content || '').substring(0, 100);

    // Update conversation last message
    await client.query(
      `UPDATE chat.conversations SET last_message_at = NOW(), last_message_preview = $2, updated_at = NOW()
       WHERE id = $1`,
      [input.conversationId, preview]
    );

    // Increment unread count for all OTHER participants
    await client.query(
      `UPDATE chat.conversation_participants
       SET unread_count = unread_count + 1
       WHERE conversation_id = $1 AND user_id != $2 AND left_at IS NULL`,
      [input.conversationId, input.senderId]
    );

    await client.query('COMMIT');
    return mapMessage(msgResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Mark a conversation as read for a user.
 */
export async function markAsRead(
  pool: Pool,
  conversationId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `UPDATE chat.conversation_participants
     SET unread_count = 0, last_read_at = NOW()
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
}

/**
 * Get total unread count across all conversations for a user.
 */
export async function getTotalUnreadCount(
  pool: Pool,
  userId: string,
): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(unread_count), 0) AS total
     FROM chat.conversation_participants
     WHERE user_id = $1 AND left_at IS NULL AND is_muted = false`,
    [userId]
  );
  return parseInt(result.rows[0].total, 10);
}

/**
 * Toggle mute status for a conversation participant.
 */
export async function toggleMute(
  pool: Pool,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE chat.conversation_participants
     SET is_muted = NOT is_muted
     WHERE conversation_id = $1 AND user_id = $2
     RETURNING is_muted`,
    [conversationId, userId]
  );
  if (result.rows.length === 0) throw new Error('Not a participant');
  return result.rows[0].is_muted;
}

/**
 * Get participants who should receive push notifications for a message.
 * Excludes sender and muted participants.
 */
export async function getNotifiableParticipants(
  pool: Pool,
  conversationId: string,
  senderId: string,
): Promise<{ userId: string; userType: string; displayName: string | null }[]> {
  const result = await pool.query(
    `SELECT user_id, user_type, display_name
     FROM chat.conversation_participants
     WHERE conversation_id = $1 AND user_id != $2 AND left_at IS NULL AND is_muted = false`,
    [conversationId, senderId]
  );
  return result.rows.map(r => ({
    userId: r.user_id,
    userType: r.user_type,
    displayName: r.display_name,
  }));
}

// =============================================================================
// T-300: SUPPORT CHANNEL
// =============================================================================

/**
 * List open support conversations (for SuperAdmin support queue).
 */
export async function listSupportConversations(
  pool: Pool,
  status: 'open' | 'resolved' | 'all' = 'open',
  limit = 50,
  offset = 0,
): Promise<{ conversations: Conversation[]; total: number }> {
  let filter = "c.type = 'support'";
  if (status === 'open') filter += " AND c.is_active = true";
  else if (status === 'resolved') filter += " AND c.is_active = false";

  const result = await pool.query(
    `SELECT c.* FROM chat.conversations c
     WHERE ${filter}
     ORDER BY c.last_message_at DESC NULLS LAST
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM chat.conversations c WHERE ${filter}`
  );

  return {
    conversations: result.rows.map(mapConversation),
    total: parseInt(countResult.rows[0].total, 10),
  };
}

/**
 * Assign support agent to a support conversation.
 */
export async function assignSupportAgent(
  pool: Pool,
  conversationId: string,
  agentId: string,
  agentName: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add agent as participant (if not already)
    await client.query(
      `INSERT INTO chat.conversation_participants (conversation_id, user_id, user_type, display_name)
       VALUES ($1, $2, 'support', $3)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL`,
      [conversationId, agentId, agentName]
    );

    // Send system message
    await client.query(
      `INSERT INTO chat.messages (conversation_id, sender_id, sender_type, message_type, content)
       VALUES ($1, $2, 'system', 'system', $3)`,
      [conversationId, agentId, `${agentName} has joined the conversation.`]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resolve a support conversation.
 */
export async function resolveSupportConversation(
  pool: Pool,
  conversationId: string,
  agentId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE chat.conversations SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    await client.query(
      `INSERT INTO chat.messages (conversation_id, sender_id, sender_type, message_type, content)
       VALUES ($1, $2, 'system', 'system', 'This conversation has been resolved. Thank you!')`,
      [conversationId, agentId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// =============================================================================
// T-302: MESSAGE TEMPLATE OPERATIONS
// =============================================================================

/**
 * Render a message template with variables.
 */
export async function renderTemplate(
  pool: Pool,
  templateName: string,
  variables: Record<string, string>,
): Promise<RenderedTemplate | null> {
  const result = await pool.query(
    `SELECT name, category, body_template, variables FROM chat.message_templates
     WHERE name = $1 AND is_active = true`,
    [templateName]
  );

  if (result.rows.length === 0) return null;

  const tmpl = result.rows[0];
  let body = tmpl.body_template as string;

  // Replace {{variable}} placeholders
  for (const [key, value] of Object.entries(variables)) {
    body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return { name: tmpl.name, body, category: tmpl.category };
}

/**
 * Send a template message into a conversation.
 */
export async function sendTemplateMessage(
  pool: Pool,
  conversationId: string,
  templateName: string,
  variables: Record<string, string>,
): Promise<Message | null> {
  const rendered = await renderTemplate(pool, templateName, variables);
  if (!rendered) return null;

  return sendMessage(pool, {
    conversationId,
    senderId: 'system',
    senderType: 'system',
    messageType: 'template',
    content: rendered.body,
    metadata: { templateName, variables, category: rendered.category },
  });
}

/**
 * List all message templates (for admin management).
 */
export async function listTemplates(
  pool: Pool,
): Promise<Array<{
  id: string; name: string; category: string; channel: string;
  language: string; bodyTemplate: string; variables: string[];
  isActive: boolean; whatsappTemplateId: string | null; whatsappStatus: string | null;
}>> {
  const result = await pool.query(
    `SELECT * FROM chat.message_templates ORDER BY category, name`
  );
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    category: row.category,
    channel: row.channel,
    language: row.language,
    bodyTemplate: row.body_template,
    variables: row.variables || [],
    isActive: row.is_active,
    whatsappTemplateId: row.whatsapp_template_id,
    whatsappStatus: row.whatsapp_status,
  }));
}

/**
 * Create or update a message template.
 */
export async function upsertTemplate(
  pool: Pool,
  input: {
    name: string;
    category: string;
    channel: string;
    language?: string;
    bodyTemplate: string;
    variables: string[];
    isActive?: boolean;
  },
): Promise<{ id: string }> {
  const result = await pool.query(
    `INSERT INTO chat.message_templates (name, category, channel, language, body_template, variables, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (name) DO UPDATE SET
       category = EXCLUDED.category, channel = EXCLUDED.channel, language = EXCLUDED.language,
       body_template = EXCLUDED.body_template, variables = EXCLUDED.variables,
       is_active = EXCLUDED.is_active, updated_at = NOW()
     RETURNING id`,
    [input.name, input.category, input.channel, input.language || 'en',
     input.bodyTemplate, input.variables, input.isActive !== false]
  );
  return { id: result.rows[0].id };
}

// =============================================================================
// MAPPERS
// =============================================================================

function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    type: row.type as Conversation['type'],
    title: row.title as string | null,
    storeId: row.store_id as string | null,
    supplierId: row.supplier_id as string | null,
    createdBy: row.created_by as string,
    isActive: row.is_active as boolean,
    lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
    lastMessagePreview: row.last_message_preview as string | null,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    senderId: row.sender_id as string,
    senderType: row.sender_type as string,
    messageType: row.message_type as string,
    content: row.content as string | null,
    attachmentUrl: row.attachment_url as string | null,
    attachmentName: row.attachment_name as string | null,
    attachmentSize: row.attachment_size as number | null,
    attachmentMime: row.attachment_mime as string | null,
    replyToId: row.reply_to_id as string | null,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    isDeleted: row.is_deleted as boolean,
    createdAt: String(row.created_at),
  };
}
