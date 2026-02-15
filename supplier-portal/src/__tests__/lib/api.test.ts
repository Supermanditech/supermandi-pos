/**
 * Deep tests for supplier-portal API client (lib/api.ts)
 * Covers: token management, apiFetch, 401 handling, token refresh,
 * auth APIs, product APIs, order APIs, KYC APIs, payout APIs, invoice APIs,
 * registration APIs, file uploads, error handling, timeouts
 */
import {
  ApiError,
  hasAuthCookie,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  getRefreshToken,
  setRefreshToken,
  refreshAccessToken,
  logoutApi,
  apiFetch,
  registerSupplier,
  loginSupplier,
  getSupplierProfile,
  updateSupplierProfile,
  changePassword,
  requestPasswordReset,
  resetPassword,
  phoneOtpRegister,
  phoneOtpLogin,
  sendVerificationEmail,
  verifyEmail,
  getEmailVerificationStatus,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductsCsv,
  getOrders,
  updateOrderStatus,
  getDashboardStats,
  verifyIFSC,
  verifyBankAccount,
  getKycDocuments,
  uploadKycDocument,
  deleteKycDocument,
  getKycStatus,
  getPayouts,
  getPayoutSummary,
  getPayoutById,
  getPayoutOrders,
  updateOrderShipment,
  updateOrderItemStatus,
  getOrderNotes,
  addOrderNote,
  markOrdersRead,
  confirmOrderDelivery,
  getOrderDetail,
  getOrderEvents,
  getSupplierInvoices,
  getSupplierInvoiceDetail,
  checkSupplierGstin,
  createSupplierApplication,
  verifySupplierOtp,
  submitSupplierKyc,
  getSupplierApplicationStatus,
  resumeSupplierApplication,
  lookupSupplierRegistration,
  uploadSupplierDocument,
  getOrderStreamUrl,
  uploadProductImage,
} from '../../lib/api';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock document.cookie for hasAuthCookie
let mockCookie = '';
Object.defineProperty(document, 'cookie', {
  get: () => mockCookie,
  set: (v: string) => { mockCookie = v; },
  configurable: true,
});

// Helper to create mock Response
function mockResponse(body: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
    headers: new Headers(),
    redirected: false,
    statusText: status === 200 ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: '',
    clone: jest.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: jest.fn(),
    blob: jest.fn(),
    formData: jest.fn(),
    text: jest.fn(),
    bytes: jest.fn(),
  } as unknown as Response;
}

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCookie = '';
  clearAuthToken();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ══════════════════════════════════════════════════════════════════════════
// 1. ApiError class
// ══════════════════════════════════════════════════════════════════════════

describe('ApiError', () => {
  it('creates error with status, code, and message', () => {
    const err = new ApiError(404, 'NOT_FOUND', 'Resource not found');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Resource not found');
  });

  it('inherits from Error', () => {
    const err = new ApiError(500, 'INTERNAL', 'Server error');
    expect(err instanceof Error).toBe(true);
    expect(err.stack).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. Token Management
// ══════════════════════════════════════════════════════════════════════════

describe('Token Management', () => {
  describe('hasAuthCookie', () => {
    it('returns false when no cookie', () => {
      mockCookie = '';
      expect(hasAuthCookie()).toBe(false);
    });

    it('returns true when sm_auth cookie present', () => {
      mockCookie = 'sm_auth=1; other=val';
      expect(hasAuthCookie()).toBe(true);
    });

    it('returns false for partial match', () => {
      mockCookie = 'not_sm_auth_x=1';
      expect(hasAuthCookie()).toBe(false);
    });
  });

  describe('getAuthToken / setAuthToken / clearAuthToken', () => {
    it('starts null', () => {
      expect(getAuthToken()).toBeNull();
    });

    it('sets and gets token', () => {
      setAuthToken('tok123');
      expect(getAuthToken()).toBe('tok123');
    });

    it('clears token', () => {
      setAuthToken('tok123');
      clearAuthToken();
      expect(getAuthToken()).toBeNull();
    });

    it('clearAuthToken removes localStorage keys', () => {
      const spy = jest.spyOn(Storage.prototype, 'removeItem');
      clearAuthToken();
      expect(spy).toHaveBeenCalledWith('supplier_token');
      expect(spy).toHaveBeenCalledWith('supplier_refresh_token');
      spy.mockRestore();
    });
  });

  describe('getRefreshToken / setRefreshToken', () => {
    it('returns "cookie" when auth cookie present', () => {
      mockCookie = 'sm_auth=1';
      expect(getRefreshToken()).toBe('cookie');
    });

    it('returns null when no auth cookie', () => {
      mockCookie = '';
      expect(getRefreshToken()).toBeNull();
    });

    it('setRefreshToken is a no-op', () => {
      setRefreshToken('tok');
      // Should not throw
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. refreshAccessToken
// ══════════════════════════════════════════════════════════════════════════

describe('refreshAccessToken', () => {
  it('returns false when no auth cookie', async () => {
    mockCookie = '';
    const result = await refreshAccessToken();
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls refresh endpoint and sets new token on success', async () => {
    mockCookie = 'sm_auth=1';
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { accessToken: 'newToken' } }));

    const result = await refreshAccessToken();

    expect(result).toBe(true);
    expect(getAuthToken()).toBe('newToken');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/supplier/auth/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });

  it('returns false on non-ok response', async () => {
    mockCookie = 'sm_auth=1';
    mockFetch.mockResolvedValueOnce(mockResponse({}, 401, false));

    const result = await refreshAccessToken();
    expect(result).toBe(false);
  });

  it('returns false on network error', async () => {
    mockCookie = 'sm_auth=1';
    mockFetch.mockRejectedValueOnce(new Error('Network down'));

    const result = await refreshAccessToken();
    expect(result).toBe(false);
  });

  it('returns false when response has no accessToken', async () => {
    mockCookie = 'sm_auth=1';
    mockFetch.mockResolvedValueOnce(mockResponse({ data: {} }));

    const result = await refreshAccessToken();
    expect(result).toBe(false);
  });

  it('deduplicates concurrent refresh calls', async () => {
    mockCookie = 'sm_auth=1';
    mockFetch.mockResolvedValue(mockResponse({ data: { accessToken: 'newTok' } }));

    const [r1, r2] = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    // Should only call fetch once (deduplicated)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. logoutApi
// ══════════════════════════════════════════════════════════════════════════

describe('logoutApi', () => {
  it('calls logout endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));
    await logoutApi();
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/supplier/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });

  it('swallows errors silently', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    // Should not throw
    await expect(logoutApi()).resolves.toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. apiFetch — core fetch wrapper
// ══════════════════════════════════════════════════════════════════════════

describe('apiFetch', () => {
  it('sends GET request with correct headers', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 1 } }));

    const result = await apiFetch('/api/v1/test');

    expect(result).toEqual({ id: 1 });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/test',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });

  it('includes Authorization header when token is set', async () => {
    setAuthToken('myToken');
    mockFetch.mockResolvedValueOnce(mockResponse({ data: 'ok' }));

    await apiFetch('/api/v1/secure');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/secure',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer myToken' }),
      })
    );
  });

  it('unwraps data field from response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { name: 'Test' } }));
    const result = await apiFetch('/api/v1/test');
    expect(result).toEqual({ name: 'Test' });
  });

  it('returns full response if no data field', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ name: 'Direct' }));
    const result = await apiFetch('/api/v1/test');
    expect(result).toEqual({ name: 'Direct' });
  });

  it('throws ApiError on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: { code: 'BAD_REQUEST', message: 'Invalid input' } }, 400, false)
    );

    try {
      await apiFetch('/api/v1/test');
      throw new Error('Expected ApiError');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(400);
      expect((e as ApiError).code).toBe('BAD_REQUEST');
      expect((e as ApiError).message).toBe('Invalid input');
    }
  });

  it('throws ApiError on JSON parse error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    } as unknown as Response);

    await expect(apiFetch('/api/v1/test')).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('throws TIMEOUT ApiError on abort', async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

    await expect(apiFetch('/api/v1/test')).rejects.toMatchObject({
      status: 408,
      code: 'TIMEOUT',
    });
  });

  it('throws NETWORK_ERROR on fetch TypeError', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(apiFetch('/api/v1/test')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('handles 401 on auth endpoint without redirect', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: { code: 'UNAUTHORIZED', message: 'Bad creds' } }, 401, false)
    );

    await expect(apiFetch('/api/v1/supplier/auth/login', { method: 'POST' })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('handles 401 on protected endpoint — attempts refresh', async () => {
    mockCookie = 'sm_auth=1';
    // First call: 401
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: { code: 'UNAUTHORIZED' } }, 401, false)
    );
    // Refresh call: success
    mockFetch.mockResolvedValueOnce(
      mockResponse({ data: { accessToken: 'newTok' } })
    );
    // Retry: success
    mockFetch.mockResolvedValueOnce(
      mockResponse({ data: { result: 'ok' } })
    );

    const result = await apiFetch('/api/v1/supplier/protected');
    expect(result).toEqual({ result: 'ok' });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 6. Auth APIs
// ══════════════════════════════════════════════════════════════════════════

describe('Auth APIs', () => {
  describe('registerSupplier', () => {
    it('sends registration data and stores token', async () => {
      const authResponse = { token: 'reg-tok', supplier: { id: 's1', email: 'a@b.com', businessName: 'Test' } };
      mockFetch.mockResolvedValueOnce(mockResponse({ data: authResponse }));

      const result = await registerSupplier({
        email: 'a@b.com',
        password: 'pass123',
        businessName: 'Test',
      });

      expect(result.token).toBe('reg-tok');
      expect(getAuthToken()).toBe('reg-tok');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/supplier/auth/register',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('loginSupplier', () => {
    it('sends login data and stores tokens', async () => {
      const authResponse = {
        token: 'login-tok',
        refreshToken: 'ref-tok',
        supplier: { id: 's1', email: 'a@b.com', businessName: 'Test' },
      };
      mockFetch.mockResolvedValueOnce(mockResponse({ data: authResponse }));

      const result = await loginSupplier({ email: 'a@b.com', password: 'pass' });

      expect(result.token).toBe('login-tok');
      expect(getAuthToken()).toBe('login-tok');
    });
  });

  describe('getSupplierProfile', () => {
    it('fetches profile', async () => {
      const profile = { id: 's1', email: 'a@b.com', businessName: 'Test', verificationStatus: 'verified' };
      mockFetch.mockResolvedValueOnce(mockResponse({ data: profile }));

      const result = await getSupplierProfile();
      expect(result.id).toBe('s1');
    });
  });

  describe('updateSupplierProfile', () => {
    it('sends PATCH to profile', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 's1', businessName: 'Updated' } }));

      const result = await updateSupplierProfile({ businessName: 'Updated' });
      expect(result.businessName).toBe('Updated');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/supplier/profile',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  describe('changePassword', () => {
    it('sends POST to change password', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: undefined }));

      await changePassword({ currentPassword: 'old', newPassword: 'new' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/supplier/auth/change-password',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('sends POST with email', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { success: true, message: 'Email sent' } }));

      const result = await requestPasswordReset('a@b.com');
      expect(result.success).toBe(true);
    });
  });

  describe('resetPassword', () => {
    it('sends POST with email, token, and new password', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { success: true, message: 'Done' } }));

      const result = await resetPassword('a@b.com', 'tok', 'newPass');
      expect(result.success).toBe(true);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 7. Phone OTP APIs
// ══════════════════════════════════════════════════════════════════════════

describe('Phone OTP APIs', () => {
  describe('phoneOtpRegister', () => {
    it('sends registration with idToken', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { success: true, message: 'Created' } }));

      const result = await phoneOtpRegister({
        idToken: 'firebase-token',
        email: 'a@b.com',
        businessName: 'Test',
      });
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/supplier/auth/firebase-register',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('phoneOtpLogin', () => {
    it('exchanges firebase token and stores JWT', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: { success: true, status: 'active', token: 'jwt-tok', refreshToken: 'ref' },
      }));

      const result = await phoneOtpLogin('firebase-token');
      expect(result.success).toBe(true);
      expect(getAuthToken()).toBe('jwt-tok');
    });

    it('does not store token when absent', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: { success: true, status: 'pending' },
      }));

      await phoneOtpLogin('firebase-token');
      expect(getAuthToken()).toBeNull();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 8. Email Verification APIs
// ══════════════════════════════════════════════════════════════════════════

describe('Email Verification APIs', () => {
  it('sendVerificationEmail calls correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { sent: true, message: 'Sent' } }));
    const result = await sendVerificationEmail();
    expect(result.sent).toBe(true);
  });

  it('verifyEmail sends code', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { success: true, message: 'Verified' } }));
    const result = await verifyEmail('123456');
    expect(result.success).toBe(true);
  });

  it('getEmailVerificationStatus returns status', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { emailVerified: true } }));
    const result = await getEmailVerificationStatus();
    expect(result.emailVerified).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 9. Products APIs
// ══════════════════════════════════════════════════════════════════════════

describe('Products APIs', () => {
  const mockProduct = {
    id: 'p1', name: 'Rice', purchasePrice: 5000, moq: 10,
    unit: 'kg', approvalStatus: 'pending', createdAt: '2026-01-01',
  };

  describe('getProducts', () => {
    it('fetches products without pagination', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: { data: [mockProduct], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
      }));
      const result = await getProducts();
      expect(result.data).toHaveLength(1);
    });

    it('passes pagination params', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { data: [], pagination: {} } }));
      await getProducts({ page: 2, limit: 10 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.anything()
      );
    });
  });

  describe('createProduct', () => {
    it('sends POST with product data', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: mockProduct }));
      const result = await createProduct({ name: 'Rice', purchasePrice: 5000 });
      expect(result.name).toBe('Rice');
    });
  });

  describe('updateProduct', () => {
    it('sends PATCH to correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { ...mockProduct, name: 'Brown Rice' } }));
      const result = await updateProduct('p1', { name: 'Brown Rice' });
      expect(result.name).toBe('Brown Rice');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/supplier/products/p1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  describe('deleteProduct', () => {
    it('sends DELETE to correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: undefined }));
      await deleteProduct('p1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/supplier/products/p1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('uploadProductsCsv', () => {
    it('rejects file over 5MB', async () => {
      const bigFile = new File(['x'.repeat(6 * 1024 * 1024)], 'big.csv', { type: 'text/csv' });
      await expect(uploadProductsCsv(bigFile)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    });

    it('uploads valid CSV', async () => {
      const file = new File(['name,price\nRice,50'], 'products.csv', { type: 'text/csv' });
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: { totalRows: 1, imported: 1, skipped: 0, errors: [] },
      }));

      const result = await uploadProductsCsv(file);
      expect(result.imported).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/supplier/products/csv-upload',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('handles 401 on CSV upload', async () => {
      const file = new File(['data'], 'test.csv');
      mockFetch.mockResolvedValueOnce({
        ok: false, status: 401,
        json: jest.fn().mockResolvedValue({}),
      } as unknown as Response);

      await expect(uploadProductsCsv(file)).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('uploadProductImage', () => {
    it('rejects file over 5MB', async () => {
      const bigFile = new File(['x'.repeat(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
      await expect(uploadProductImage(bigFile)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    });

    it('rejects invalid file type', async () => {
      const file = new File(['data'], 'test.gif', { type: 'image/gif' });
      await expect(uploadProductImage(file)).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
    });

    it('uploads valid image without progress', async () => {
      const file = new File(['imagedata'], 'photo.jpg', { type: 'image/jpeg' });
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: { imageUrl: 'https://cdn.example.com/img.jpg', thumbnailUrl: 'https://cdn.example.com/thumb.jpg' },
      }));

      const result = await uploadProductImage(file);
      expect(result.imageUrl).toBe('https://cdn.example.com/img.jpg');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 10. Orders APIs
// ══════════════════════════════════════════════════════════════════════════

describe('Orders APIs', () => {
  const mockOrder = {
    id: 'o1', storeId: 's1', storeName: 'Store', items: [],
    totalAmount: 10000, status: 'pending', createdAt: '2026-01-01',
  };

  it('getOrders fetches orders with pagination', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { data: [mockOrder], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
    }));
    const result = await getOrders({ page: 1 });
    expect(result.data).toHaveLength(1);
  });

  it('updateOrderStatus sends PATCH', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { ...mockOrder, status: 'confirmed' } }));
    const result = await updateOrderStatus('o1', 'confirmed');
    expect(result.status).toBe('confirmed');
  });

  it('updateOrderShipment sends shipment info', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: mockOrder }));
    await updateOrderShipment('o1', { trackingNumber: 'TRK123', carrier: 'BlueDart' });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/supplier/orders/o1/shipment',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('updateOrderItemStatus sends PATCH to item', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { id: 'i1', status: 'received', receivedQuantity: 10, orderedQuantity: 10, updatedAt: '2026-01-01' },
    }));
    const result = await updateOrderItemStatus('o1', 'i1', { status: 'received', receivedQuantity: 10 });
    expect(result.status).toBe('received');
  });

  it('getOrderNotes fetches notes', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: [{ id: 'n1', authorType: 'supplier', authorName: 'Test', message: 'Hello', isInternal: false, createdAt: '2026-01-01' }],
    }));
    const result = await getOrderNotes('o1');
    expect(result).toHaveLength(1);
  });

  it('addOrderNote sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { id: 'n2', authorType: 'supplier', authorName: 'Me', message: 'Note', isInternal: false, createdAt: '2026-01-01' },
    }));
    const result = await addOrderNote('o1', { message: 'Note' });
    expect(result.message).toBe('Note');
  });

  it('markOrdersRead sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { success: true } }));
    const result = await markOrdersRead();
    expect(result.success).toBe(true);
  });

  it('confirmOrderDelivery sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { id: 'o1', status: 'delivered', actualDeliveryDate: '2026-01-05', updatedAt: '2026-01-05' },
    }));
    const result = await confirmOrderDelivery('o1', { deliveryNotes: 'Delivered at door' });
    expect(result.status).toBe('delivered');
  });

  it('getOrderDetail fetches order detail', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { id: 'o1', orderNumber: 'ORD-001', storeId: 's1', storeName: 'Store', items: [], status: 'pending', totalAmount: 10000, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    }));
    const result = await getOrderDetail('o1');
    expect(result.orderNumber).toBe('ORD-001');
  });

  it('getOrderEvents fetches timeline', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: [{ id: 'e1', eventType: 'created', actorType: 'system', metadata: null, createdAt: '2026-01-01' }],
    }));
    const result = await getOrderEvents('o1');
    expect(result).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 11. Dashboard APIs
// ══════════════════════════════════════════════════════════════════════════

describe('Dashboard APIs', () => {
  it('getDashboardStats returns stats', async () => {
    const stats = {
      totalProducts: 50, pendingProducts: 5, approvedProducts: 45,
      totalOrders: 100, pendingOrders: 10, totalRevenue: 500000, newOrdersCount: 3,
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: stats }));
    const result = await getDashboardStats();
    expect(result.totalProducts).toBe(50);
    expect(result.newOrdersCount).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 12. KYC APIs
// ══════════════════════════════════════════════════════════════════════════

describe('KYC APIs', () => {
  it('verifyIFSC sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { valid: true, bankName: 'SBI', branchName: 'Main', address: 'Delhi', city: 'Delhi', state: 'Delhi', ifsc: 'SBIN0000001' },
    }));
    const result = await verifyIFSC('SBIN0000001');
    expect(result.valid).toBe(true);
    expect(result.bankName).toBe('SBI');
  });

  it('verifyBankAccount sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { verified: true, bankName: 'SBI', branchName: 'Main', verificationRef: 'ref123', message: 'OK' },
    }));
    const result = await verifyBankAccount({ accountNumber: '1234', ifscCode: 'SBIN0000001', accountName: 'Test' });
    expect(result.verified).toBe(true);
  });

  it('getKycDocuments fetches documents', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: [] }));
    const result = await getKycDocuments();
    expect(result).toEqual([]);
  });

  it('uploadKycDocument rejects oversized files', async () => {
    const file = new File(['x'.repeat(6 * 1024 * 1024)], 'big.pdf');
    await expect(uploadKycDocument('pan_card', file)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('uploadKycDocument sends file', async () => {
    const file = new File(['data'], 'pan.pdf', { type: 'application/pdf' });
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { id: 'd1', documentType: 'pan_card', fileName: 'pan.pdf', status: 'pending', message: 'Uploaded' },
    }));
    const result = await uploadKycDocument('pan_card', file);
    expect(result.documentType).toBe('pan_card');
  });

  it('deleteKycDocument sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { success: true, message: 'Deleted' } }));
    const result = await deleteKycDocument('d1');
    expect(result.success).toBe(true);
  });

  it('getKycStatus fetches status', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { payoutReady: false, requirements: { emailVerified: true, profileVerified: false }, documents: {}, message: 'Incomplete' },
    }));
    const result = await getKycStatus();
    expect(result.payoutReady).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 13. Payouts APIs
// ══════════════════════════════════════════════════════════════════════════

describe('Payouts APIs', () => {
  it('getPayouts fetches paginated payouts', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
    }));
    const result = await getPayouts({ page: 1 });
    expect(result.data).toEqual([]);
  });

  it('getPayoutSummary fetches summary', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { totalRevenuePaise: 100000, totalPaidPaise: 50000, totalPendingPaise: 50000, totalProcessingPaise: 0, availableBalancePaise: 50000, completedPayouts: 2, pendingPayouts: 1 },
    }));
    const result = await getPayoutSummary();
    expect(result.totalRevenuePaise).toBe(100000);
  });

  it('getPayoutById fetches single payout', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { id: 'pay1', amountPaise: 10000, currency: 'INR', status: 'completed' },
    }));
    const result = await getPayoutById('pay1');
    expect(result.id).toBe('pay1');
  });

  it('getPayoutOrders fetches payout breakdown', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: [] }));
    const result = await getPayoutOrders('pay1');
    expect(result).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 14. Invoice APIs
// ══════════════════════════════════════════════════════════════════════════

describe('Invoice APIs', () => {
  it('getSupplierInvoices fetches list with filters', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { data: [], total: 0 } }));
    const result = await getSupplierInvoices({ page: 1, limit: 10, status: 'issued' });
    expect(result.total).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('status=issued'),
      expect.anything()
    );
  });

  it('getSupplierInvoiceDetail unwraps nested data', async () => {
    const invoice = { id: 'inv1', invoiceNumber: 'INV-001', status: 'issued' };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { data: invoice } }));
    const result = await getSupplierInvoiceDetail('inv1');
    expect(result.invoiceNumber).toBe('INV-001');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 15. Registration APIs
// ══════════════════════════════════════════════════════════════════════════

describe('Registration APIs', () => {
  it('checkSupplierGstin sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { exists: false, message: 'Not found' } }));
    const result = await checkSupplierGstin('22AAAAA0000A1Z5');
    expect(result.exists).toBe(false);
  });

  it('createSupplierApplication sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { success: true, application: { id: 'app1', status: 'DRAFT' } },
    }));
    const result = await createSupplierApplication({
      phone: '9876543210', email: 'a@b.com', businessName: 'Test',
      ownerName: 'Owner', gstin: '22AAAAA0000A1Z5',
    });
    expect(result.success).toBe(true);
  });

  it('verifySupplierOtp sends POST with applicationId', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { success: true, status: 'OTP_VERIFIED' },
    }));
    const result = await verifySupplierOtp('firebase-token', 'app1');
    expect(result.success).toBe(true);
  });

  it('submitSupplierKyc sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { success: true, status: 'KYC_SUBMITTED', message: 'Done' },
    }));
    const result = await submitSupplierKyc('app1');
    expect(result.success).toBe(true);
  });

  it('getSupplierApplicationStatus fetches status', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { success: true, application: { id: 'app1', status: 'UNDER_REVIEW', businessName: 'Test', ownerName: 'Owner', gstin: '22AAAAA0000A1Z5', phoneVerified: true } },
    }));
    const result = await getSupplierApplicationStatus('app1');
    expect(result.application.status).toBe('UNDER_REVIEW');
  });

  it('resumeSupplierApplication sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { success: true, application: { id: 'app1', status: 'DRAFT' }, resumed: true },
    }));
    const result = await resumeSupplierApplication('22AAAAA0000A1Z5', '9876543210');
    expect(result.resumed).toBe(true);
  });

  it('lookupSupplierRegistration fetches by phone', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { exists: true, application_id: 'app1', status: 'ACTIVE', nextStep: 'LOGIN_ALLOWED', message: 'Found' },
    }));
    const result = await lookupSupplierRegistration('+919876543210');
    expect(result.exists).toBe(true);
    expect(result.nextStep).toBe('LOGIN_ALLOWED');
  });

  it('uploadSupplierDocument rejects oversized file', async () => {
    const file = new File(['x'.repeat(6 * 1024 * 1024)], 'big.pdf');
    await expect(uploadSupplierDocument('app1', 'pan_card', file)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('uploadSupplierDocument sends FormData', async () => {
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { success: true, documentId: 'd1', message: 'Uploaded' },
    }));
    const result = await uploadSupplierDocument('app1', 'pan_card', file);
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 16. SSE Stream URL
// ══════════════════════════════════════════════════════════════════════════

describe('getOrderStreamUrl', () => {
  it('returns null when no auth cookie', () => {
    mockCookie = '';
    expect(getOrderStreamUrl()).toBeNull();
  });

  it('returns stream URL when authenticated', () => {
    mockCookie = 'sm_auth=1';
    const url = getOrderStreamUrl();
    expect(url).toBe('/api/v1/supplier/orders/stream');
  });
});
