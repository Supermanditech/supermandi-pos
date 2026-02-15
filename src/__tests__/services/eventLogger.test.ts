/**
 * Tests for services/eventLogger
 * Covers: eventLogger.initialize, log, getLogs, clearLogs, exportLogs
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn(),
    getAllKeys: jest.fn(),
  },
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('../../services/deviceSession', () => ({
  getDeviceStoreId: jest.fn().mockResolvedValue('store-1'),
  getDeviceSession: jest.fn().mockResolvedValue(null),
  getDeviceToken: jest.fn().mockResolvedValue(null),
  clearDeviceSession: jest.fn(),
  saveDeviceSession: jest.fn(),
  getDeviceIdFromSession: jest.fn().mockResolvedValue(null),
}));

// Must use fresh module for each test since EventLogger has internal state
beforeEach(() => {
  jest.clearAllMocks();
});

describe('eventLogger', () => {
  describe('initialize', () => {
    it('initializes without error', async () => {
      jest.resetModules();
      const { eventLogger } = require('../../services/eventLogger');
      await expect(eventLogger.initialize()).resolves.toBeUndefined();
    });
  });

  describe('log', () => {
    it('logs an event', async () => {
      jest.resetModules();
      const { eventLogger } = require('../../services/eventLogger');
      await eventLogger.log('APP_START', { screen: 'home' });
      const logs = await eventLogger.getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(1);
      const lastLog = logs[logs.length - 1];
      expect(lastLog.type).toBe('APP_START');
      expect(lastLog.payload.screen).toBe('home');
    });

    it('assigns unique IDs to events', async () => {
      jest.resetModules();
      const { eventLogger } = require('../../services/eventLogger');
      await eventLogger.log('CART_ADD_ITEM', {});
      await eventLogger.log('CART_REMOVE_ITEM', {});
      const logs = await eventLogger.getLogs();
      const ids = logs.map((l: any) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('records timestamp', async () => {
      jest.resetModules();
      const { eventLogger } = require('../../services/eventLogger');
      const before = Date.now();
      await eventLogger.log('CHECKOUT_START', {});
      const after = Date.now();
      const logs = await eventLogger.getLogs();
      const lastLog = logs[logs.length - 1];
      expect(lastLog.timestamp).toBeGreaterThanOrEqual(before);
      expect(lastLog.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('getLogs', () => {
    it('returns empty array when no logs', async () => {
      jest.resetModules();
      const { eventLogger } = require('../../services/eventLogger');
      const logs = await eventLogger.getLogs();
      expect(logs).toEqual([]);
    });

    it('filters by type', async () => {
      jest.resetModules();
      const { eventLogger } = require('../../services/eventLogger');
      await eventLogger.log('APP_START', {});
      await eventLogger.log('CART_ADD_ITEM', {});
      await eventLogger.log('APP_START', {});

      const filtered = await eventLogger.getLogs({ type: 'APP_START' });
      expect(filtered.length).toBe(2);
      expect(filtered.every((l: any) => l.type === 'APP_START')).toBe(true);
    });

    it('limits results', async () => {
      jest.resetModules();
      const { eventLogger } = require('../../services/eventLogger');
      for (let i = 0; i < 10; i++) {
        await eventLogger.log('CART_ADD_ITEM', { i });
      }

      const limited = await eventLogger.getLogs({ limit: 3 });
      expect(limited.length).toBe(3);
    });
  });

  describe('clearLogs', () => {
    it('clears all logs', async () => {
      jest.resetModules();
      const { eventLogger } = require('../../services/eventLogger');
      await eventLogger.log('APP_START', {});
      await eventLogger.log('CART_ADD_ITEM', {});
      await eventLogger.clearLogs();

      const logs = await eventLogger.getLogs();
      expect(logs).toEqual([]);
    });
  });

  describe('exportLogs', () => {
    it('returns JSON string', async () => {
      jest.resetModules();
      const { eventLogger } = require('../../services/eventLogger');
      await eventLogger.log('APP_START', { test: true });
      const exported = await eventLogger.exportLogs();
      expect(typeof exported).toBe('string');
      const parsed = JSON.parse(exported);
      expect(Array.isArray(parsed)).toBe(true);
    });
  });
});
