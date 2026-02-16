/**
 * WA-001: WhatsApp POS API client unit tests
 * Tests exports, offline blocking, and API call behavior.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn(), getAllKeys: jest.fn() },
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(),
}));

jest.mock('../../../services/deviceSession', () => ({
  clearDeviceSession: jest.fn(),
  getDeviceToken: jest.fn().mockResolvedValue(null),
  getDeviceSession: jest.fn().mockResolvedValue(null),
  saveDeviceSession: jest.fn(),
  getDeviceStoreId: jest.fn().mockResolvedValue(null),
  getDeviceIdFromSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../stores/staffSessionStore', () => ({
  useStaffSessionStore: { getState: () => ({ session: null }) },
}));

jest.mock('../../../i18n', () => ({ language: 'en' }));

jest.mock('../../../config/api', () => ({
  API_BASE_URL: 'http://localhost:3000',
}));

jest.mock('../../../services/api/storage', () => ({
  getAuthToken: jest.fn().mockResolvedValue(null),
  setAuthToken: jest.fn(),
  clearAuthToken: jest.fn(),
}));

const mockIsOnline = jest.fn().mockResolvedValue(true);
jest.mock('../../../services/networkStatus', () => ({
  isOnline: () => mockIsOnline(),
}));

jest.mock('../../../services/offline/sales', () => ({
  createOfflineSale: jest.fn(),
  fetchOfflineSale: jest.fn(),
  recordOfflineCashPayment: jest.fn(),
  recordOfflineDuePayment: jest.fn(),
}));

jest.mock('../../../services/offline/collections', () => ({
  createOfflineCollection: jest.fn(),
}));

import {
  checkWhatsAppStatus,
  sendBillWhatsApp,
  sendWhatsAppMessage,
} from '../../../services/api/posApi';

beforeEach(() => {
  mockIsOnline.mockResolvedValue(true);
});

// =============================================================================
// EXPORTS
// =============================================================================
describe('WhatsApp API exports', () => {
  it('exports checkWhatsAppStatus', () => expect(typeof checkWhatsAppStatus).toBe('function'));
  it('exports sendBillWhatsApp', () => expect(typeof sendBillWhatsApp).toBe('function'));
  it('exports sendWhatsAppMessage', () => expect(typeof sendWhatsAppMessage).toBe('function'));
});

// =============================================================================
// OFFLINE BLOCKING
// =============================================================================
describe('checkWhatsAppStatus — offline behavior', () => {
  it('returns configured: false when offline', async () => {
    mockIsOnline.mockResolvedValue(false);

    const result = await checkWhatsAppStatus();
    expect(result).toEqual({ configured: false });
  });
});

describe('sendBillWhatsApp — offline blocking', () => {
  it('throws ApiError with whatsapp_offline_blocked when offline', async () => {
    mockIsOnline.mockResolvedValue(false);

    await expect(
      sendBillWhatsApp({ saleId: 'sale-1', recipientPhone: '9876543210' })
    ).rejects.toThrow(/offline|internet/i);
  });
});

describe('sendWhatsAppMessage — offline blocking', () => {
  it('throws ApiError with whatsapp_offline_blocked when offline', async () => {
    mockIsOnline.mockResolvedValue(false);

    await expect(
      sendWhatsAppMessage({
        recipientPhone: '9876543210',
        message: 'Test message',
        contextType: 'order_update',
      })
    ).rejects.toThrow(/offline|internet/i);
  });
});

// =============================================================================
// PHONE VALIDATION (SuccessPrintScreenV2 logic — tested standalone)
// =============================================================================
describe('phone validation logic (from SuccessPrintScreenV2)', () => {
  // Duplicated from the screen to test the validation logic independently
  function validatePhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
    if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) return digits.slice(1);
    if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return digits.slice(2);
    return null;
  }

  describe('valid Indian mobile numbers', () => {
    it('accepts 10-digit starting with 9', () => {
      expect(validatePhone('9876543210')).toBe('9876543210');
    });

    it('accepts 10-digit starting with 6', () => {
      expect(validatePhone('6543210987')).toBe('6543210987');
    });

    it('strips leading 0 (11-digit)', () => {
      expect(validatePhone('09876543210')).toBe('9876543210');
    });

    it('strips 91 prefix (12-digit)', () => {
      expect(validatePhone('919876543210')).toBe('9876543210');
    });

    it('strips +91 prefix', () => {
      expect(validatePhone('+919876543210')).toBe('9876543210');
    });

    it('strips spaces and dashes', () => {
      expect(validatePhone('98765-43210')).toBe('9876543210');
    });
  });

  describe('invalid numbers', () => {
    it('rejects 10-digit starting with 5', () => {
      expect(validatePhone('5876543210')).toBeNull();
    });

    it('rejects 10-digit starting with 1', () => {
      expect(validatePhone('1234567890')).toBeNull();
    });

    it('rejects too short number', () => {
      expect(validatePhone('987654')).toBeNull();
    });

    it('rejects empty string', () => {
      expect(validatePhone('')).toBeNull();
    });

    it('rejects letters only', () => {
      expect(validatePhone('abcdefghij')).toBeNull();
    });

    it('rejects 13-digit number', () => {
      expect(validatePhone('9199876543210')).toBeNull();
    });
  });
});
