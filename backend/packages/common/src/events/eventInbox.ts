// Event Inbox - V3.0.9 compliant
// Provides consumer-side deduplication using the inbox pattern
//
// The inbox pattern ensures:
// 1. Duplicate events are skipped (at-least-once → exactly-once semantics)
// 2. Failed events are retried up to max retries
// 3. Permanently failed events are moved to dead letter

import { query, queryOne } from '../db/pool';
import type { DomainEvent } from './types';
import type { PoolClient } from 'pg';

// =============================================================================
// TYPES
// =============================================================================

export type InboxStatus = 'pending' | 'processing' | 'processed' | 'failed';

export interface InboxEntry {
  id: string;
  eventId: string;
  eventType: string;
  sourceQueue: string;
  status: InboxStatus;
  retryCount: number;
  payload: DomainEvent;
  errorMessage?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface InboxRow {
  id: string;
  event_id: string;
  event_type: string;
  source_queue: string;
  status: string;
  retry_count: number;
  payload: string;
  error_message: string | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CheckInboxResult {
  shouldProcess: boolean;
  reason: 'new' | 'retry' | 'already_processed' | 'max_retries_exceeded';
  entry?: InboxEntry;
}

// =============================================================================
// INBOX OPERATIONS
// =============================================================================

/**
 * Check if an event should be processed.
 * Returns whether to process and the reason.
 */
export async function checkInbox(
  schema: string,
  eventId: string,
  sourceQueue: string,
  maxRetries: number = 3
): Promise<CheckInboxResult> {
  const row = await queryOne<InboxRow>(
    `SELECT * FROM ${schema}.event_inbox
     WHERE event_id = $1 AND source_queue = $2`,
    [eventId, sourceQueue]
  );

  if (!row) {
    // New event - should process
    return { shouldProcess: true, reason: 'new' };
  }

  const entry = mapInboxRow(row);

  switch (entry.status) {
    case 'processed':
      // Already successfully processed - skip
      return { shouldProcess: false, reason: 'already_processed', entry };

    case 'failed':
      // Check if we can retry
      if (entry.retryCount >= maxRetries) {
        return { shouldProcess: false, reason: 'max_retries_exceeded', entry };
      }
      // Can retry
      return { shouldProcess: true, reason: 'retry', entry };

    case 'processing':
      // Another worker is processing - treat as duplicate
      // The processing worker will either succeed or fail
      return { shouldProcess: false, reason: 'already_processed', entry };

    case 'pending':
      // Shouldn't happen, but treat as new
      return { shouldProcess: true, reason: 'new', entry };

    default:
      return { shouldProcess: true, reason: 'new', entry };
  }
}

/**
 * Record an event in the inbox and mark it as processing.
 * Uses INSERT ON CONFLICT to handle race conditions.
 */
export async function recordInboxEvent(
  client: PoolClient,
  schema: string,
  event: DomainEvent,
  sourceQueue: string
): Promise<InboxEntry> {
  // Try to insert or update to 'processing' status
  const result = await client.query<InboxRow>(
    `INSERT INTO ${schema}.event_inbox (
      event_id, event_type, source_queue, status, retry_count, payload
    ) VALUES ($1, $2, $3, 'processing', 0, $4)
    ON CONFLICT (event_id, source_queue) DO UPDATE
    SET status = CASE
      WHEN ${schema}.event_inbox.status = 'failed' THEN 'processing'
      ELSE ${schema}.event_inbox.status
    END,
    retry_count = CASE
      WHEN ${schema}.event_inbox.status = 'failed' THEN ${schema}.event_inbox.retry_count + 1
      ELSE ${schema}.event_inbox.retry_count
    END,
    updated_at = NOW()
    RETURNING *`,
    [event.eventId, event.eventType, sourceQueue, JSON.stringify(event)]
  );

  return mapInboxRow(result.rows[0]!);
}

/**
 * Mark an inbox event as successfully processed
 */
export async function markInboxProcessed(
  client: PoolClient,
  schema: string,
  eventId: string,
  sourceQueue: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.event_inbox
     SET status = 'processed', processed_at = NOW(), updated_at = NOW()
     WHERE event_id = $1 AND source_queue = $2`,
    [eventId, sourceQueue]
  );
}

/**
 * Mark an inbox event as failed
 */
export async function markInboxFailed(
  client: PoolClient,
  schema: string,
  eventId: string,
  sourceQueue: string,
  errorMessage: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.event_inbox
     SET status = 'failed', error_message = $3, updated_at = NOW()
     WHERE event_id = $1 AND source_queue = $2`,
    [eventId, sourceQueue, errorMessage]
  );
}

/**
 * Get an inbox entry by event ID
 */
export async function getInboxEntry(
  schema: string,
  eventId: string,
  sourceQueue: string
): Promise<InboxEntry | null> {
  const row = await queryOne<InboxRow>(
    `SELECT * FROM ${schema}.event_inbox
     WHERE event_id = $1 AND source_queue = $2`,
    [eventId, sourceQueue]
  );

  return row ? mapInboxRow(row) : null;
}

/**
 * Get failed inbox entries for retry or manual review
 */
export async function getFailedInboxEntries(
  schema: string,
  options: {
    sourceQueue?: string;
    limit?: number;
    offset?: number;
    maxRetries?: number;
  } = {}
): Promise<{ entries: InboxEntry[]; total: number }> {
  const { sourceQueue, limit = 50, offset = 0, maxRetries = 3 } = options;

  const whereClauses: string[] = ['status = $1'];
  const params: unknown[] = ['failed'];
  let paramIndex = 2;

  if (sourceQueue) {
    whereClauses.push(`source_queue = $${paramIndex++}`);
    params.push(sourceQueue);
  }

  // Only get entries that can still be retried
  whereClauses.push(`retry_count < $${paramIndex++}`);
  params.push(maxRetries);

  const whereClause = whereClauses.join(' AND ');

  // Count
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM ${schema}.event_inbox WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRow?.count ?? '0', 10);

  // Fetch
  const rows = await query<InboxRow>(
    `SELECT * FROM ${schema}.event_inbox
     WHERE ${whereClause}
     ORDER BY updated_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  return {
    entries: rows.map(mapInboxRow),
    total,
  };
}

/**
 * Clean up old processed inbox entries
 */
export async function cleanupProcessedInbox(
  schema: string,
  olderThanDays: number = 7
): Promise<number> {
  const result = await query<{ id: string }>(
    `DELETE FROM ${schema}.event_inbox
     WHERE status = 'processed'
       AND processed_at < NOW() - INTERVAL '${olderThanDays} days'
     RETURNING id`
  );

  return result.length;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function mapInboxRow(row: InboxRow): InboxEntry {
  return {
    id: row.id,
    eventId: row.event_id,
    eventType: row.event_type,
    sourceQueue: row.source_queue,
    status: row.status as InboxStatus,
    retryCount: row.retry_count,
    payload: JSON.parse(row.payload) as DomainEvent,
    errorMessage: row.error_message ?? undefined,
    processedAt: row.processed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// EVENT INBOX TABLE CREATION (for reference)
// =============================================================================

/**
 * SQL to create event_inbox table in each service schema.
 * This should be part of the migration, not executed at runtime.
 *
 * CREATE TABLE {schema}.event_inbox (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   event_id UUID NOT NULL,
 *   event_type TEXT NOT NULL,
 *   source_queue TEXT NOT NULL,
 *   status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
 *   retry_count INTEGER NOT NULL DEFAULT 0,
 *   payload JSONB NOT NULL,
 *   error_message TEXT,
 *   processed_at TIMESTAMPTZ,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   UNIQUE(event_id, source_queue)
 * );
 *
 * CREATE INDEX idx_event_inbox_failed ON {schema}.event_inbox(updated_at)
 *   WHERE status = 'failed';
 * CREATE INDEX idx_event_inbox_pending ON {schema}.event_inbox(created_at)
 *   WHERE status = 'pending';
 */
