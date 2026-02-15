// SuperAdmin — Test status utility functions
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDeviceOnline, getDeviceTone, composeDeviceMessage } from '../../ui/status';
import type { DeviceStatus, StatusTone } from '../../ui/status';

describe('isDeviceOnline', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns false for null/undefined lastSeenOnline', () => {
    expect(isDeviceOnline(null)).toBe(false);
    expect(isDeviceOnline(undefined)).toBe(false);
  });

  it('returns false for invalid date string', () => {
    expect(isDeviceOnline('not-a-date')).toBe(false);
  });

  it('returns true when seen within 5 minutes', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const recentTime = new Date(now - 2 * 60 * 1000).toISOString(); // 2 min ago
    expect(isDeviceOnline(recentTime)).toBe(true);
  });

  it('returns true when seen exactly at boundary (5 min)', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const boundaryTime = new Date(now - 5 * 60 * 1000).toISOString(); // exactly 5 min ago
    expect(isDeviceOnline(boundaryTime)).toBe(true);
  });

  it('returns false when seen more than 5 minutes ago', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const oldTime = new Date(now - 6 * 60 * 1000).toISOString(); // 6 min ago
    expect(isDeviceOnline(oldTime)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isDeviceOnline('')).toBe(false);
  });
});

describe('getDeviceTone', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns error for inactive device', () => {
    const status: DeviceStatus = { active: false };
    expect(getDeviceTone(status)).toBe('error');
  });

  it('returns warning for offline active device', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const status: DeviceStatus = {
      active: true,
      lastSeenOnline: new Date(now - 10 * 60 * 1000).toISOString(),
    };
    expect(getDeviceTone(status)).toBe('warning');
  });

  it('returns warning for device with pending outbox', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const status: DeviceStatus = {
      active: true,
      lastSeenOnline: new Date(now - 1000).toISOString(),
      pendingOutboxCount: 5,
    };
    expect(getDeviceTone(status)).toBe('warning');
  });

  it('returns success for active online device with no pending', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const status: DeviceStatus = {
      active: true,
      lastSeenOnline: new Date(now - 1000).toISOString(),
      pendingOutboxCount: 0,
    };
    expect(getDeviceTone(status)).toBe('success');
  });

  it('returns success when pendingOutboxCount is null', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const status: DeviceStatus = {
      active: true,
      lastSeenOnline: new Date(now - 1000).toISOString(),
      pendingOutboxCount: null,
    };
    expect(getDeviceTone(status)).toBe('success');
  });
});

describe('composeDeviceMessage', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns disabled message for inactive device', () => {
    const status: DeviceStatus = { active: false };
    expect(composeDeviceMessage(status)).toBe(
      'Device is disabled. Enable it in SuperAdmin to resume billing.'
    );
  });

  it('returns offline message for active but offline device', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const status: DeviceStatus = {
      active: true,
      lastSeenOnline: new Date(now - 10 * 60 * 1000).toISOString(),
    };
    expect(composeDeviceMessage(status)).toBe(
      'Device is offline. Ask staff to reconnect so bills can sync.'
    );
  });

  it('returns sync pending message for device with outbox items', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const status: DeviceStatus = {
      active: true,
      lastSeenOnline: new Date(now - 1000).toISOString(),
      pendingOutboxCount: 3,
    };
    expect(composeDeviceMessage(status)).toBe(
      'Sync pending: 3 bills. Keep the POS online to sync.'
    );
  });

  it('returns all good message for healthy device', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const status: DeviceStatus = {
      active: true,
      lastSeenOnline: new Date(now - 1000).toISOString(),
      pendingOutboxCount: 0,
    };
    expect(composeDeviceMessage(status)).toBe(
      'All good. Device is online and ready.'
    );
  });

  it('returns all good when pendingOutboxCount is null', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const status: DeviceStatus = {
      active: true,
      lastSeenOnline: new Date(now - 1000).toISOString(),
      pendingOutboxCount: null,
    };
    expect(composeDeviceMessage(status)).toBe(
      'All good. Device is online and ready.'
    );
  });

  it('prioritizes inactive over offline', () => {
    const status: DeviceStatus = {
      active: false,
      lastSeenOnline: null,
      pendingOutboxCount: 5,
    };
    expect(composeDeviceMessage(status)).toContain('disabled');
  });
});
