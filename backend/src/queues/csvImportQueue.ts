// SCALE-D3: Async CSV import queue using BullMQ
// Replaces setImmediate in-process execution with a durable BullMQ queue
// so large imports survive process restarts and progress is tracked in Redis.
//
// BullMQ connection requirements:
//   - Needs its own ioredis instance (NOT the shared one from db/redis.ts)
//   - maxRetriesPerRequest must be null (BullMQ requirement)
//   - enableReadyCheck must be false (BullMQ requirement)

import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
import { log } from '../lib/logger';

// =============================================================================
// QUEUE NAME
// =============================================================================

export const CSV_IMPORT_QUEUE_NAME = 'csv-import';

// =============================================================================
// JOB DATA TYPES
// =============================================================================

export interface CsvImportJobData {
  jobId: string;          // platform.csv_imports.id (UUID)
  storeId: string;        // store UUID (from JWT — never trust client)
  validRows: any[];       // pre-validated preview rows from validate step
}

export interface CsvImportJobResult {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
}

// =============================================================================
// BULLMQ-COMPATIBLE REDIS CONNECTION FACTORY
// =============================================================================
// BullMQ requires a dedicated ioredis connection with:
//   maxRetriesPerRequest: null  (blocks indefinitely instead of failing fast)
//   enableReadyCheck: false     (BullMQ manages its own readiness)
// We create a new connection using the same env vars as db/redis.ts.

function buildBullMqConnection(): ConnectionOptions {
  const sentinelHosts = process.env.REDIS_SENTINELS || '';
  const sentinels = sentinelHosts
    .split(',')
    .filter(Boolean)
    .map((hostPort) => {
      const [host, port] = hostPort.split(':');
      return { host: host.trim(), port: parseInt(port?.trim() || '26379', 10) };
    });

  const sentinelEnabled = process.env.REDIS_SENTINEL_ENABLED === 'true';

  if (sentinelEnabled && sentinels.length > 0) {
    // Sentinel mode — same master name as db/redis.ts
    return {
      sentinels,
      name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    } as any;
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

// =============================================================================
// QUEUE SINGLETON
// =============================================================================

let _queue: Queue<CsvImportJobData, CsvImportJobResult> | null = null;

export function getCsvImportQueue(): Queue<CsvImportJobData, CsvImportJobResult> | null {
  if (process.env.REDIS_ENABLED === 'false') {
    return null;
  }
  if (!_queue) {
    try {
      _queue = new Queue<CsvImportJobData, CsvImportJobResult>(CSV_IMPORT_QUEUE_NAME, {
        connection: buildBullMqConnection() as Redis,
        defaultJobOptions: {
          // Keep completed/failed jobs for 24 h so the status endpoint can report them
          removeOnComplete: { age: 60 * 60 * 24 },
          removeOnFail: { age: 60 * 60 * 24 },
          attempts: 1, // CSV commit is not idempotent by default — don't auto-retry
        },
      });
      log.info('[SCALE-D3] csvImportQueue created');
    } catch (err: any) {
      log.error('[SCALE-D3] Failed to create csvImportQueue:', err.message);
      return null;
    }
  }
  return _queue;
}

// =============================================================================
// WORKER FACTORY
// =============================================================================
// Called once at startup from app.ts.  The worker processes batches of
// BATCH_SIZE rows per chunk and reports progress after each batch.

const BATCH_SIZE = 100; // SCALE-D3: process 100 rows per batch

export function startCsvImportWorker(
  processCommitFn: (jobId: string, storeId: string, validRows: any[]) => Promise<{
    created: number;
    updated: number;
    skipped: number;
  }>
): Worker<CsvImportJobData, CsvImportJobResult> | null {
  if (process.env.REDIS_ENABLED === 'false') {
    log.info('[SCALE-D3] Redis disabled — skipping csvImportWorker startup');
    return null;
  }

  try {
    const worker = new Worker<CsvImportJobData, CsvImportJobResult>(
      CSV_IMPORT_QUEUE_NAME,
      async (job: Job<CsvImportJobData, CsvImportJobResult>) => {
        const { jobId, storeId, validRows } = job.data;
        const total = validRows.length;

        log.info(`[SCALE-D3] Worker starting job ${jobId}: ${total} rows`);
        await job.updateProgress(0);

        let processedCount = 0;
        let created = 0;
        let updated = 0;
        let skipped = 0;

        const batches = Math.ceil(total / BATCH_SIZE);
        for (let b = 0; b < batches; b++) {
          const batchRows = validRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

          try {
            const result = await processCommitFn(jobId, storeId, batchRows);
            created += result.created;
            updated += result.updated;
            skipped += result.skipped;
          } catch (err: any) {
            log.error(`[SCALE-D3] Batch ${b + 1}/${batches} failed for job ${jobId}:`, err.message);
            skipped += batchRows.length;
          }

          processedCount += batchRows.length;
          const pct = Math.round((processedCount / total) * 100);
          await job.updateProgress(pct);
        }

        log.info(`[SCALE-D3] Job ${jobId} complete: created=${created} updated=${updated} skipped=${skipped}`);
        return { processed: processedCount, created, updated, skipped };
      },
      {
        connection: buildBullMqConnection() as Redis,
        concurrency: 2, // max 2 imports running simultaneously
      }
    );

    worker.on('completed', (job) => {
      log.info(`[SCALE-D3] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      log.error(`[SCALE-D3] Job ${job?.id} failed:`, err.message);
    });

    worker.on('error', (err) => {
      log.error('[SCALE-D3] Worker error:', err.message);
    });

    log.info('[SCALE-D3] csvImportWorker started (concurrency=2, batchSize=100)');
    return worker;
  } catch (err: any) {
    log.error('[SCALE-D3] Failed to start csvImportWorker:', err.message);
    return null;
  }
}

// =============================================================================
// QUEUE STATUS HELPER
// =============================================================================

export type CsvImportStatus =
  | 'queued'
  | 'active'
  | 'completed'
  | 'failed'
  | 'unknown';

export async function getJobStatus(bullJobId: string): Promise<{
  status: CsvImportStatus;
  progress: number;
  result: CsvImportJobResult | null;
  error: string | null;
}> {
  const queue = getCsvImportQueue();
  if (!queue) {
    return { status: 'unknown', progress: 0, result: null, error: 'Queue unavailable' };
  }

  try {
    const job = await queue.getJob(bullJobId);
    if (!job) {
      return { status: 'unknown', progress: 0, result: null, error: 'Job not found in queue' };
    }

    const state = await job.getState();
    const progress = typeof job.progress === 'number' ? job.progress : 0;

    const statusMap: Record<string, CsvImportStatus> = {
      waiting: 'queued',
      delayed: 'queued',
      active: 'active',
      completed: 'completed',
      failed: 'failed',
      prioritized: 'queued',
      unknown: 'unknown',
    };

    return {
      status: statusMap[state] ?? 'unknown',
      progress,
      result: state === 'completed' ? (job.returnvalue ?? null) : null,
      error: state === 'failed' ? (job.failedReason ?? 'Job failed') : null,
    };
  } catch (err: any) {
    log.error('[SCALE-D3] getJobStatus error:', err.message);
    return { status: 'unknown', progress: 0, result: null, error: err.message };
  }
}

// =============================================================================
// BATCH SIZE EXPORT (for tests)
// =============================================================================
export const CSV_IMPORT_BATCH_SIZE = BATCH_SIZE;
