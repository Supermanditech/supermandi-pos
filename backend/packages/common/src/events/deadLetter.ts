// Dead Letter Queue Management - V3.0.9 compliant
// Handles permanently failed events after max retries

import { query, queryOne } from '../db/pool';
import type { DomainEvent } from './types';

// SEC-001: Schema allowlist to prevent SQL injection via schema interpolation
const ALLOWED_SCHEMAS = new Set([
  'public', 'catalog', 'inventory', 'pos', 'supplier', 'platform', 'auth', 'reorder', 'analytics',
]);

function validateSchema(schema: string): string {
  if (!ALLOWED_SCHEMAS.has(schema) && !/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid schema name: ${schema}`);
  }
  return schema;
}

// =============================================================================
// TYPES
// =============================================================================

export interface DeadLetterEntry {
  id: string;
  schema: string;
  eventId: string;
  eventType: string;
  targetQueue: string;
  payload: DomainEvent;
  errorMessage: string;
  errorStack?: string;
  attemptCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: 'reprocessed' | 'discarded' | 'manual';
}

interface DeadLetterRow {
  id: string;
  schema_name: string;
  event_id: string;
  event_type: string;
  target_queue: string;
  payload: string;
  error_message: string;
  error_stack: string | null;
  attempt_count: number;
  first_failed_at: Date;
  last_failed_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
  resolution: string | null;
}

// =============================================================================
// DEAD LETTER OPERATIONS
// =============================================================================

/**
 * Add a failed event to the dead letter queue.
 * This is called when an event fails all retry attempts.
 */
export async function addToDeadLetter(
  schema: string,
  event: DomainEvent,
  targetQueue: string,
  error: Error,
  attemptCount: number
): Promise<string> {
  const s = validateSchema(schema);
  // Check if this event is already in the dead letter queue
  const existing = await queryOne<{ id: string; attempt_count: number }>(
    `SELECT id, attempt_count FROM ${s}.dead_letter_events
     WHERE event_id = $1 AND target_queue = $2 AND resolved_at IS NULL`,
    [event.eventId, targetQueue]
  );

  if (existing) {
    // Update existing entry
    await query(
      `UPDATE ${s}.dead_letter_events
       SET error_message = $1,
           error_stack = $2,
           attempt_count = $3,
           last_failed_at = NOW()
       WHERE id = $4`,
      [error.message, error.stack, attemptCount, existing.id]
    );
    return existing.id;
  }

  // Insert new entry
  const result = await queryOne<{ id: string }>(
    `INSERT INTO ${s}.dead_letter_events (
      event_id, event_type, target_queue, payload,
      error_message, error_stack, attempt_count,
      first_failed_at, last_failed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    RETURNING id`,
    [
      event.eventId,
      event.eventType,
      targetQueue,
      JSON.stringify(event),
      error.message,
      error.stack,
      attemptCount,
    ]
  );

  console.log(
    `[DeadLetter] Added event ${event.eventId} (${event.eventType}) to dead letter queue for ${targetQueue}`
  );

  return result!.id;
}

/**
 * Get unresolved dead letter entries
 */
export async function getUnresolvedDeadLetters(
  schema: string,
  options: {
    limit?: number;
    offset?: number;
    eventType?: string;
    targetQueue?: string;
  } = {}
): Promise<{ entries: DeadLetterEntry[]; total: number }> {
  const s = validateSchema(schema);
  const { limit = 50, offset = 0, eventType, targetQueue } = options;

  const whereClauses: string[] = ['resolved_at IS NULL'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (eventType) {
    whereClauses.push(`event_type = $${paramIndex++}`);
    params.push(eventType);
  }

  if (targetQueue) {
    whereClauses.push(`target_queue = $${paramIndex++}`);
    params.push(targetQueue);
  }

  const whereClause = whereClauses.join(' AND ');

  // Count
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM ${s}.dead_letter_events WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRow?.count ?? '0', 10);

  // Fetch entries
  const rows = await query<DeadLetterRow>(
    `SELECT * FROM ${s}.dead_letter_events
     WHERE ${whereClause}
     ORDER BY last_failed_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  const entries = rows.map(mapDeadLetterRow);

  return { entries, total };
}

/**
 * Mark a dead letter entry as resolved
 */
export async function resolveDeadLetter(
  schema: string,
  deadLetterId: string,
  resolution: 'reprocessed' | 'discarded' | 'manual',
  resolvedBy?: string
): Promise<void> {
  const s = validateSchema(schema);
  await query(
    `UPDATE ${s}.dead_letter_events
     SET resolved_at = NOW(),
         resolved_by = $2,
         resolution = $3
     WHERE id = $1`,
    [deadLetterId, resolvedBy, resolution]
  );

  console.log(
    `[DeadLetter] Resolved entry ${deadLetterId} with resolution: ${resolution}`
  );
}

/**
 * Get a specific dead letter entry by ID
 */
export async function getDeadLetterById(
  schema: string,
  deadLetterId: string
): Promise<DeadLetterEntry | null> {
  const s = validateSchema(schema);
  const row = await queryOne<DeadLetterRow>(
    `SELECT * FROM ${s}.dead_letter_events WHERE id = $1`,
    [deadLetterId]
  );

  return row ? mapDeadLetterRow(row) : null;
}

/**
 * Requeue a dead letter entry for reprocessing
 */
export async function requeueDeadLetter(
  schema: string,
  deadLetterId: string,
  resolvedBy?: string
): Promise<DomainEvent | null> {
  const entry = await getDeadLetterById(schema, deadLetterId);

  if (!entry) {
    return null;
  }

  // Mark as resolved (will be reprocessed)
  await resolveDeadLetter(schema, deadLetterId, 'reprocessed', resolvedBy);

  return entry.payload;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function mapDeadLetterRow(row: DeadLetterRow): DeadLetterEntry {
  return {
    id: row.id,
    schema: row.schema_name,
    eventId: row.event_id,
    eventType: row.event_type,
    targetQueue: row.target_queue,
    payload: JSON.parse(row.payload) as DomainEvent,
    errorMessage: row.error_message,
    errorStack: row.error_stack ?? undefined,
    attemptCount: row.attempt_count,
    firstFailedAt: row.first_failed_at,
    lastFailedAt: row.last_failed_at,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    resolution: row.resolution as DeadLetterEntry['resolution'] ?? undefined,
  };
}

// =============================================================================
// DEAD LETTER TABLE CREATION (for reference)
// =============================================================================

/**
 * SQL to create dead_letter_events table in each service schema.
 * This should be part of the migration, not executed at runtime.
 *
 * CREATE TABLE {schema}.dead_letter_events (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   event_id UUID NOT NULL,
 *   event_type TEXT NOT NULL,
 *   target_queue TEXT NOT NULL,
 *   payload JSONB NOT NULL,
 *   error_message TEXT NOT NULL,
 *   error_stack TEXT,
 *   attempt_count INTEGER NOT NULL DEFAULT 1,
 *   first_failed_at TIMESTAMPTZ NOT NULL,
 *   last_failed_at TIMESTAMPTZ NOT NULL,
 *   resolved_at TIMESTAMPTZ,
 *   resolved_by UUID,
 *   resolution TEXT CHECK (resolution IN ('reprocessed', 'discarded', 'manual')),
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   UNIQUE(event_id, target_queue)
 * );
 *
 * CREATE INDEX idx_dead_letter_unresolved ON {schema}.dead_letter_events(last_failed_at)
 *   WHERE resolved_at IS NULL;
 */
