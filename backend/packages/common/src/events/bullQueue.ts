// Bull Queue Management - V3.0.9 compliant
// Manages Bull queues for event fanout pattern

import { Queue, Worker, Job, QueueOptions, WorkerOptions } from 'bullmq';
import type { DomainEvent } from './types';

// =============================================================================
// TYPES
// =============================================================================

export interface BullQueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  defaultJobOptions?: {
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  };
}

export interface QueueManager {
  getQueue(name: string): Queue;
  createWorker<T = unknown>(
    queueName: string,
    processor: (job: Job<T>) => Promise<void>,
    options?: Partial<WorkerOptions>
  ): Worker;
  close(): Promise<void>;
}

// =============================================================================
// QUEUE MANAGER
// =============================================================================

let queueManager: QueueManagerImpl | null = null;

class QueueManagerImpl implements QueueManager {
  private queues: Map<string, Queue> = new Map();
  private workers: Worker[] = [];
  private config: BullQueueConfig;
  private connection: { host: string; port: number; password?: string; db?: number };

  constructor(config: BullQueueConfig) {
    this.config = config;
    this.connection = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    };
  }

  /**
   * Get or create a queue by name
   */
  getQueue(name: string): Queue {
    let queue = this.queues.get(name);
    if (queue) {
      return queue;
    }

    const options: QueueOptions = {
      connection: this.connection,
      defaultJobOptions: {
        attempts: this.config.defaultJobOptions?.attempts ?? 3,
        backoff: this.config.defaultJobOptions?.backoff ?? {
          type: 'exponential',
          delay: 1000, // 1s, 2s, 4s
        },
        removeOnComplete: this.config.defaultJobOptions?.removeOnComplete ?? 100,
        removeOnFail: this.config.defaultJobOptions?.removeOnFail ?? 500,
      },
    };

    queue = new Queue(name, options);
    this.queues.set(name, queue);

    console.log(`[BullQueue] Created queue: ${name}`);
    return queue;
  }

  /**
   * Create a worker for a queue
   */
  createWorker<T = unknown>(
    queueName: string,
    processor: (job: Job<T>) => Promise<void>,
    options?: Partial<WorkerOptions>
  ): Worker {
    const workerOptions: WorkerOptions = {
      connection: this.connection,
      concurrency: options?.concurrency ?? 1,
      ...options,
    };

    const worker = new Worker<T>(
      queueName,
      async (job) => {
        console.log(`[BullQueue] Processing job ${job.id} from ${queueName}`);
        try {
          await processor(job);
          console.log(`[BullQueue] Completed job ${job.id} from ${queueName}`);
        } catch (error) {
          console.error(`[BullQueue] Failed job ${job.id} from ${queueName}:`, error);
          throw error;
        }
      },
      workerOptions
    );

    worker.on('failed', (job, error) => {
      console.error(`[BullQueue] Job ${job?.id} failed in ${queueName}:`, error.message);
    });

    worker.on('error', (error) => {
      console.error(`[BullQueue] Worker error in ${queueName}:`, error.message);
    });

    this.workers.push(worker);
    console.log(`[BullQueue] Created worker for queue: ${queueName}`);

    return worker;
  }

  /**
   * Close all queues and workers
   */
  async close(): Promise<void> {
    console.log('[BullQueue] Closing all queues and workers...');

    // Close workers first
    await Promise.all(this.workers.map((w) => w.close()));

    // Then close queues
    await Promise.all(
      Array.from(this.queues.values()).map((q) => q.close())
    );

    this.workers = [];
    this.queues.clear();
    console.log('[BullQueue] All queues and workers closed');
  }
}

/**
 * Initialize the queue manager
 */
export function initQueueManager(config: BullQueueConfig): QueueManager {
  if (queueManager) {
    return queueManager;
  }

  queueManager = new QueueManagerImpl(config);
  return queueManager;
}

/**
 * Get the queue manager (must be initialized first)
 */
export function getQueueManager(): QueueManager {
  if (!queueManager) {
    throw new Error('QueueManager not initialized. Call initQueueManager() first.');
  }
  return queueManager;
}

/**
 * Close the queue manager
 */
export async function closeQueueManager(): Promise<void> {
  if (queueManager) {
    await queueManager.close();
    queueManager = null;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Add event to a queue with correlation ID propagation
 */
export async function enqueueEvent(
  queue: Queue,
  event: DomainEvent,
  jobId?: string
): Promise<Job<DomainEvent>> {
  return queue.add(event.eventType, event, {
    jobId: jobId ?? `${event.eventType}:${event.eventId}`,
    // Preserve correlation ID in job data
  });
}
