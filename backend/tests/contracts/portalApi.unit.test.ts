// TEST-005: Zod Contract Tests — Portal API Endpoints
// Validates response shapes for Retailer Admin, Supplier Portal, and SuperAdmin.

import { z } from 'zod';

// =============================================================================
// SHARED SCHEMAS
// =============================================================================

const UuidSchema = z.string().uuid();
const PaginationSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  hasMore: z.boolean().optional(),
});

// =============================================================================
// RETAILER ADMIN CONTRACTS
// =============================================================================

export const RetailerProductListResponse = z.object({
  success: z.boolean(),
  data: z.object({
    products: z.array(z.object({
      id: UuidSchema,
      name: z.string(),
      barcode: z.string().nullable().optional(),
      mrpMinor: z.number().int(),
      sellingPriceMinor: z.number().int(),
      stock: z.number().optional(),
      unit: z.string().optional(),
      categoryName: z.string().nullable().optional(),
      status: z.string().optional(),
    })),
    pagination: PaginationSchema.optional(),
  }).optional(),
});

export const RetailerDashboardResponse = z.object({
  success: z.boolean(),
  data: z.object({
    todaySales: z.number().optional(),
    todayTransactions: z.number().optional(),
    lowStockCount: z.number().optional(),
    pendingOrders: z.number().optional(),
  }).optional(),
});

export const RetailerInventoryResponse = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(z.object({
      productId: UuidSchema,
      name: z.string(),
      currentStock: z.number(),
      unit: z.string().optional(),
      lastStockIn: z.string().optional(),
    })),
    pagination: PaginationSchema.optional(),
  }).optional(),
});

// =============================================================================
// SUPPLIER PORTAL CONTRACTS
// =============================================================================

export const SupplierProductListResponse = z.object({
  success: z.boolean(),
  data: z.object({
    products: z.array(z.object({
      id: UuidSchema,
      name: z.string(),
      barcode: z.string().nullable().optional(),
      mrpMinor: z.number().int(),
      unit: z.string().optional(),
      categoryName: z.string().nullable().optional(),
    })),
    pagination: PaginationSchema.optional(),
  }).optional(),
});

export const SupplierOrderListResponse = z.object({
  success: z.boolean(),
  data: z.object({
    orders: z.array(z.object({
      id: UuidSchema,
      orderNumber: z.string().optional(),
      storeName: z.string().optional(),
      status: z.string(),
      totalMinor: z.number().int().optional(),
      itemCount: z.number().int().optional(),
      createdAt: z.string(),
    })),
    pagination: PaginationSchema.optional(),
  }).optional(),
});

// =============================================================================
// SUPERADMIN CONTRACTS
// =============================================================================

export const AdminStoreListResponse = z.object({
  success: z.boolean(),
  data: z.object({
    stores: z.array(z.object({
      id: UuidSchema,
      name: z.string(),
      code: z.string(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
      phone: z.string().nullable().optional(),
      createdAt: z.string().optional(),
    })),
    pagination: PaginationSchema.optional(),
  }).optional(),
});

export const AdminUserListResponse = z.object({
  success: z.boolean(),
  data: z.object({
    users: z.array(z.object({
      id: UuidSchema,
      phone: z.string(),
      name: z.string().nullable().optional(),
      role: z.string(),
      storeId: UuidSchema.nullable().optional(),
      status: z.string().optional(),
    })),
    pagination: PaginationSchema.optional(),
  }).optional(),
});

// =============================================================================
// SUPERADMIN ANALYTICS CONTRACTS (TQ-006: match analytics.ts types)
// =============================================================================

export const AnalyticsOverviewResponse = z.object({
  overview: z.object({
    storeId: z.string().optional(),
    range: z.object({ from: z.string(), to: z.string() }),
    sales_total: z.object({
      pos_minor: z.number().int(),
      consumer_minor: z.number().int(),
      total_minor: z.number().int(),
    }),
    collections_total_minor: z.number().int(),
    payment_split_minor: z.object({
      cash: z.number().int(),
      upi: z.number().int(),
      due: z.number().int(),
    }),
    due_outstanding: z.object({
      total_minor: z.number().int(),
      buckets: z.array(z.object({
        label: z.string(),
        total_minor: z.number().int(),
        count: z.number().int(),
      })),
    }),
    new_products_created_count: z.number().int(),
    devices: z.object({
      online: z.number().int(),
      offline: z.number().int(),
      pending_outbox_total: z.number().int(),
    }),
    profit: z.object({
      gross_profit_minor: z.number().int(),
      margin_percent: z.number().nullable(),
      profit_confidence: z.enum(['HIGH', 'MED', 'LOW']),
      missing_cost_items_count: z.number().int(),
      missing_fields: z.array(z.string()),
    }).nullable(),
    profit_missing_fields: z.array(z.string()),
  }),
});

export const AnalyticsDevicesResponse = z.object({
  devices: z.array(z.object({
    device_id: z.string(),
    store_id: z.string(),
    label: z.string().nullable(),
    device_type: z.string().nullable(),
    active: z.boolean(),
    last_seen_online: z.string().nullable(),
    last_sync_at: z.string().nullable(),
    pending_outbox_count: z.number().int(),
    sales_count: z.number().int(),
    sales_total_minor: z.number().int(),
    collections_count: z.number().int(),
    collections_total_minor: z.number().int(),
    offline_sales_count: z.number().int(),
  })),
  total: z.number().int(),
  range: z.object({ from: z.string(), to: z.string() }),
  storeId: z.string().optional(),
});

export const AnalyticsActivityResponse = z.object({
  activity: z.object({
    range: z.object({ from: z.string(), to: z.string() }),
    groupBy: z.string(),
    buckets: z.array(z.object({
      bucket: z.string(),
      scans: z.number().int(),
      sales: z.number().int(),
      collections: z.number().int(),
      new_products_created: z.number().int(),
      offline_events_synced: z.number().int(),
    })),
  }),
});

export const AnalyticsDuesResponse = z.object({
  dues: z.object({
    range: z.object({ from: z.string(), to: z.string() }),
    outstanding_total_minor: z.number().int(),
    aging: z.object({
      d0_1: z.number().int(),
      d2_7: z.number().int(),
      d8_30: z.number().int(),
      d30_plus: z.number().int(),
    }),
    dues: z.array(z.object({
      sale_id: z.string(),
      customer_name: z.string().nullable(),
      amount_minor: z.number().int(),
      created_at: z.string(),
      age_days: z.number().int(),
    })),
    total: z.number().int(),
  }),
});

// =============================================================================
// CONTRACT VALIDATION TESTS
// =============================================================================

describe('Portal API Contract Tests', () => {
  describe('Retailer Admin Contracts', () => {
    test('ProductListResponse validates product list', () => {
      const response = {
        success: true,
        data: {
          products: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              name: 'Tata Salt 1kg',
              barcode: '8901058001150',
              mrpMinor: 2800,
              sellingPriceMinor: 2500,
              stock: 150,
              unit: 'kg',
              categoryName: 'Spices & Condiments',
              status: 'ACTIVE',
            },
          ],
          pagination: { total: 1, page: 1, limit: 50, hasMore: false },
        },
      };
      expect(() => RetailerProductListResponse.parse(response)).not.toThrow();
    });

    test('DashboardResponse validates summary', () => {
      const response = {
        success: true,
        data: {
          todaySales: 75000,
          todayTransactions: 42,
          lowStockCount: 8,
          pendingOrders: 3,
        },
      };
      expect(() => RetailerDashboardResponse.parse(response)).not.toThrow();
    });

    test('InventoryResponse validates inventory list', () => {
      const response = {
        success: true,
        data: {
          items: [
            {
              productId: '00000000-0000-0000-0000-000000000001',
              name: 'Rice',
              currentStock: 50,
              unit: 'kg',
            },
          ],
          pagination: { total: 1 },
        },
      };
      expect(() => RetailerInventoryResponse.parse(response)).not.toThrow();
    });
  });

  describe('Supplier Portal Contracts', () => {
    test('ProductListResponse validates supplier products', () => {
      const response = {
        success: true,
        data: {
          products: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              name: 'Tata Salt 1kg',
              barcode: '8901058001150',
              mrpMinor: 2800,
              unit: 'kg',
              categoryName: 'Spices',
            },
          ],
          pagination: { total: 1 },
        },
      };
      expect(() => SupplierProductListResponse.parse(response)).not.toThrow();
    });

    test('OrderListResponse validates order list', () => {
      const response = {
        success: true,
        data: {
          orders: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              orderNumber: 'PO-2026-001',
              storeName: 'Test Store',
              status: 'SUBMITTED',
              totalMinor: 150000,
              itemCount: 5,
              createdAt: '2026-02-16T10:00:00.000Z',
            },
          ],
          pagination: { total: 1 },
        },
      };
      expect(() => SupplierOrderListResponse.parse(response)).not.toThrow();
    });
  });

  describe('SuperAdmin Contracts', () => {
    test('StoreListResponse validates store list', () => {
      const response = {
        success: true,
        data: {
          stores: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              name: 'Main Store',
              code: 'MS001',
              status: 'ACTIVE',
              phone: '+919999900001',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          pagination: { total: 1, page: 1, limit: 50, hasMore: false },
        },
      };
      expect(() => AdminStoreListResponse.parse(response)).not.toThrow();
    });

    test('UserListResponse validates user list', () => {
      const response = {
        success: true,
        data: {
          users: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              phone: '+919999900001',
              name: 'Admin User',
              role: 'superadmin',
              storeId: null,
              status: 'ACTIVE',
            },
          ],
          pagination: { total: 1 },
        },
      };
      expect(() => AdminUserListResponse.parse(response)).not.toThrow();
    });
  });

  // TQ-006: SuperAdmin Analytics contracts matching frontend analytics.ts types
  describe('SuperAdmin Analytics Contracts', () => {
    test('OverviewResponse validates analytics overview', () => {
      const response = {
        overview: {
          storeId: '00000000-0000-0000-0000-000000000001',
          range: { from: '2026-02-01', to: '2026-02-17' },
          sales_total: { pos_minor: 500000, consumer_minor: 50000, total_minor: 550000 },
          collections_total_minor: 400000,
          payment_split_minor: { cash: 200000, upi: 150000, due: 50000 },
          due_outstanding: {
            total_minor: 50000,
            buckets: [
              { label: '0-1 days', total_minor: 20000, count: 3 },
              { label: '2-7 days', total_minor: 30000, count: 5 },
            ],
          },
          new_products_created_count: 12,
          devices: { online: 2, offline: 1, pending_outbox_total: 5 },
          profit: {
            gross_profit_minor: 100000,
            margin_percent: 18.2,
            profit_confidence: 'HIGH',
            missing_cost_items_count: 2,
            missing_fields: ['costPrice'],
          },
          profit_missing_fields: [],
        },
      };
      expect(() => AnalyticsOverviewResponse.parse(response)).not.toThrow();
    });

    test('OverviewResponse handles null profit', () => {
      const response = {
        overview: {
          range: { from: '2026-02-01', to: '2026-02-17' },
          sales_total: { pos_minor: 0, consumer_minor: 0, total_minor: 0 },
          collections_total_minor: 0,
          payment_split_minor: { cash: 0, upi: 0, due: 0 },
          due_outstanding: { total_minor: 0, buckets: [] },
          new_products_created_count: 0,
          devices: { online: 0, offline: 0, pending_outbox_total: 0 },
          profit: null,
          profit_missing_fields: ['costPrice', 'sellingPrice'],
        },
      };
      expect(() => AnalyticsOverviewResponse.parse(response)).not.toThrow();
    });

    test('DevicesResponse validates device list', () => {
      const response = {
        devices: [{
          device_id: 'dev-001',
          store_id: '00000000-0000-0000-0000-000000000001',
          label: 'Counter POS',
          device_type: 'RETAILER_PHONE',
          active: true,
          last_seen_online: '2026-02-17T10:00:00Z',
          last_sync_at: '2026-02-17T09:55:00Z',
          pending_outbox_count: 0,
          sales_count: 42,
          sales_total_minor: 350000,
          collections_count: 10,
          collections_total_minor: 200000,
          offline_sales_count: 2,
        }],
        total: 1,
        range: { from: '2026-02-01', to: '2026-02-17' },
      };
      expect(() => AnalyticsDevicesResponse.parse(response)).not.toThrow();
    });

    test('ActivityResponse validates activity buckets', () => {
      const response = {
        activity: {
          range: { from: '2026-02-01', to: '2026-02-17' },
          groupBy: 'day',
          buckets: [{
            bucket: '2026-02-17',
            scans: 150,
            sales: 42,
            collections: 10,
            new_products_created: 3,
            offline_events_synced: 5,
          }],
        },
      };
      expect(() => AnalyticsActivityResponse.parse(response)).not.toThrow();
    });

    test('DuesResponse validates dues with aging', () => {
      const response = {
        dues: {
          range: { from: '2026-02-01', to: '2026-02-17' },
          outstanding_total_minor: 75000,
          aging: { d0_1: 20000, d2_7: 30000, d8_30: 15000, d30_plus: 10000 },
          dues: [{
            sale_id: '00000000-0000-0000-0000-000000000001',
            customer_name: 'Rahul Shop',
            amount_minor: 25000,
            created_at: '2026-02-15T10:00:00Z',
            age_days: 2,
          }],
          total: 1,
        },
      };
      expect(() => AnalyticsDuesResponse.parse(response)).not.toThrow();
    });
  });

  describe('Cross-Portal Contract Consistency', () => {
    test('UUID format is consistent across all contracts', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(() => UuidSchema.parse(validUuid)).not.toThrow();
      expect(() => UuidSchema.parse('not-a-uuid')).toThrow();
    });

    test('pagination schema is reusable across portals', () => {
      expect(() => PaginationSchema.parse({ total: 100, page: 1, limit: 50, hasMore: true })).not.toThrow();
      expect(() => PaginationSchema.parse({ total: 0 })).not.toThrow();
    });
  });
});
