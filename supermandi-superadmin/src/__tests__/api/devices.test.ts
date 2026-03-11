// SuperAdmin — Test devices API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDevices, patchDevice, forceReEnrollDevice, forceSyncDevice, fetchDeviceSyncStatus, pushConfigToDevice, broadcastConfig, fetchConfigPushHistory, fetchWhitelistRules, createWhitelistRule, deleteWhitelistRule, toggleWhitelistRule } from '../../api/devices';

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) throw new Error('Mock fetch not set up');
    return mockFetch(url, init);
  }),
}));

vi.mock('../../api/errorSanitizer', () => ({
  parseError: vi.fn(async (res: Response) => `Request failed (${res.status})`),
}));

describe('devices API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchDevices
  // =========================================================================

  describe('fetchDevices', () => {
    it('returns paginated device list', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          devices: [
            { id: 'dev-1', active: true, store_id: 'store-1', last_seen_online: '2024-01-01', last_sync_at: null, pending_outbox_count: 0 },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      });

      const result = await fetchDevices();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('dev-1');
      expect(result.total).toBe(1);
    });

    it('passes storeId query param', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices({ storeId: 'store-1' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('storeId=store-1');
    });

    it('passes deviceId query param', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices({ deviceId: 'dev-123' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('deviceId=dev-123');
    });

    it('passes pagination params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices({ limit: 10, offset: 20 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=20');
    });

    it('trims whitespace from storeId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices({ storeId: '  store-1  ' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('storeId=store-1');
    });

    it('does not include empty storeId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices({ storeId: '   ' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).not.toContain('storeId');
    });

    it('returns empty items when devices is not array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchDevices();
      expect(result.items).toEqual([]);
    });

    it('uses default pagination values when missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [] }),
      });

      const result = await fetchDevices();
      expect(result.total).toBe(0);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cache: 'no-store',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchDevices()).rejects.toThrow();
    });

    it('handles json parse failure gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      const result = await fetchDevices();
      expect(result.items).toEqual([]);
    });
  });

  // =========================================================================
  // patchDevice
  // =========================================================================

  describe('patchDevice', () => {
    it('sends PATCH with device settings', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          device: { id: 'dev-1', label: 'POS Main', active: true, last_seen_online: null, last_sync_at: null, pending_outbox_count: 0 },
        }),
      });

      const result = await patchDevice('dev-1', { label: 'POS Main', deviceType: 'POS' });
      expect(result.label).toBe('POS Main');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/devices/dev-1'),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('sends printingMode and scanLookupV2Enabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          device: { id: 'dev-1', active: true, last_seen_online: null, last_sync_at: null, pending_outbox_count: 0 },
        }),
      });

      await patchDevice('dev-1', { printingMode: 'bluetooth', scanLookupV2Enabled: true });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.printingMode).toBe('bluetooth');
      expect(body.scanLookupV2Enabled).toBe(true);
    });

    it('sends active and resetToken flags', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          device: { id: 'dev-1', active: false, last_seen_online: null, last_sync_at: null, pending_outbox_count: 0 },
        }),
      });

      await patchDevice('dev-1', { active: false, resetToken: true });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.active).toBe(false);
      expect(body.resetToken).toBe(true);
    });

    it('throws when device field is missing from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(patchDevice('dev-1', { label: 'Test' })).rejects.toThrow('Device response missing');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(patchDevice('dev-1', {})).rejects.toThrow();
    });

    it('encodes deviceId in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          device: { id: 'dev/special', active: true, last_seen_online: null, last_sync_at: null, pending_outbox_count: 0 },
        }),
      });

      await patchDevice('dev/special', { label: 'Test' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('dev%2Fspecial');
    });
  });

  // =========================================================================
  // SA-P2-001: forceReEnrollDevice
  // =========================================================================

  describe('forceReEnrollDevice', () => {
    it('sends POST to force-re-enroll endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Device has been deregistered.' }),
      });

      const result = await forceReEnrollDevice('dev-1');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Device has been deregistered.');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/devices/dev-1/force-re-enroll'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('sends reason in request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Done' }),
      });

      await forceReEnrollDevice('dev-1', 'Device stolen');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBe('Device stolen');
    });

    it('sends empty reason when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Done' }),
      });

      await forceReEnrollDevice('dev-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBe('');
    });

    it('encodes deviceId in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await forceReEnrollDevice('dev/special');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('dev%2Fspecial/force-re-enroll');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(forceReEnrollDevice('dev-1')).rejects.toThrow();
    });

    it('returns default message when response has no message', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await forceReEnrollDevice('dev-1');
      expect(result.message).toBe('Device has been deregistered.');
    });
  });

  // =========================================================================
  // SA-P2-005: forceSyncDevice
  // =========================================================================

  describe('forceSyncDevice', () => {
    it('sends POST to force-sync endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Force sync has been queued.' }),
      });

      const result = await forceSyncDevice('dev-1');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Force sync has been queued.');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/devices/dev-1/force-sync'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('sends reason in request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Done' }),
      });

      await forceSyncDevice('dev-1', 'Device out of sync');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBe('Device out of sync');
    });

    it('sends empty reason when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Done' }),
      });

      await forceSyncDevice('dev-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBe('');
    });

    it('encodes deviceId in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await forceSyncDevice('dev/special');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('dev%2Fspecial/force-sync');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(forceSyncDevice('dev-1')).rejects.toThrow();
    });

    it('returns default message when response has no message', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await forceSyncDevice('dev-1');
      expect(result.message).toBe('Force sync has been queued.');
    });
  });

  // =========================================================================
  // SA-P2-005: fetchDeviceSyncStatus
  // =========================================================================

  describe('fetchDeviceSyncStatus', () => {
    it('fetches sync status for a device', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          device_id: 'dev-1',
          last_sync_at: '2026-03-10T10:00:00Z',
          last_seen_online: '2026-03-10T10:05:00Z',
          pending_outbox_count: 2,
          pending_sync_request: null,
          recent_sync_requests: [],
        }),
      });

      const result = await fetchDeviceSyncStatus('dev-1');
      expect(result.device_id).toBe('dev-1');
      expect(result.last_sync_at).toBe('2026-03-10T10:00:00Z');
      expect(result.pending_outbox_count).toBe(2);
      expect(result.pending_sync_request).toBeNull();
    });

    it('returns pending sync request when present', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          device_id: 'dev-1',
          last_sync_at: null,
          last_seen_online: null,
          pending_outbox_count: 0,
          pending_sync_request: {
            id: 'req-1',
            reason: 'Forced by admin',
            requested_at: '2026-03-10T10:00:00Z',
          },
          recent_sync_requests: [],
        }),
      });

      const result = await fetchDeviceSyncStatus('dev-1');
      expect(result.pending_sync_request).not.toBeNull();
      expect(result.pending_sync_request!.id).toBe('req-1');
      expect(result.pending_sync_request!.reason).toBe('Forced by admin');
    });

    it('encodes deviceId in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ device_id: 'dev/special' }),
      });

      await fetchDeviceSyncStatus('dev/special');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('dev%2Fspecial/sync-status');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(fetchDeviceSyncStatus('dev-1')).rejects.toThrow();
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ device_id: 'dev-1' }),
      });

      await fetchDeviceSyncStatus('dev-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sync-status'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });
  });

  // =========================================================================
  // SA-P2-002: pushConfigToDevice
  // =========================================================================

  describe('pushConfigToDevice', () => {
    it('sends POST to push-config endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ queued: true, method: 'poll', pushId: 'push-1', createdAt: '2026-03-11T00:00:00Z' }),
      });

      const result = await pushConfigToDevice('dev-1', { configKey: 'FORCE_UPDATE', configValue: 'true' });
      expect(result.queued).toBe(true);
      expect(result.method).toBe('poll');
      expect(result.pushId).toBe('push-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/devices/dev-1/push-config'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('sends configKey, configValue and message in body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ queued: true, method: 'fcm' }),
      });

      await pushConfigToDevice('dev-1', { configKey: 'MAINTENANCE_MODE', configValue: 'true', message: 'Going down' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.configKey).toBe('MAINTENANCE_MODE');
      expect(body.configValue).toBe('true');
      expect(body.message).toBe('Going down');
    });

    it('encodes deviceId in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ queued: true, method: 'poll' }),
      });

      await pushConfigToDevice('dev/special', { configKey: 'FORCE_UPDATE', configValue: '1' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('dev%2Fspecial/push-config');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({}),
      });

      await expect(pushConfigToDevice('dev-1', { configKey: 'X', configValue: 'Y' })).rejects.toThrow();
    });

    it('defaults method to poll when missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ queued: true }),
      });

      const result = await pushConfigToDevice('dev-1', { configKey: 'X', configValue: 'Y' });
      expect(result.method).toBe('poll');
    });
  });

  // =========================================================================
  // SA-P2-002: broadcastConfig
  // =========================================================================

  describe('broadcastConfig', () => {
    it('sends POST to broadcast-config endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ queued: true, method: 'poll', deviceCount: 5 }),
      });

      const result = await broadcastConfig({ configKey: 'FORCE_UPDATE', configValue: 'true' });
      expect(result.queued).toBe(true);
      expect(result.deviceCount).toBe(5);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/devices/broadcast-config'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('sends message in body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ queued: true, method: 'fcm', deviceCount: 3 }),
      });

      await broadcastConfig({ configKey: 'MAINTENANCE_MODE', configValue: 'false', message: 'Back online' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.message).toBe('Back online');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(broadcastConfig({ configKey: 'X', configValue: 'Y' })).rejects.toThrow();
    });

    it('defaults deviceCount to 0 when missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ queued: true }),
      });

      const result = await broadcastConfig({ configKey: 'X', configValue: 'Y' });
      expect(result.deviceCount).toBe(0);
    });
  });

  // =========================================================================
  // SA-P2-002: fetchConfigPushHistory
  // =========================================================================

  describe('fetchConfigPushHistory', () => {
    it('returns paginated push history', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          pushes: [
            { id: 'p1', device_id: 'dev-1', config_key: 'FORCE_UPDATE', config_value: 'true', method: 'poll', status: 'pending', created_at: '2026-03-11T00:00:00Z' },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      });

      const result = await fetchConfigPushHistory();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].config_key).toBe('FORCE_UPDATE');
      expect(result.total).toBe(1);
    });

    it('passes deviceId filter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ pushes: [], total: 0 }),
      });

      await fetchConfigPushHistory({ deviceId: 'dev-1' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('deviceId=dev-1');
    });

    it('passes pagination params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ pushes: [], total: 0 }),
      });

      await fetchConfigPushHistory({ limit: 10, offset: 20 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=20');
    });

    it('returns empty items when pushes is not array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchConfigPushHistory();
      expect(result.items).toEqual([]);
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchConfigPushHistory()).rejects.toThrow();
    });

    it('uses no-store cache policy', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ pushes: [], total: 0 }),
      });

      await fetchConfigPushHistory();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cache: 'no-store' })
      );
    });
  });

  // =========================================================================
  // SA-P2-009: Device Hardware Whitelist
  // =========================================================================

  describe('fetchWhitelistRules', () => {
    it('returns rules array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rules: [
            { id: 'r1', manufacturer: 'Samsung', model: null, min_android_version: '12', active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
          ],
        }),
      });

      const result = await fetchWhitelistRules();
      expect(result).toHaveLength(1);
      expect(result[0].manufacturer).toBe('Samsung');
    });

    it('returns empty array when rules missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchWhitelistRules();
      expect(result).toEqual([]);
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchWhitelistRules()).rejects.toThrow();
    });
  });

  describe('createWhitelistRule', () => {
    it('sends POST with rule data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rule: { id: 'r1', manufacturer: 'Samsung', model: 'Galaxy*', min_android_version: '12', active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
        }),
      });

      const result = await createWhitelistRule({ manufacturer: 'Samsung', model: 'Galaxy*', minAndroidVersion: '12' });
      expect(result.id).toBe('r1');
      expect(result.manufacturer).toBe('Samsung');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/devices/whitelist'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws when rule field is missing from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(createWhitelistRule({ manufacturer: 'Test' })).rejects.toThrow('Rule response missing');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({}),
      });

      await expect(createWhitelistRule({ manufacturer: 'Test' })).rejects.toThrow();
    });
  });

  describe('deleteWhitelistRule', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await deleteWhitelistRule('r1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/devices/whitelist/r1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(deleteWhitelistRule('r1')).rejects.toThrow();
    });

    it('encodes ruleId in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await deleteWhitelistRule('rule/special');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('rule%2Fspecial');
    });
  });

  describe('toggleWhitelistRule', () => {
    it('sends PATCH with active status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rule: { id: 'r1', manufacturer: 'Samsung', active: false, created_at: '2026-01-01', updated_at: '2026-01-01' },
        }),
      });

      const result = await toggleWhitelistRule('r1', false);
      expect(result.active).toBe(false);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.active).toBe(false);
    });

    it('throws when rule missing from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(toggleWhitelistRule('r1', true)).rejects.toThrow('Rule response missing');
    });
  });
});
