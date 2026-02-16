// TEST-005: Zod Contract Tests — POS API Endpoints
// Validates that API response shapes match expected contracts.
// Prevents accidental breaking changes to POS ↔ Backend integration.

import { z } from 'zod';

// =============================================================================
// SHARED SCHEMAS
// =============================================================================

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/));
const MoneyMinorSchema = z.number().int(); // All money values in paisa (minor units)

// =============================================================================
// AUTH CONTRACTS
// =============================================================================

export const AuthSendOtpResponse = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    otpSent: z.boolean(),
    expiresIn: z.number().optional(),
  }).optional(),
});

export const AuthVerifyOtpResponse = z.object({
  success: z.boolean(),
  data: z.object({
    token: z.string(),
    refreshToken: z.string(),
    user: z.object({
      id: UuidSchema,
      phone: z.string(),
      name: z.string().optional().nullable(),
      role: z.string(),
      storeId: UuidSchema.optional().nullable(),
    }),
  }).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
});

export const AuthRefreshResponse = z.object({
  success: z.boolean(),
  data: z.object({
    token: z.string(),
    refreshToken: z.string(),
  }).optional(),
});

// =============================================================================
// POS SCAN CONTRACTS
// =============================================================================

export const ScanResolveResponse = z.object({
  success: z.boolean(),
  data: z.object({
    product: z.object({
      id: UuidSchema,
      name: z.string(),
      barcode: z.string().nullable().optional(),
      mrpMinor: MoneyMinorSchema,
      sellingPriceMinor: MoneyMinorSchema,
      unit: z.string(),
      categoryName: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      stock: z.number().optional(),
    }).nullable().optional(),
    found: z.boolean(),
  }).optional(),
});

// =============================================================================
// POS SALES CONTRACTS
// =============================================================================

export const SaleItemSchema = z.object({
  productId: UuidSchema,
  name: z.string(),
  quantity: z.number().positive(),
  unitPriceMinor: MoneyMinorSchema,
  totalMinor: MoneyMinorSchema,
  unit: z.string().optional(),
});

export const RecordSaleResponse = z.object({
  success: z.boolean(),
  data: z.object({
    saleId: UuidSchema,
    invoiceNumber: z.string().optional(),
    totalMinor: MoneyMinorSchema,
    items: z.array(SaleItemSchema).optional(),
    createdAt: TimestampSchema.optional(),
  }).optional(),
});

// =============================================================================
// POS INVENTORY CONTRACTS
// =============================================================================

export const StockLevelResponse = z.object({
  success: z.boolean(),
  data: z.object({
    storeId: UuidSchema,
    products: z.array(z.object({
      productId: UuidSchema,
      name: z.string().optional(),
      currentStock: z.number(),
      unit: z.string().optional(),
    })),
  }).optional(),
});

export const StockInResponse = z.object({
  success: z.boolean(),
  data: z.object({
    transactionId: UuidSchema.optional(),
    productId: UuidSchema,
    quantityAdded: z.number(),
    newStock: z.number().optional(),
  }).optional(),
});

// =============================================================================
// POS STORE CONFIG CONTRACTS
// =============================================================================

export const StoreConfigResponse = z.object({
  success: z.boolean(),
  data: z.object({
    store: z.object({
      id: UuidSchema,
      name: z.string(),
      code: z.string(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
      phone: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
    }),
  }).optional(),
});

// =============================================================================
// POS DAILY CLOSING CONTRACTS
// =============================================================================

export const DailyClosingResponse = z.object({
  success: z.boolean(),
  data: z.object({
    closingId: UuidSchema.optional(),
    date: z.string(),
    totalSalesMinor: MoneyMinorSchema.optional(),
    totalTransactions: z.number().optional(),
    cashCollectedMinor: MoneyMinorSchema.optional(),
    status: z.string().optional(),
  }).optional(),
});

// =============================================================================
// ERROR RESPONSE CONTRACT (Standard across all endpoints)
// =============================================================================

export const ErrorResponse = z.object({
  success: z.literal(false).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).optional(),
  message: z.string().optional(),
});

// =============================================================================
// POS PAYMENT CONTRACTS
// =============================================================================

export const PaymentRecordResponse = z.object({
  success: z.boolean(),
  data: z.object({
    paymentId: UuidSchema.optional(),
    saleId: UuidSchema.optional(),
    method: z.enum(['CASH', 'UPI', 'CARD', 'BNPL', 'MIXED']).optional(),
    amountMinor: MoneyMinorSchema.optional(),
    status: z.string().optional(),
  }).optional(),
});

// =============================================================================
// CONTRACT VALIDATION TESTS
// =============================================================================

describe('POS API Contract Tests', () => {
  describe('Auth Contracts', () => {
    test('AuthSendOtpResponse validates success shape', () => {
      const response = { success: true, message: 'OTP sent', data: { otpSent: true, expiresIn: 300 } };
      expect(() => AuthSendOtpResponse.parse(response)).not.toThrow();
    });

    test('AuthVerifyOtpResponse validates token shape', () => {
      const response = {
        success: true,
        data: {
          token: 'eyJhbGciOiJIUzI1NiJ9.test',
          refreshToken: 'refresh-token-123',
          user: {
            id: '00000000-0000-0000-0000-000000000001',
            phone: '+919999900001',
            name: 'Test User',
            role: 'cashier',
            storeId: '00000000-0000-0000-0000-000000000001',
          },
        },
      };
      expect(() => AuthVerifyOtpResponse.parse(response)).not.toThrow();
    });

    test('AuthRefreshResponse validates refresh shape', () => {
      const response = {
        success: true,
        data: { token: 'new-token', refreshToken: 'new-refresh' },
      };
      expect(() => AuthRefreshResponse.parse(response)).not.toThrow();
    });
  });

  describe('Scan Contracts', () => {
    test('ScanResolveResponse validates found product', () => {
      const response = {
        success: true,
        data: {
          product: {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Basmati Rice 1kg',
            barcode: '8901058001150',
            mrpMinor: 15000,
            sellingPriceMinor: 14000,
            unit: 'kg',
            categoryName: 'Grains',
            stock: 50,
          },
          found: true,
        },
      };
      expect(() => ScanResolveResponse.parse(response)).not.toThrow();
    });

    test('ScanResolveResponse validates not found', () => {
      const response = { success: true, data: { product: null, found: false } };
      expect(() => ScanResolveResponse.parse(response)).not.toThrow();
    });
  });

  describe('Sales Contracts', () => {
    test('RecordSaleResponse validates sale creation', () => {
      const response = {
        success: true,
        data: {
          saleId: '00000000-0000-0000-0000-000000000001',
          invoiceNumber: 'INV-2026-001',
          totalMinor: 29000,
          items: [
            {
              productId: '00000000-0000-0000-0000-000000000001',
              name: 'Rice',
              quantity: 2,
              unitPriceMinor: 14500,
              totalMinor: 29000,
              unit: 'kg',
            },
          ],
        },
      };
      expect(() => RecordSaleResponse.parse(response)).not.toThrow();
    });
  });

  describe('Inventory Contracts', () => {
    test('StockLevelResponse validates stock list', () => {
      const response = {
        success: true,
        data: {
          storeId: '00000000-0000-0000-0000-000000000001',
          products: [
            { productId: '00000000-0000-0000-0000-000000000001', name: 'Rice', currentStock: 50, unit: 'kg' },
          ],
        },
      };
      expect(() => StockLevelResponse.parse(response)).not.toThrow();
    });

    test('StockInResponse validates stock addition', () => {
      const response = {
        success: true,
        data: {
          transactionId: '00000000-0000-0000-0000-000000000001',
          productId: '00000000-0000-0000-0000-000000000001',
          quantityAdded: 100,
          newStock: 150,
        },
      };
      expect(() => StockInResponse.parse(response)).not.toThrow();
    });
  });

  describe('Error Contract', () => {
    test('ErrorResponse validates standard error shape', () => {
      const response = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid barcode format' },
      };
      expect(() => ErrorResponse.parse(response)).not.toThrow();
    });

    test('ErrorResponse rejects non-object', () => {
      expect(() => ErrorResponse.parse('invalid')).toThrow();
    });
  });

  describe('Payment Contracts', () => {
    test('PaymentRecordResponse validates cash payment', () => {
      const response = {
        success: true,
        data: {
          paymentId: '00000000-0000-0000-0000-000000000001',
          saleId: '00000000-0000-0000-0000-000000000001',
          method: 'CASH',
          amountMinor: 29000,
          status: 'COMPLETED',
        },
      };
      expect(() => PaymentRecordResponse.parse(response)).not.toThrow();
    });
  });

  describe('Store Config Contract', () => {
    test('StoreConfigResponse validates store shape', () => {
      const response = {
        success: true,
        data: {
          store: {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Test Store',
            code: 'TS001',
            status: 'ACTIVE',
            phone: '+919999900001',
            address: '123 Main St',
          },
        },
      };
      expect(() => StoreConfigResponse.parse(response)).not.toThrow();
    });
  });

  describe('Daily Closing Contract', () => {
    test('DailyClosingResponse validates closing summary', () => {
      const response = {
        success: true,
        data: {
          closingId: '00000000-0000-0000-0000-000000000001',
          date: '2026-02-16',
          totalSalesMinor: 150000,
          totalTransactions: 25,
          cashCollectedMinor: 120000,
          status: 'CLOSED',
        },
      };
      expect(() => DailyClosingResponse.parse(response)).not.toThrow();
    });
  });

  describe('Contract Breaking Change Detection', () => {
    test('removing required field breaks contract', () => {
      const brokenResponse = {
        success: true,
        data: {
          product: {
            // Missing required 'id' and 'name'
            mrpMinor: 15000,
            sellingPriceMinor: 14000,
            unit: 'kg',
          },
          found: true,
        },
      };
      expect(() => ScanResolveResponse.parse(brokenResponse)).toThrow();
    });

    test('changing field type breaks contract', () => {
      const brokenResponse = {
        success: true,
        data: {
          token: 123, // Should be string
          refreshToken: 'valid',
          user: { id: 'not-a-uuid', phone: '+91', role: 'admin' },
        },
      };
      expect(() => AuthVerifyOtpResponse.parse(brokenResponse)).toThrow();
    });
  });
});
