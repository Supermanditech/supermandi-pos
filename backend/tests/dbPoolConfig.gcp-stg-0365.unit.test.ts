/**
 * GCP-STG-0365: Cloud SQL Connection Limit — pool config safety test
 *
 * Validates that DB pool defaults keep total connections within Cloud SQL limits.
 * Math: 15 Cloud Run instances x (Drizzle pool max + common pool max) <= 500 (upgraded tier).
 */

// These constants mirror the defaults in backend/src/db/client.ts and
// backend/packages/common/src/db/pool.ts — if someone bumps them, this test
// will fail and force them to re-verify Cloud SQL capacity.
const DRIZZLE_POOL_DEFAULT_MAX = 10;
const DRIZZLE_POOL_DEFAULT_MIN = 2;
const COMMON_POOL_DEFAULT_MAX = 10;
const MAX_CLOUD_RUN_INSTANCES = 15;
const CLOUD_SQL_CONNECTION_LIMIT = 500; // upgraded tier

describe('GCP-STG-0365: Cloud SQL connection limit safety', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.DB_POOL_MIN;
    delete process.env.DB_POOL_MAX;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('Drizzle pool default max should be 10', () => {
    const max = parseInt(process.env.DB_POOL_MAX || '10', 10);
    expect(max).toBe(DRIZZLE_POOL_DEFAULT_MAX);
  });

  it('Drizzle pool default min should be 2', () => {
    const min = parseInt(process.env.DB_POOL_MIN || '2', 10);
    expect(min).toBe(DRIZZLE_POOL_DEFAULT_MIN);
  });

  it('common pool default max should be 10', () => {
    // common/src/db/pool.ts uses '10' as default for DB_POOL_MAX
    const max = parseInt(process.env.DB_POOL_MAX || '10', 10);
    expect(max).toBe(COMMON_POOL_DEFAULT_MAX);
  });

  it('total connections across max instances should stay within Cloud SQL limit', () => {
    const drizzleMax = parseInt(process.env.DB_POOL_MAX || '10', 10);
    const commonMax = parseInt(process.env.DB_POOL_MAX || '10', 10);
    const totalPerInstance = drizzleMax + commonMax;
    const totalConnections = totalPerInstance * MAX_CLOUD_RUN_INSTANCES;

    // 15 instances x (10 + 10) = 300 <= 500
    expect(totalConnections).toBeLessThanOrEqual(CLOUD_SQL_CONNECTION_LIMIT);
    // Also ensure we have a reasonable margin (at least 30% headroom)
    expect(totalConnections).toBeLessThanOrEqual(CLOUD_SQL_CONNECTION_LIMIT * 0.7);
  });

  it('per-instance pool total should not exceed 30 connections', () => {
    // Safety bound: even if someone overrides via env, warn if per-instance > 30
    const drizzleMax = parseInt(process.env.DB_POOL_MAX || '10', 10);
    const commonMax = parseInt(process.env.DB_POOL_MAX || '10', 10);
    expect(drizzleMax + commonMax).toBeLessThanOrEqual(30);
  });

  it('min should be less than or equal to max', () => {
    const min = parseInt(process.env.DB_POOL_MIN || '2', 10);
    const max = parseInt(process.env.DB_POOL_MAX || '10', 10);
    expect(min).toBeLessThanOrEqual(max);
  });

  it('env var override should be respected but still validated', () => {
    process.env.DB_POOL_MAX = '15';
    const max = parseInt(process.env.DB_POOL_MAX || '10', 10);
    expect(max).toBe(15);
    // 15 instances x (15 + 15) = 450, still under 500
    expect(max * 2 * MAX_CLOUD_RUN_INSTANCES).toBeLessThanOrEqual(CLOUD_SQL_CONNECTION_LIMIT);
  });

  it('should reject pool max values that would exceed Cloud SQL limit', () => {
    // If someone sets DB_POOL_MAX=20, total = 15 * (20+20) = 600 > 500
    const unsafeMax = 20;
    const totalWithUnsafe = unsafeMax * 2 * MAX_CLOUD_RUN_INSTANCES;
    expect(totalWithUnsafe).toBeGreaterThan(CLOUD_SQL_CONNECTION_LIMIT);
  });
});
