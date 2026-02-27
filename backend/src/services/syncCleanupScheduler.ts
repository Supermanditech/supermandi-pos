/**
 * GO-LIVE Batch 7: Sync Cleanup Scheduler
 *
 * Runs periodic cleanup of sync-related tables to prevent unbounded growth.
 * Critical for production with 10,000+ users.
 *
 * Cleanup functions:
 * - cleanup_stale_sync_locks(): Every 5 minutes (locks older than 5 min)
 * - cleanup_old_processed_events(): Every hour (events older than 90 days)
 * - cleanup_old_failed_sync_events(): Every hour (events older than 30 days)
 */

import { getPool } from "../db/client";
import { log } from "../lib/logger";
import { asError } from "../lib/errorUtils";

// =============================================================================
// CONFIGURATION
// =============================================================================

const SYNC_LOCKS_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;        // 5 minutes
const PROCESSED_EVENTS_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const FAILED_EVENTS_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;    // 1 hour
// IDEMPOTENCY-CLEANUP-NOT-SCHEDULED: GL-CRIT-0029 requires daily cleanup of expired idempotency keys
const IDEMPOTENCY_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
// STBT-177: Statement timeout to prevent cleanup queries from hanging DB connections
const CLEANUP_QUERY_TIMEOUT_MS = 30_000; // 30 seconds max per cleanup query

// Track cleanup stats
interface CleanupStats {
  lastRun: Date | null;
  rowsCleaned: number;
  errors: number;
}

const stats: Record<string, CleanupStats> = {
  sync_locks: { lastRun: null, rowsCleaned: 0, errors: 0 },
  processed_events: { lastRun: null, rowsCleaned: 0, errors: 0 },
  failed_events: { lastRun: null, rowsCleaned: 0, errors: 0 },
  idempotency_keys: { lastRun: null, rowsCleaned: 0, errors: 0 },
};

let intervalIds: NodeJS.Timeout[] = [];

// =============================================================================
// CLEANUP FUNCTIONS
// =============================================================================

/**
 * Clean up stale sync locks (older than 5 minutes)
 * Prevents orphaned locks from blocking new sync operations
 */
async function cleanupStaleSyncLocks(attempt = 1): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  // STBT-177: Use a dedicated client with statement_timeout to prevent hangs
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${CLEANUP_QUERY_TIMEOUT_MS}`);
    const result = await client.query(
      "SELECT cleanup_stale_sync_locks() AS count"
    );
    const count = result.rows[0]?.count ?? 0;

    stats.sync_locks.lastRun = new Date();
    stats.sync_locks.rowsCleaned += count;

    if (count > 0) {
      log.info(`[SyncCleanup] Cleaned ${count} stale sync locks`);
    }

    return count;
  } catch (_error: unknown) {
    const error = asError(_error);
    stats.sync_locks.errors++;
    // REQ.AUDIT.W5.BACKEND.SYNC-CLEANUP-NO-RECOVERY.001: retry with backoff to prevent stale lock accumulation
    if (attempt < 3) {
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      log.warn(`[SyncCleanup] Retry ${attempt}/2 in ${delayMs}ms: ${error?.message}`);
      await new Promise(r => setTimeout(r, delayMs));
      return cleanupStaleSyncLocks(attempt + 1);
    }
    log.error("[SyncCleanup] Error cleaning sync locks after retries:", error?.message);
    return 0;
  } finally {
    client.release();
  }
}

/**
 * Clean up old processed sync events (older than 90 days)
 * Maintains idempotency tracking without unbounded growth
 */
async function cleanupOldProcessedEvents(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${CLEANUP_QUERY_TIMEOUT_MS}`);
    const result = await client.query(
      "SELECT cleanup_old_processed_events() AS count"
    );
    const count = result.rows[0]?.count ?? 0;

    stats.processed_events.lastRun = new Date();
    stats.processed_events.rowsCleaned += count;

    if (count > 0) {
      log.info(`[SyncCleanup] Cleaned ${count} old processed events`);
    }

    return count;
  } catch (_error: unknown) {
    const error = asError(_error);
    stats.processed_events.errors++;
    log.error("[SyncCleanup] Error cleaning processed events:", error?.message);
    return 0;
  } finally {
    client.release();
  }
}

/**
 * Clean up old failed sync events (older than 30 days)
 * Keeps dead letter queue manageable
 */
async function cleanupOldFailedEvents(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${CLEANUP_QUERY_TIMEOUT_MS}`);
    const result = await client.query(
      "SELECT cleanup_old_failed_sync_events() AS count"
    );
    const count = result.rows[0]?.count ?? 0;

    stats.failed_events.lastRun = new Date();
    stats.failed_events.rowsCleaned += count;

    if (count > 0) {
      log.info(`[SyncCleanup] Cleaned ${count} old failed events`);
    }

    return count;
  } catch (_error: unknown) {
    const error = asError(_error);
    stats.failed_events.errors++;
    log.error("[SyncCleanup] Error cleaning failed events:", error?.message);
    return 0;
  } finally {
    client.release();
  }
}

/**
 * IDEMPOTENCY-CLEANUP-NOT-SCHEDULED: Clean up expired idempotency keys (older than 24h)
 * GL-CRIT-0029: Prevents api_idempotency_keys table from growing unboundedly.
 * pg_cron may not be available; this application-level scheduler is the fallback.
 */
async function cleanupExpiredIdempotencyKeys(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${CLEANUP_QUERY_TIMEOUT_MS}`);
    const result = await client.query(
      "SELECT public.cleanup_expired_idempotency_keys() AS count"
    );
    const count = result.rows[0]?.count ?? 0;

    stats.idempotency_keys.lastRun = new Date();
    stats.idempotency_keys.rowsCleaned += count;

    if (count > 0) {
      log.info(`[SyncCleanup] Cleaned ${count} expired idempotency keys`);
    }

    return count;
  } catch (_error: unknown) {
    const error = asError(_error);
    stats.idempotency_keys.errors++;
    log.error("[SyncCleanup] Error cleaning idempotency keys:", error?.message);
    return 0;
  } finally {
    client.release();
  }
}

// =============================================================================
// SCHEDULER
// =============================================================================

/**
 * Start the cleanup scheduler
 * Call this from app startup
 */
export function startSyncCleanupScheduler(): void {
  // Clear any existing intervals (for hot reload)
  stopSyncCleanupScheduler();

  log.info("[SyncCleanup] Starting cleanup scheduler...");
  log.info(`  - Sync locks: every ${SYNC_LOCKS_CLEANUP_INTERVAL_MS / 1000}s`);
  log.info(`  - Processed events: every ${PROCESSED_EVENTS_CLEANUP_INTERVAL_MS / 60000}min`);
  log.info(`  - Failed events: every ${FAILED_EVENTS_CLEANUP_INTERVAL_MS / 60000}min`);
  log.info(`  - Idempotency keys: every ${IDEMPOTENCY_CLEANUP_INTERVAL_MS / 3600000}h`);

  // Run initial cleanup after 30 seconds (let DB connections settle)
  setTimeout(() => {
    cleanupStaleSyncLocks();
    cleanupOldProcessedEvents();
    cleanupOldFailedEvents();
    cleanupExpiredIdempotencyKeys();
  }, 30000);

  // Schedule periodic cleanups
  intervalIds.push(
    setInterval(cleanupStaleSyncLocks, SYNC_LOCKS_CLEANUP_INTERVAL_MS)
  );
  intervalIds.push(
    setInterval(cleanupOldProcessedEvents, PROCESSED_EVENTS_CLEANUP_INTERVAL_MS)
  );
  intervalIds.push(
    setInterval(cleanupOldFailedEvents, FAILED_EVENTS_CLEANUP_INTERVAL_MS)
  );
  intervalIds.push(
    setInterval(cleanupExpiredIdempotencyKeys, IDEMPOTENCY_CLEANUP_INTERVAL_MS)
  );
}

/**
 * Stop the cleanup scheduler
 * Call this on graceful shutdown
 */
export function stopSyncCleanupScheduler(): void {
  for (const id of intervalIds) {
    clearInterval(id);
  }
  intervalIds = [];
}

/**
 * Get cleanup statistics
 * Useful for monitoring/health checks
 */
export function getSyncCleanupStats(): Record<string, CleanupStats> {
  return { ...stats };
}

/**
 * Run all cleanups immediately
 * Useful for manual maintenance
 */
export async function runAllCleanups(): Promise<Record<string, number>> {
  const [locks, processed, failed, idempotency] = await Promise.all([
    cleanupStaleSyncLocks(),
    cleanupOldProcessedEvents(),
    cleanupOldFailedEvents(),
    cleanupExpiredIdempotencyKeys(),
  ]);

  return {
    sync_locks: locks,
    processed_events: processed,
    failed_events: failed,
    idempotency_keys: idempotency,
  };
}
