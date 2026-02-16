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
