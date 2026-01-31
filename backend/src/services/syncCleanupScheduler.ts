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

// =============================================================================
// CONFIGURATION
// =============================================================================

const SYNC_LOCKS_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;        // 5 minutes
const PROCESSED_EVENTS_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const FAILED_EVENTS_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;    // 1 hour

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
};

let intervalIds: NodeJS.Timeout[] = [];

// =============================================================================
// CLEANUP FUNCTIONS
// =============================================================================

/**
 * Clean up stale sync locks (older than 5 minutes)
 * Prevents orphaned locks from blocking new sync operations
 */
async function cleanupStaleSyncLocks(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  try {
    const result = await pool.query(
      "SELECT cleanup_stale_sync_locks() AS count"
    );
    const count = result.rows[0]?.count ?? 0;

    stats.sync_locks.lastRun = new Date();
    stats.sync_locks.rowsCleaned += count;

    if (count > 0) {
      console.log(`[SyncCleanup] Cleaned ${count} stale sync locks`);
    }

    return count;
  } catch (error: any) {
    stats.sync_locks.errors++;
    console.error("[SyncCleanup] Error cleaning sync locks:", error?.message);
    return 0;
  }
}

/**
 * Clean up old processed sync events (older than 90 days)
 * Maintains idempotency tracking without unbounded growth
 */
async function cleanupOldProcessedEvents(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  try {
    const result = await pool.query(
      "SELECT cleanup_old_processed_events() AS count"
    );
    const count = result.rows[0]?.count ?? 0;

    stats.processed_events.lastRun = new Date();
    stats.processed_events.rowsCleaned += count;

    if (count > 0) {
      console.log(`[SyncCleanup] Cleaned ${count} old processed events`);
    }

    return count;
  } catch (error: any) {
    stats.processed_events.errors++;
    console.error("[SyncCleanup] Error cleaning processed events:", error?.message);
    return 0;
  }
}

/**
 * Clean up old failed sync events (older than 30 days)
 * Keeps dead letter queue manageable
 */
async function cleanupOldFailedEvents(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  try {
    const result = await pool.query(
      "SELECT cleanup_old_failed_sync_events() AS count"
    );
    const count = result.rows[0]?.count ?? 0;

    stats.failed_events.lastRun = new Date();
    stats.failed_events.rowsCleaned += count;

    if (count > 0) {
      console.log(`[SyncCleanup] Cleaned ${count} old failed events`);
    }

    return count;
  } catch (error: any) {
    stats.failed_events.errors++;
    console.error("[SyncCleanup] Error cleaning failed events:", error?.message);
    return 0;
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

  console.log("[SyncCleanup] Starting cleanup scheduler...");
  console.log(`  - Sync locks: every ${SYNC_LOCKS_CLEANUP_INTERVAL_MS / 1000}s`);
  console.log(`  - Processed events: every ${PROCESSED_EVENTS_CLEANUP_INTERVAL_MS / 60000}min`);
  console.log(`  - Failed events: every ${FAILED_EVENTS_CLEANUP_INTERVAL_MS / 60000}min`);

  // Run initial cleanup after 30 seconds (let DB connections settle)
  setTimeout(() => {
    cleanupStaleSyncLocks();
    cleanupOldProcessedEvents();
    cleanupOldFailedEvents();
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
  const [locks, processed, failed] = await Promise.all([
    cleanupStaleSyncLocks(),
    cleanupOldProcessedEvents(),
    cleanupOldFailedEvents(),
  ]);

  return {
    sync_locks: locks,
    processed_events: processed,
    failed_events: failed,
  };
}
