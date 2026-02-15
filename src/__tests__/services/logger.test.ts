/**
 * Tests for services/logger
 * Covers: logger methods, getCrashReports, clearCrashReports, installGlobalErrorHandler, logAppStartup
 */

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0', extra: { API_URL: 'http://test' } },
  platform: 'android',
  manifest: { version: '1.0.0' },
  deviceName: 'TestDevice',
}));

import { logger, getCrashReports, clearCrashReports, installGlobalErrorHandler, logAppStartup } from '../../services/logger';

describe('logger', () => {
  beforeEach(() => {
    clearCrashReports();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logger methods', () => {
    it('has debug method', () => {
      expect(typeof logger.debug).toBe('function');
      logger.debug('Test', 'debug message');
    });

    it('has info method', () => {
      expect(typeof logger.info).toBe('function');
      logger.info('Test', 'info message');
    });

    it('has warn method', () => {
      expect(typeof logger.warn).toBe('function');
      logger.warn('Test', 'warn message');
    });

    it('has error method', () => {
      expect(typeof logger.error).toBe('function');
      logger.error('Test', 'error message');
    });

    it('error tracks crash reports', () => {
      logger.error('TestTag', 'test error', new Error('boom'));
      const reports = getCrashReports();
      expect(reports.length).toBeGreaterThan(0);
      expect(reports[0].tag).toBe('TestTag');
      expect(reports[0].message).toBe('test error');
      expect(reports[0].error).toContain('boom');
    });

    it('error handles non-Error objects', () => {
      logger.error('Test', 'string error', 'just a string');
      const reports = getCrashReports();
      expect(reports.length).toBeGreaterThan(0);
      expect(reports[0].error).toBe('just a string');
    });

    it('error handles undefined error', () => {
      logger.error('Test', 'no error object');
      const reports = getCrashReports();
      expect(reports.length).toBeGreaterThan(0);
    });
  });

  describe('getCrashReports', () => {
    it('returns empty array initially', () => {
      expect(getCrashReports()).toEqual([]);
    });

    it('returns copy of reports', () => {
      logger.error('Test', 'error 1');
      const reports1 = getCrashReports();
      const reports2 = getCrashReports();
      expect(reports1).not.toBe(reports2); // Different array instances
      expect(reports1).toEqual(reports2);
    });
  });

  describe('clearCrashReports', () => {
    it('clears all reports', () => {
      logger.error('Test', 'error 1');
      logger.error('Test', 'error 2');
      expect(getCrashReports().length).toBe(2);
      clearCrashReports();
      expect(getCrashReports().length).toBe(0);
    });
  });

  describe('crash report limits', () => {
    it('keeps only MAX_CRASH_REPORTS entries', () => {
      for (let i = 0; i < 60; i++) {
        logger.error('Test', `error ${i}`);
      }
      const reports = getCrashReports();
      expect(reports.length).toBeLessThanOrEqual(50);
    });
  });

  describe('installGlobalErrorHandler', () => {
    it('can be called without error', () => {
      expect(() => installGlobalErrorHandler()).not.toThrow();
    });

    it('is idempotent', () => {
      installGlobalErrorHandler();
      installGlobalErrorHandler(); // Should not throw
    });
  });

  describe('logAppStartup', () => {
    it('can be called without error', () => {
      expect(() => logAppStartup()).not.toThrow();
    });
  });
});
