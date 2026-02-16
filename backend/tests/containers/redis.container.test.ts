// TEST-002: Redis + BullMQ Integration Tests
// Tests run against a real Redis 7 container via testcontainers.
// Validates: cache ops, rate limiting, token blacklist, BullMQ queue/worker.

import Redis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import { getRedisState } from './redisSetup';

let redis: Redis;
let redisHost: string;
let redisPort: number;

beforeAll(async () => {
  const state = getRedisState();
  if (!state) {
    // Fallback to env vars (set by globalSetup)
    redisHost = process.env.REDIS_HOST || '127.0.0.1';
    redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  } else {
    redisHost = state.host;
    redisPort = state.port;
  }

  redis = new Redis({
    host: redisHost,
    port: redisPort,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  await redis.connect();
});

afterAll(async () => {
  await redis.quit();
});

afterEach(async () => {
  await redis.flushdb();
});

// =============================================================================
// CACHE OPERATIONS
// =============================================================================
describe('Cache Operations', () => {
  test('SET and GET a string value', async () => {
    await redis.set('test:key1', 'hello');
    const result = await redis.get('test:key1');
    expect(result).toBe('hello');
  });

  test('SET with TTL expires correctly', async () => {
    await redis.setex('test:ttl', 1, 'temporary');
    const before = await redis.get('test:ttl');
    expect(before).toBe('temporary');

    // Wait for expiry
    await new Promise(r => setTimeout(r, 1100));
    const after = await redis.get('test:ttl');
    expect(after).toBeNull();
  });

  test('JSON cache (serialize/deserialize)', async () => {
    const data = { storeId: 'store-1', products: [{ id: 'p1', name: 'Rice' }] };
    await redis.set('test:json', JSON.stringify(data));
    const raw = await redis.get('test:json');
    expect(JSON.parse(raw!)).toEqual(data);
  });

  test('DELETE removes key', async () => {
    await redis.set('test:del', 'value');
    await redis.del('test:del');
    const result = await redis.get('test:del');
    expect(result).toBeNull();
  });

  test('Pattern-based deletion (SCAN + DEL)', async () => {
    // Set multiple keys with a pattern
    await redis.set('api:store1:products', '[]');
    await redis.set('api:store1:orders', '[]');
    await redis.set('api:store2:products', '[]');

    // Delete all store1 keys
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', 'api:store1:*', 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length > 0) {
      await redis.del(...keys);
    }

    expect(await redis.get('api:store1:products')).toBeNull();
    expect(await redis.get('api:store1:orders')).toBeNull();
    expect(await redis.get('api:store2:products')).toBe('[]'); // Not deleted
  });
});

// =============================================================================
// RATE LIMITING (Sliding Window via Sorted Set)
// =============================================================================
describe('Rate Limiting', () => {
  async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowMs;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, '-inf', String(windowStart));
    pipeline.zadd(key, String(now), `${now}-${Math.random()}`);
    pipeline.zcard(key);
    pipeline.pexpire(key, windowMs);

    const results = await pipeline.exec();
    const count = results![2][1] as number;
    return count <= limit;
  }

  test('allows requests within limit', async () => {
    const key = 'ratelimit:test-user';
    for (let i = 0; i < 5; i++) {
      const allowed = await checkRateLimit(key, 10, 60000);
      expect(allowed).toBe(true);
    }
  });

  test('blocks requests over limit', async () => {
    const key = 'ratelimit:test-user-blocked';
    // Fill up the limit
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(key, 3, 60000);
    }
    // 4th request should be blocked
    const allowed = await checkRateLimit(key, 3, 60000);
    expect(allowed).toBe(false);
  });
});

// =============================================================================
// TOKEN BLACKLIST
// =============================================================================
describe('Token Blacklist', () => {
  const BLACKLIST_PREFIX = 'supermandi:token_blacklist:';

  async function blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    await redis.setex(`${BLACKLIST_PREFIX}${jti}`, ttlSeconds, '1');
  }

  async function isBlacklisted(jti: string): Promise<boolean> {
    const result = await redis.get(`${BLACKLIST_PREFIX}${jti}`);
    return result !== null;
  }

  test('blacklisted token is detected', async () => {
    await blacklistToken('token-abc', 300);
    expect(await isBlacklisted('token-abc')).toBe(true);
    expect(await isBlacklisted('token-xyz')).toBe(false);
  });

  test('blacklist entries expire with TTL', async () => {
    await blacklistToken('token-expire', 1);
    expect(await isBlacklisted('token-expire')).toBe(true);

    await new Promise(r => setTimeout(r, 1100));
    expect(await isBlacklisted('token-expire')).toBe(false);
  });
});

// =============================================================================
// BULLMQ QUEUE + WORKER
// =============================================================================
describe('BullMQ Queue & Worker', () => {
  let queue: Queue;
  let worker: Worker;

  afterEach(async () => {
    if (worker) {
      await worker.close();
    }
    if (queue) {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });

  test('enqueue and process a job', async () => {
    const connection = { host: redisHost, port: redisPort };
    const queueName = `test-queue-${Date.now()}`;

    queue = new Queue(queueName, { connection });

    const processed: string[] = [];
    const processingDone = new Promise<void>((resolve) => {
      worker = new Worker(
        queueName,
        async (job: Job) => {
          processed.push(job.data.message);
          resolve();
        },
        { connection }
      );
    });

    await queue.add('test-job', { message: 'hello-bullmq' });
    await processingDone;

    expect(processed).toContain('hello-bullmq');
  });

  test('job retry on failure', async () => {
    const connection = { host: redisHost, port: redisPort };
    const queueName = `test-retry-${Date.now()}`;

    queue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'fixed', delay: 100 },
      },
    });

    let attempts = 0;
    const processingDone = new Promise<void>((resolve) => {
      worker = new Worker(
        queueName,
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Fail attempt ${attempts}`);
          }
          resolve();
        },
        { connection }
      );
    });

    await queue.add('retry-job', { data: 'test' });
    await processingDone;

    expect(attempts).toBe(3); // Failed twice, succeeded on 3rd
  });

  test('event fanout pattern (multiple consumers)', async () => {
    const connection = { host: redisHost, port: redisPort };
    const ts = Date.now();
    const catalogQueue = new Queue(`inventory-events.catalog-${ts}`, { connection });
    const reorderQueue = new Queue(`inventory-events.reorder-${ts}`, { connection });

    const catalogEvents: string[] = [];
    const reorderEvents: string[] = [];
    let catalogDone: () => void;
    let reorderDone: () => void;
    const catalogPromise = new Promise<void>(r => { catalogDone = r; });
    const reorderPromise = new Promise<void>(r => { reorderDone = r; });

    const catalogWorker = new Worker(
      `inventory-events.catalog-${ts}`,
      async (job: Job) => { catalogEvents.push(job.data.type); catalogDone!(); },
      { connection }
    );

    const reorderWorker = new Worker(
      `inventory-events.reorder-${ts}`,
      async (job: Job) => { reorderEvents.push(job.data.type); reorderDone!(); },
      { connection }
    );

    // Fanout: same event published to both queues
    const event = { type: 'inventory.stock.changed.v1', storeId: 'store-1', productId: 'p-1' };
    await catalogQueue.add('stock-changed', event);
    await reorderQueue.add('stock-changed', event);

    await Promise.all([catalogPromise, reorderPromise]);

    expect(catalogEvents).toContain('inventory.stock.changed.v1');
    expect(reorderEvents).toContain('inventory.stock.changed.v1');

    // Cleanup
    await catalogWorker.close();
    await reorderWorker.close();
    await catalogQueue.obliterate({ force: true });
    await reorderQueue.obliterate({ force: true });
    await catalogQueue.close();
    await reorderQueue.close();
  });
});

// =============================================================================
// SESSION STORAGE
// =============================================================================
describe('Session Storage', () => {
  const SESSION_PREFIX = 'session:';

  test('store and retrieve session data', async () => {
    const sessionId = 'sess-abc-123';
    const sessionData = {
      userId: 'user-1',
      storeId: 'store-1',
      role: 'cashier',
      createdAt: new Date().toISOString(),
    };

    await redis.setex(`${SESSION_PREFIX}${sessionId}`, 3600, JSON.stringify(sessionData));
    const raw = await redis.get(`${SESSION_PREFIX}${sessionId}`);
    const retrieved = JSON.parse(raw!);

    expect(retrieved.userId).toBe('user-1');
    expect(retrieved.storeId).toBe('store-1');
    expect(retrieved.role).toBe('cashier');
  });

  test('delete session on logout', async () => {
    const sessionId = 'sess-logout-test';
    await redis.setex(`${SESSION_PREFIX}${sessionId}`, 3600, '{}');
    await redis.del(`${SESSION_PREFIX}${sessionId}`);
    const result = await redis.get(`${SESSION_PREFIX}${sessionId}`);
    expect(result).toBeNull();
  });
});
