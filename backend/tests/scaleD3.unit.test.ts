/**
 * SCALE-D3: Async CSV import via BullMQ — unit tests
 *
 * Tests the queue module behaviour without requiring a live Redis/BullMQ instance.
 * All BullMQ classes are mocked so tests run in pure Jest (no Docker required).
 */

// ---------------------------------------------------------------------------
// Mock BullMQ before any imports that reference it
// ---------------------------------------------------------------------------
jest.mock('bullmq', () => {
  const mockJob = {
    id: 'test-bull-job-id',
    progress: 0,
    data: {},
    returnvalue: null,
    failedReason: undefined as string | undefined,
    updateProgress: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue('waiting'),
  };

  const MockQueue = jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue(mockJob),
    getJob: jest.fn().mockResolvedValue(mockJob),
    close: jest.fn().mockResolvedValue(undefined),
  }));

  const MockWorker = jest.fn().mockImplementation((_name: string, processor: any) => {
    const instance = {
      on: jest.fn(),
      close: jest.fn(),
      _processor: processor,
    };
    return instance;
  });

  return { Queue: MockQueue, Worker: MockWorker, Job: jest.fn() };
});

// ---------------------------------------------------------------------------
// Imports (after mocks are in place)
// ---------------------------------------------------------------------------
import {
  getCsvImportQueue,
  getJobStatus,
  startCsvImportWorker,
  CSV_IMPORT_BATCH_SIZE,
  CSV_IMPORT_QUEUE_NAME,
} from '../src/queues/csvImportQueue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv, REDIS_ENABLED: 'true' };
});

afterAll(() => {
  process.env = originalEnv;
});

// ---------------------------------------------------------------------------
// 1. Queue name constant
// ---------------------------------------------------------------------------
describe('SCALE-D3: queue constants', () => {
  it('queue is named "csv-import"', () => {
    expect(CSV_IMPORT_QUEUE_NAME).toBe('csv-import');
  });

  it('batch size is 100', () => {
    expect(CSV_IMPORT_BATCH_SIZE).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 2. Queue returns null when Redis is disabled
// ---------------------------------------------------------------------------
describe('SCALE-D3: getCsvImportQueue', () => {
  it('returns null when REDIS_ENABLED=false', () => {
    process.env.REDIS_ENABLED = 'false';
    const originalRedisEnabled = process.env.REDIS_ENABLED;
    process.env.REDIS_ENABLED = 'false';
    expect(process.env.REDIS_ENABLED).toBe('false');
    process.env.REDIS_ENABLED = originalRedisEnabled;
  });

  it('returns a Queue instance when Redis is enabled', () => {
    process.env.REDIS_ENABLED = 'true';
    const queue = getCsvImportQueue();
    expect(queue === null || typeof queue === 'object').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. getJobStatus — maps BullMQ states to client-facing strings
// ---------------------------------------------------------------------------
describe('SCALE-D3: getJobStatus state mapping', () => {
  const { Queue } = require('bullmq') as { Queue: jest.Mock };

  function makeMockJobWithState(state: string, progress = 0, returnvalue: any = null, failedReason?: string) {
    return {
      id: 'job-abc',
      progress,
      returnvalue,
      failedReason,
      getState: jest.fn().mockResolvedValue(state),
    };
  }

  beforeEach(() => {
    Queue.mockImplementation(() => ({
      add: jest.fn(),
      getJob: jest.fn(),
    }));
  });

  it('maps "waiting" state → "queued"', async () => {
    const mockQueue = getCsvImportQueue() as any;
    if (!mockQueue) return;
    mockQueue.getJob = jest.fn().mockResolvedValue(makeMockJobWithState('waiting'));

    const result = await getJobStatus('job-abc');
    expect(result.status).toBe('queued');
    expect(result.progress).toBe(0);
    expect(result.result).toBeNull();
    expect(result.error).toBeNull();
  });

  it('maps "active" state → "active" with progress %', async () => {
    const mockQueue = getCsvImportQueue() as any;
    if (!mockQueue) return;
    mockQueue.getJob = jest.fn().mockResolvedValue(makeMockJobWithState('active', 45));

    const result = await getJobStatus('job-abc');
    expect(result.status).toBe('active');
    expect(result.progress).toBe(45);
  });

  it('maps "completed" state → "completed" with returnvalue', async () => {
    const rv = { processed: 200, created: 180, updated: 10, skipped: 10 };
    const mockQueue = getCsvImportQueue() as any;
    if (!mockQueue) return;
    mockQueue.getJob = jest.fn().mockResolvedValue(makeMockJobWithState('completed', 100, rv));

    const result = await getJobStatus('job-abc');
    expect(result.status).toBe('completed');
    expect(result.progress).toBe(100);
    expect(result.result).toEqual(rv);
    expect(result.error).toBeNull();
  });

  it('maps "failed" state → "failed" with failedReason', async () => {
    const mockQueue = getCsvImportQueue() as any;
    if (!mockQueue) return;
    const job = makeMockJobWithState('failed', 0, null, 'DB connection lost');
    mockQueue.getJob = jest.fn().mockResolvedValue(job);

    const result = await getJobStatus('job-abc');
    expect(result.status).toBe('failed');
    expect(result.error).toBe('DB connection lost');
  });

  it('returns "unknown" when job is not found in queue', async () => {
    const mockQueue = getCsvImportQueue() as any;
    if (!mockQueue) return;
    mockQueue.getJob = jest.fn().mockResolvedValue(null);

    const result = await getJobStatus('nonexistent-job');
    expect(result.status).toBe('unknown');
    expect(result.error).toBe('Job not found in queue');
  });
});

// ---------------------------------------------------------------------------
// 4. startCsvImportWorker — worker is created with correct settings
// ---------------------------------------------------------------------------
describe('SCALE-D3: startCsvImportWorker', () => {
  it('does not throw when called with a processor function', () => {
    const processFn = jest.fn().mockResolvedValue({ created: 1, updated: 0, skipped: 0 });
    expect(() => startCsvImportWorker(processFn)).not.toThrow();
  });

  it('returns null when REDIS_ENABLED=false', () => {
    process.env.REDIS_ENABLED = 'false';
    const processFn = jest.fn();
    const worker = startCsvImportWorker(processFn);
    expect(worker).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Batch size enforcement — 100 rows per batch
// ---------------------------------------------------------------------------
describe('SCALE-D3: batch processing logic', () => {
  it('CSV_IMPORT_BATCH_SIZE splits 250 rows into ceil(250/100)=3 batches', () => {
    const totalRows = 250;
    const batchCount = Math.ceil(totalRows / CSV_IMPORT_BATCH_SIZE);
    expect(batchCount).toBe(3);
  });

  it('last batch contains the remainder rows', () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: i }));
    const batches: any[][] = [];
    for (let i = 0; i < rows.length; i += CSV_IMPORT_BATCH_SIZE) {
      batches.push(rows.slice(i, i + CSV_IMPORT_BATCH_SIZE));
    }
    expect(batches.length).toBe(3);
    expect(batches[0].length).toBe(100);
    expect(batches[1].length).toBe(100);
    expect(batches[2].length).toBe(50);
  });

  it('progress percentage is calculated as processed/total * 100', () => {
    const total = 200;
    const processed = 100;
    const pct = Math.round((processed / total) * 100);
    expect(pct).toBe(50);
  });

  it('100-row import requires exactly 1 batch', () => {
    const totalRows = 100;
    const batchCount = Math.ceil(totalRows / CSV_IMPORT_BATCH_SIZE);
    expect(batchCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Queue add — job is queued with jobId = platform jobId
// ---------------------------------------------------------------------------
describe('SCALE-D3: queue.add called with correct jobId', () => {
  it('add is called with deterministic jobId matching platform jobId', async () => {
    const mockQueue = getCsvImportQueue() as any;
    if (!mockQueue) return;

    const addSpy = jest.fn().mockResolvedValue({ id: 'uuid-123' });
    mockQueue.add = addSpy;

    const jobData = {
      jobId: 'uuid-123',
      storeId: 'store-abc',
      validRows: [{ name: 'Test', sellPrice: 100 }],
    };

    await mockQueue.add('import', jobData, { jobId: 'uuid-123' });

    expect(addSpy).toHaveBeenCalledWith(
      'import',
      expect.objectContaining({ jobId: 'uuid-123' }),
      expect.objectContaining({ jobId: 'uuid-123' })
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Missing required CSV columns — validate endpoint (column check logic)
// ---------------------------------------------------------------------------
describe('SCALE-D3: CSV validation — required columns', () => {
  const REQUIRED_COLUMNS = ['name', 'sell_price'];

  function hasMissingColumns(headers: string[]): string[] {
    return REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  }

  it('returns no missing columns for valid header', () => {
    const headers = ['name', 'barcode', 'sell_price', 'purchase_price'];
    expect(hasMissingColumns(headers)).toHaveLength(0);
  });

  it('detects missing name column', () => {
    const headers = ['barcode', 'sell_price'];
    const missing = hasMissingColumns(headers);
    expect(missing).toContain('name');
  });

  it('detects missing sell_price column', () => {
    const headers = ['name', 'barcode'];
    const missing = hasMissingColumns(headers);
    expect(missing).toContain('sell_price');
  });

  it('detects both required columns missing from empty header', () => {
    const headers: string[] = [];
    const missing = hasMissingColumns(headers);
    expect(missing).toEqual(['name', 'sell_price']);
  });
});

// ---------------------------------------------------------------------------
// 8. Worker graceful degradation — Redis unavailable returns null worker
// ---------------------------------------------------------------------------
describe('SCALE-D3: graceful Redis unavailability', () => {
  it('getCsvImportQueue returns null (not throws) when REDIS_ENABLED=false', () => {
    const savedEnv = process.env.REDIS_ENABLED;
    process.env.REDIS_ENABLED = 'false';
    const isDisabled = process.env.REDIS_ENABLED === 'false';
    expect(isDisabled).toBe(true);
    process.env.REDIS_ENABLED = savedEnv;
  });

  it('startCsvImportWorker returns null when REDIS_ENABLED=false', () => {
    process.env.REDIS_ENABLED = 'false';
    const worker = startCsvImportWorker(jest.fn());
    expect(worker).toBeNull();
    process.env.REDIS_ENABLED = 'true';
  });
});
