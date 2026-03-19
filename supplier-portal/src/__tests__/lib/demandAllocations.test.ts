/**
 * V3-FIX-187: Supplier allocation API client — runtime behavior tests
 *
 * Uses Jest (supplier-portal canonical runner via next/jest).
 * Mocks global fetch, verifies actual function execution paths.
 */

import {
  listAllocations,
  getAllocation,
  updateAllocationStatus,
} from '../../lib/demandAllocations';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function mockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('listAllocations runtime', () => {
  it('calls /api/v1/supplier/allocations with credentials and returns parsed data', async () => {
    const mockData = [{ id: 'alloc-1', status: 'triggered', storeId: 's1' }];
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, data: mockData, pagination: { total: 1 } }));

    const result = await listAllocations({ status: 'triggered', limit: 10 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/supplier/allocations');
    expect(url).toContain('status=triggered');
    expect(url).toContain('limit=10');
    expect(init.credentials).toBe('include');
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].id).toBe('alloc-1');
    expect(result.total).toBe(1);
  });

  it('throws on 401 unauthorized', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Unauthorized' }, false, 401));
    await expect(listAllocations()).rejects.toThrow('Unauthorized');
  });

  it('calls without params when none provided', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, data: [], pagination: { total: 0 } }));
    await listAllocations();
    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain('?');
  });
});

describe('getAllocation runtime', () => {
  it('fetches single allocation by ID and returns parsed object', async () => {
    const alloc = { id: 'alloc-1', status: 'accepted', supplierId: 'sup-1' };
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, data: alloc }));

    const result = await getAllocation('alloc-1');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/allocations/alloc-1');
    expect(result.id).toBe('alloc-1');
    expect(result.status).toBe('accepted');
  });

  it('throws on 404 not found', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Allocation not found' }, false, 404));
    await expect(getAllocation('nonexistent')).rejects.toThrow('Allocation not found');
  });
});

describe('updateAllocationStatus runtime', () => {
  it('sends PATCH with status and payload, returns updated allocation', async () => {
    const updated = { id: 'alloc-1', status: 'accepted' };
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, data: updated }));

    const result = await updateAllocationStatus('alloc-1', 'accepted', { note: 'ok' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/allocations/alloc-1/status');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body);
    expect(body.status).toBe('accepted');
    expect(body.note).toBe('ok');
    expect(result.status).toBe('accepted');
  });

  it('throws on 409 invalid transition', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: 'Invalid transition: rejected → accepted' }, false, 409)
    );
    await expect(updateAllocationStatus('alloc-1', 'accepted')).rejects.toThrow('Invalid transition');
  });
});
