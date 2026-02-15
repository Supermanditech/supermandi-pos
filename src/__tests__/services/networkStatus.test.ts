/**
 * Tests for services/networkStatus
 * Covers: isOnline, subscribeNetworkStatus
 */

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
  addEventListener: jest.fn(),
}));

import { isOnline, subscribeNetworkStatus } from '../../services/networkStatus';
import NetInfo from '@react-native-community/netinfo';

describe('networkStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isOnline', () => {
    it('returns true when connected', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
      const result = await isOnline();
      expect(result).toBe(true);
    });

    it('returns false when disconnected', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false });
      const result = await isOnline();
      expect(result).toBe(false);
    });

    it('returns false when isConnected is null', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: null });
      const result = await isOnline();
      expect(result).toBe(false);
    });

    it('returns false when isConnected is undefined', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({});
      const result = await isOnline();
      expect(result).toBe(false);
    });
  });

  describe('subscribeNetworkStatus', () => {
    it('subscribes to NetInfo events', () => {
      const callback = jest.fn();
      const mockUnsubscribe = jest.fn();
      (NetInfo.addEventListener as jest.Mock).mockReturnValue(mockUnsubscribe);

      const unsubscribe = subscribeNetworkStatus(callback);
      expect(NetInfo.addEventListener).toHaveBeenCalledWith(expect.any(Function));
      expect(typeof unsubscribe).toBe('function');
    });

    it('passes online status to callback', () => {
      let capturedHandler: any;
      (NetInfo.addEventListener as jest.Mock).mockImplementation((handler) => {
        capturedHandler = handler;
        return jest.fn();
      });

      const callback = jest.fn();
      subscribeNetworkStatus(callback);

      // Simulate connected event
      capturedHandler({ isConnected: true });
      expect(callback).toHaveBeenCalledWith(true);

      // Simulate disconnected event
      capturedHandler({ isConnected: false });
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('returns unsubscribe function', () => {
      const mockUnsubscribe = jest.fn();
      (NetInfo.addEventListener as jest.Mock).mockReturnValue(mockUnsubscribe);

      const unsubscribe = subscribeNetworkStatus(jest.fn());
      expect(unsubscribe).toBe(mockUnsubscribe);
    });
  });
});
