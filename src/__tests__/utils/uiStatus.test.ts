/**
 * Tests for utils/uiStatus
 * Covers: POS_MESSAGES, getPrimaryTone, composePosMessage
 */
import {
  POS_MESSAGES,
  getPrimaryTone,
  composePosMessage,
  type UiStatus,
} from '../../utils/uiStatus';

const baseStatus: UiStatus = {
  storeActive: true,
  deviceActive: true,
  pendingOutboxCount: 0,
  networkOnline: true,
};

describe('uiStatus', () => {
  describe('POS_MESSAGES', () => {
    it('has required message keys', () => {
      expect(POS_MESSAGES.storeInactive).toBeTruthy();
      expect(POS_MESSAGES.deviceInactive).toBeTruthy();
      expect(POS_MESSAGES.offline).toBeTruthy();
      expect(typeof POS_MESSAGES.syncPending).toBe('function');
    });

    it('syncPending returns formatted message', () => {
      expect(POS_MESSAGES.syncPending(5)).toContain('5');
    });
  });

  describe('getPrimaryTone', () => {
    it('returns success for normal state', () => {
      expect(getPrimaryTone(baseStatus)).toBe('success');
    });

    it('returns error when device inactive', () => {
      expect(getPrimaryTone({ ...baseStatus, deviceActive: false })).toBe('error');
    });

    it('returns error when store inactive', () => {
      expect(getPrimaryTone({ ...baseStatus, storeActive: false })).toBe('error');
    });

    it('returns warning when offline', () => {
      expect(getPrimaryTone({ ...baseStatus, networkOnline: false })).toBe('warning');
    });

    it('returns warning when pending outbox', () => {
      expect(getPrimaryTone({ ...baseStatus, pendingOutboxCount: 3 })).toBe('warning');
    });

    it('returns warning when scanner not ready', () => {
      expect(getPrimaryTone({ ...baseStatus, cameraAvailable: false, scannerOk: false })).toBe('warning');
    });

    it('returns success when camera not available but scanner ok', () => {
      expect(getPrimaryTone({ ...baseStatus, cameraAvailable: false, scannerOk: true })).toBe('success');
    });
  });

  describe('composePosMessage', () => {
    it('returns "Ready for billing" for normal state', () => {
      expect(composePosMessage(baseStatus)).toBe('Ready for billing');
    });

    it('returns "Action required" when device inactive', () => {
      expect(composePosMessage({ ...baseStatus, deviceActive: false })).toBe('Action required');
    });

    it('returns "Action required" when store inactive', () => {
      expect(composePosMessage({ ...baseStatus, storeActive: false })).toBe('Action required');
    });

    it('returns "Offline mode" when offline and no pending', () => {
      expect(composePosMessage({ ...baseStatus, networkOnline: false })).toBe('Offline mode');
    });

    it('returns "Sync pending" when offline with pending outbox', () => {
      expect(composePosMessage({ ...baseStatus, networkOnline: false, pendingOutboxCount: 3 })).toBe('Sync pending');
    });

    it('returns "Syncing..." when online with pending outbox', () => {
      expect(composePosMessage({ ...baseStatus, pendingOutboxCount: 5 })).toBe('Syncing...');
    });

    it('returns "Scanner not ready" when scanner unavailable', () => {
      expect(composePosMessage({ ...baseStatus, cameraAvailable: false, scannerOk: false })).toBe('Scanner not ready');
    });
  });
});
