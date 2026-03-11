// SuperAdmin — Test store health API client (SA-P1-009)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchStoreHealth } from '../../api/health';

// Mock the authToken module
vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) {
      throw new Error('Mock fetch not set up');
    }
    return mockFetch(url, init);
  }),
}));

const makeMockResponse = () => ({
  summary: {
    totalStores: 3,
    healthyCount: 1,
    warningCount: 1,
    criticalCount: 1,
  },
  stores: [
    {
      id: 'store-1',
      name: 'Critical Store',
      code: 'SU-001',
      status: 'ACTIVE',
      healthScore: 25,
      factors: [
        { name: 'Device', status: 'critical', detail: 'No device bound' },
        { name: 'Sync', status: 'critical', detail: 'Never synced' },
        { name: 'Orders', status: 'healthy', detail: '5 orders in 7d' },
        { name: 'KYC', status: 'critical', detail: 'Status: incomplete' },
      ],
    },
    {
      id: 'store-2',
      name: 'Warning Store',
      code: 'SU-002',
      status: 'ACTIVE',
      healthScore: 50,
      factors: [
        { name: 'Device', status: 'healthy', detail: '1 active device(s)' },
        { name: 'Sync', status: 'warning', detail: 'Last sync 3d ago' },
        { name: 'Orders', status: 'healthy', detail: '2 orders in 7d' },
        { name: 'KYC', status: 'critical', detail: 'Status: incomplete' },
      ],
    },
    {
      id: 'store-3',
      name: 'Healthy Store',
      code: 'SU-003',
      status: 'ACTIVE',
      healthScore: 100,
      factors: [
        { name: 'Device', status: 'healthy', detail: '1 active device(s)' },
        { name: 'Sync', status: 'healthy', detail: 'Last sync 2h ago' },
        { name: 'Orders', status: 'healthy', detail: '10 orders in 7d' },
        { name: 'KYC', status: 'healthy', detail: 'Complete & approved' },
      ],
    },
  ],
});

describe('fetchStoreHealth', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  it('returns store health data on success', async () => {
    const mockData = makeMockResponse();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    const result = await fetchStoreHealth();

    expect(result.summary.totalStores).toBe(3);
    expect(result.summary.healthyCount).toBe(1);
    expect(result.summary.warningCount).toBe(1);
    expect(result.summary.criticalCount).toBe(1);
    expect(result.stores).toHaveLength(3);
  });

  it('calls correct endpoint with auth headers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeMockResponse(),
    });

    await fetchStoreHealth();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/admin/stores/health'),
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer mock-token',
        }),
      })
    );
  });

  it('throws on 401 unauthorized', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    await expect(fetchStoreHealth()).rejects.toThrow('Session expired or unauthorized');
  });

  it('throws on 500 server error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal error' }),
    });

    await expect(fetchStoreHealth()).rejects.toThrow('Store health fetch failed (500)');
  });

  it('throws on 503 service unavailable', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Service unavailable' }),
    });

    await expect(fetchStoreHealth()).rejects.toThrow('Store health fetch failed (503)');
  });

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(fetchStoreHealth()).rejects.toThrow('Network error');
  });

  it('throws on invalid response (missing summary)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ stores: [] }),
    });

    await expect(fetchStoreHealth()).rejects.toThrow('Invalid store health response');
  });

  it('throws on invalid response (missing stores)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ summary: {} }),
    });

    await expect(fetchStoreHealth()).rejects.toThrow('Invalid store health response');
  });

  it('throws on null response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => null,
    });

    await expect(fetchStoreHealth()).rejects.toThrow('Invalid store health response');
  });

  it('throws on non-object response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => 'string',
    });

    await expect(fetchStoreHealth()).rejects.toThrow('Invalid store health response');
  });

  it('returns store entries with all expected fields', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeMockResponse(),
    });

    const result = await fetchStoreHealth();
    const store = result.stores[0];

    expect(store).toHaveProperty('id');
    expect(store).toHaveProperty('name');
    expect(store).toHaveProperty('code');
    expect(store).toHaveProperty('status');
    expect(store).toHaveProperty('healthScore');
    expect(store).toHaveProperty('factors');
    expect(store.factors).toHaveLength(4);
  });

  it('returns factors with name, status, and detail', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeMockResponse(),
    });

    const result = await fetchStoreHealth();
    const factor = result.stores[0].factors[0];

    expect(factor).toHaveProperty('name');
    expect(factor).toHaveProperty('status');
    expect(factor).toHaveProperty('detail');
    expect(['healthy', 'warning', 'critical']).toContain(factor.status);
  });

  it('handles empty stores array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        summary: { totalStores: 0, healthyCount: 0, warningCount: 0, criticalCount: 0 },
        stores: [],
      }),
    });

    const result = await fetchStoreHealth();
    expect(result.stores).toHaveLength(0);
    expect(result.summary.totalStores).toBe(0);
  });
});
