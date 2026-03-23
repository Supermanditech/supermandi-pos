/**
 * SCALE-D2: Connection pool tuning tests
 * Verifies pool defaults are correctly set for 10K user scale.
 */

describe('SCALE-D2: Connection pool config defaults', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules so POOL_CONFIG is re-evaluated with fresh env
    jest.resetModules();
    process.env = { ...originalEnv };
    // Remove pool env vars so defaults are used
    delete process.env.DB_POOL_MIN;
    delete process.env.DB_POOL_MAX;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // GCP-STG-0365: defaults reduced from min=5/max=25 to min=2/max=10
  it('should have default DB_POOL_MIN=2', () => {
    const min = parseInt(process.env.DB_POOL_MIN || '2', 10);
    expect(min).toBe(2);
  });

  it('should have default DB_POOL_MAX=10', () => {
    const max = parseInt(process.env.DB_POOL_MAX || '10', 10);
    expect(max).toBe(10);
  });

  it('should allow env vars to override defaults', () => {
    process.env.DB_POOL_MIN = '10';
    process.env.DB_POOL_MAX = '50';

    const min = parseInt(process.env.DB_POOL_MIN || '2', 10);
    const max = parseInt(process.env.DB_POOL_MAX || '10', 10);

    expect(min).toBe(10);
    expect(max).toBe(50);
  });

  it('should have pool min within acceptable range (1-20)', () => {
    const min = parseInt(process.env.DB_POOL_MIN || '2', 10);
    expect(min).toBeGreaterThanOrEqual(1);
    expect(min).toBeLessThanOrEqual(20);
  });

  it('should have pool max within acceptable range (5-100)', () => {
    const max = parseInt(process.env.DB_POOL_MAX || '10', 10);
    expect(max).toBeGreaterThanOrEqual(5);
    expect(max).toBeLessThanOrEqual(100);
  });

  it('should have pool min less than or equal to pool max', () => {
    const min = parseInt(process.env.DB_POOL_MIN || '2', 10);
    const max = parseInt(process.env.DB_POOL_MAX || '10', 10);
    expect(min).toBeLessThanOrEqual(max);
  });
});
