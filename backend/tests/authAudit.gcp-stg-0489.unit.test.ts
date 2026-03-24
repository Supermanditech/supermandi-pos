// GCP-STG-0489: Auth event audit trail — unit tests
// Tests that logAuthEvent inserts correctly and is non-blocking on failure

import { logAuthEvent } from '../src/services/authAudit';

// Mock getPool
const mockQuery = jest.fn();
jest.mock('../src/db/client', () => ({
  getPool: jest.fn(),
}));

// Mock structured logger
const mockLogError = jest.fn();
jest.mock('../src/lib/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: (...args: unknown[]) => mockLogError(...args), debug: jest.fn() },
}));

import { getPool } from '../src/db/client';
const mockGetPool = getPool as jest.MockedFunction<typeof getPool>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('logAuthEvent', () => {
  it('inserts auth event into auth.auth_events table', async () => {
    mockGetPool.mockReturnValue({ query: mockQuery } as any);

    await logAuthEvent({
      actorType: 'admin',
      actorId: 'admin@test.com',
      eventType: 'login_success',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      metadata: { method: 'email_otp' },
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.auth_events'),
      ['admin', 'admin@test.com', 'login_success', '127.0.0.1', 'TestAgent/1.0', '{"method":"email_otp"}']
    );
  });

  it('uses null for optional fields when not provided', async () => {
    mockGetPool.mockReturnValue({ query: mockQuery } as any);

    await logAuthEvent({
      actorType: 'pos_device',
      eventType: 'otp_sent',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.auth_events'),
      ['pos_device', null, 'otp_sent', null, null, '{}']
    );
  });

  it('does not throw when DB query fails (non-blocking)', async () => {
    mockGetPool.mockReturnValue({ query: mockQuery } as any);
    mockQuery.mockRejectedValue(new Error('DB connection lost'));

    // Should not throw
    await expect(
      logAuthEvent({
        actorType: 'admin',
        actorId: 'admin@test.com',
        eventType: 'logout',
      })
    ).resolves.toBeUndefined();

    expect(mockLogError).toHaveBeenCalledWith(
      '[AUTH-AUDIT] Failed to log event:',
      'DB connection lost'
    );
  });

  it('does not throw when pool is unavailable', async () => {
    mockGetPool.mockReturnValue(undefined as any);

    // Should not throw, should silently return
    await expect(
      logAuthEvent({
        actorType: 'supplier',
        actorId: 'supplier-123',
        eventType: 'login_success',
      })
    ).resolves.toBeUndefined();

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('logs device_enrolled event with store metadata', async () => {
    mockGetPool.mockReturnValue({ query: mockQuery } as any);

    await logAuthEvent({
      actorType: 'pos_device',
      actorId: '+919876543210',
      eventType: 'device_enrolled',
      ipAddress: '192.168.1.1',
      metadata: { storeId: 'store-uuid-123', storeCode: 'SU260305-003' },
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.auth_events'),
      [
        'pos_device',
        '+919876543210',
        'device_enrolled',
        '192.168.1.1',
        null,
        '{"storeId":"store-uuid-123","storeCode":"SU260305-003"}',
      ]
    );
  });
});
