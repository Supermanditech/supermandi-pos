/**
 * TEST-018: reorder-service — policy bounds validation unit tests
 * Tests reorder policy constraints: min_stock >= 0, target_stock >= min_stock.
 * DB calls are mocked.
 */

// Mock dependencies
jest.mock('@supermandi/common', () => {
  class ApiError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.name = 'ApiError';
    }
  }
  return {
    ApiError,
    getClient: jest.fn(),
  };
});

jest.mock('../services/reorder-service/src/db/queries', () => ({
  getPolicy: jest.fn(),
  getPolicyById: jest.fn(),
  listPolicies: jest.fn(),
  createPolicy: jest.fn(),
  updatePolicy: jest.fn(),
  deletePolicy: jest.fn(),
}));

jest.mock('../services/reorder-service/src/config', () => ({
  config: {
    reorder: {
      defaultLimit: 50,
      maxLimit: 100,
    },
  },
}));

import {
  createPolicyService,
  updatePolicyService,
  deletePolicyService,
  listStorePolicies,
} from '../services/reorder-service/src/services/policyService';

import {
  getPolicy,
  getPolicyById,
  listPolicies,
  createPolicy,
  deletePolicy,
} from '../services/reorder-service/src/db/queries';

import { getClient } from '@supermandi/common';

const mockGetPolicy = getPolicy as jest.MockedFunction<typeof getPolicy>;
const mockGetPolicyById = getPolicyById as jest.MockedFunction<typeof getPolicyById>;
const mockListPolicies = listPolicies as jest.MockedFunction<typeof listPolicies>;
const mockCreatePolicy = createPolicy as jest.MockedFunction<typeof createPolicy>;
const mockDeletePolicy = deletePolicy as jest.MockedFunction<typeof deletePolicy>;
const mockGetClient = getClient as jest.MockedFunction<typeof getClient>;

// Mock DB client
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

describe('Reorder Policy Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClient.mockResolvedValue(mockClient as any);
    mockClient.query.mockResolvedValue({});
  });

  // =========================================================================
  // BOUNDS VALIDATION (Critical Business Logic)
  // =========================================================================
  describe('bounds validation', () => {
    it('rejects negative min_stock', async () => {
      await expect(
        createPolicyService({
          storeId: 'store-1',
          productId: 'product-1',
          minStock: -1,
          targetStock: 10,
        })
      ).rejects.toThrow('min_stock must be a number between 0 and 999999');
    });

    it('rejects target_stock < min_stock', async () => {
      await expect(
        createPolicyService({
          storeId: 'store-1',
          productId: 'product-1',
          minStock: 20,
          targetStock: 10,
        })
      ).rejects.toThrow('target_stock must be >= min_stock');
    });

    it('accepts min_stock = 0', async () => {
      mockGetPolicy.mockResolvedValue(null as any);
      mockCreatePolicy.mockResolvedValue({ id: 'policy-1', minStock: 0, targetStock: 10 } as any);

      const result = await createPolicyService({
        storeId: 'store-1',
        productId: 'product-1',
        minStock: 0,
        targetStock: 10,
      });

      expect(result.minStock).toBe(0);
    });

    it('accepts target_stock = min_stock', async () => {
      mockGetPolicy.mockResolvedValue(null as any);
      mockCreatePolicy.mockResolvedValue({ id: 'policy-1', minStock: 5, targetStock: 5 } as any);

      const result = await createPolicyService({
        storeId: 'store-1',
        productId: 'product-1',
        minStock: 5,
        targetStock: 5,
      });

      expect(result.targetStock).toBe(5);
    });
  });

  // =========================================================================
  // CREATE POLICY
  // =========================================================================
  describe('createPolicyService', () => {
    it('rejects duplicate policy for same store+product', async () => {
      mockGetPolicy.mockResolvedValue({ id: 'existing-policy' } as any);

      await expect(
        createPolicyService({
          storeId: 'store-1',
          productId: 'product-1',
          minStock: 5,
          targetStock: 20,
        })
      ).rejects.toThrow('already exists');
    });

    it('creates policy when no duplicate', async () => {
      mockGetPolicy.mockResolvedValue(null as any);
      mockCreatePolicy.mockResolvedValue({
        id: 'policy-1',
        storeId: 'store-1',
        productId: 'product-1',
        minStock: 5,
        targetStock: 20,
      } as any);

      const result = await createPolicyService({
        storeId: 'store-1',
        productId: 'product-1',
        minStock: 5,
        targetStock: 20,
      });

      expect(result.id).toBe('policy-1');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('rolls back on unique constraint violation', async () => {
      mockGetPolicy.mockResolvedValue(null as any);
      mockCreatePolicy.mockRejectedValue({ code: '23505' });

      await expect(
        createPolicyService({
          storeId: 'store-1',
          productId: 'product-1',
          minStock: 5,
          targetStock: 20,
        })
      ).rejects.toThrow('already exists');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // UPDATE POLICY
  // =========================================================================
  describe('updatePolicyService', () => {
    it('rejects empty update', async () => {
      await expect(updatePolicyService('policy-1', {})).rejects.toThrow(
        'At least one field'
      );
    });

    it('rejects update that violates bounds', async () => {
      mockGetPolicyById.mockResolvedValue({
        id: 'policy-1',
        minStock: 10,
        targetStock: 20,
      } as any);

      // Lower targetStock below existing minStock
      await expect(
        updatePolicyService('policy-1', { targetStock: 5 })
      ).rejects.toThrow('target_stock must be >= min_stock');
    });

    it('rejects when policy not found', async () => {
      mockGetPolicyById.mockResolvedValue(null as any);

      await expect(
        updatePolicyService('nonexistent', { minStock: 5 })
      ).rejects.toThrow('not found');
    });
  });

  // =========================================================================
  // DELETE POLICY
  // =========================================================================
  describe('deletePolicyService', () => {
    it('deletes existing policy', async () => {
      mockDeletePolicy.mockResolvedValue(true as any);

      await expect(deletePolicyService('policy-1')).resolves.not.toThrow();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('throws when policy not found', async () => {
      mockDeletePolicy.mockResolvedValue(false as any);

      await expect(deletePolicyService('nonexistent')).rejects.toThrow('not found');
    });
  });

  // =========================================================================
  // LIST POLICIES
  // =========================================================================
  describe('listStorePolicies', () => {
    it('enforces max limit', async () => {
      mockListPolicies.mockResolvedValue({ policies: [], total: 0 } as any);

      await listStorePolicies('store-1', { limit: 500 });

      // Should cap at maxLimit (100)
      expect(mockListPolicies).toHaveBeenCalledWith('store-1', expect.objectContaining({
        limit: 100,
      }));
    });

    it('uses default limit when not specified', async () => {
      mockListPolicies.mockResolvedValue({ policies: [], total: 0 } as any);

      await listStorePolicies('store-1');

      expect(mockListPolicies).toHaveBeenCalledWith('store-1', expect.objectContaining({
        limit: 50,
        offset: 0,
        enabledOnly: false,
      }));
    });
  });
});
