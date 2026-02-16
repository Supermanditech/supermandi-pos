/**
 * TEST-012: platform-service — feature flag scope resolution unit tests
 * Tests flag resolution: store overrides global, supplier overrides global, validation.
 */

// Mock dependencies
jest.mock('../services/platform-service/src/db/queries', () => ({
  getAllFlags: jest.fn(),
  getFlagById: jest.fn(),
  getGlobalFlag: jest.fn(),
  getScopedFlag: jest.fn(),
  getFlagsForScope: jest.fn(),
  createFlag: jest.fn(),
  updateFlag: jest.fn(),
  upsertFlag: jest.fn(),
  deleteFlag: jest.fn(),
}));

import {
  listAllFlags,
  getFlag,
  getFlagsForStore,
  getFlagsForSupplier,
  isFlagEnabled,
  createNewFlag,
  setFlag,
  updateExistingFlag,
  removeFlag,
} from '../services/platform-service/src/services/flagService';

import {
  getFlagById,
  getGlobalFlag,
  getScopedFlag,
  getFlagsForScope,
  deleteFlag,
} from '../services/platform-service/src/db/queries';

const mockGetFlagById = getFlagById as jest.MockedFunction<typeof getFlagById>;
const mockGetGlobalFlag = getGlobalFlag as jest.MockedFunction<typeof getGlobalFlag>;
const mockGetScopedFlag = getScopedFlag as jest.MockedFunction<typeof getScopedFlag>;
const mockGetFlagsForScope = getFlagsForScope as jest.MockedFunction<typeof getFlagsForScope>;
const mockDeleteFlag = deleteFlag as jest.MockedFunction<typeof deleteFlag>;

describe('Feature Flag Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // SCOPE RESOLUTION: Store overrides global
  // =========================================================================
  describe('getFlagsForStore — scope resolution', () => {
    it('store override replaces global flag', async () => {
      mockGetFlagsForScope
        .mockResolvedValueOnce([
          { flagKey: 'new_ui', enabled: false, payloadJson: null } as any,
        ])
        .mockResolvedValueOnce([
          { flagKey: 'new_ui', enabled: true, payloadJson: { version: 2 } } as any,
        ]);

      const flags = await getFlagsForStore('store-1');
      const newUi = flags.find(f => f.flagKey === 'new_ui');

      expect(newUi).toBeDefined();
      expect(newUi!.enabled).toBe(true);
      expect(newUi!.resolvedFrom).toBe('store');
      expect(newUi!.payload).toEqual({ version: 2 });
    });

    it('global flag used when no store override', async () => {
      mockGetFlagsForScope
        .mockResolvedValueOnce([
          { flagKey: 'beta', enabled: true, payloadJson: null } as any,
        ])
        .mockResolvedValueOnce([]); // No store overrides

      const flags = await getFlagsForStore('store-1');
      const beta = flags.find(f => f.flagKey === 'beta');

      expect(beta).toBeDefined();
      expect(beta!.enabled).toBe(true);
      expect(beta!.resolvedFrom).toBe('global');
    });

    it('includes store-only flags (not in global)', async () => {
      mockGetFlagsForScope
        .mockResolvedValueOnce([]) // No global flags
        .mockResolvedValueOnce([
          { flagKey: 'store_special', enabled: true, payloadJson: null } as any,
        ]);

      const flags = await getFlagsForStore('store-1');
      expect(flags).toHaveLength(1);
      expect(flags[0]!.flagKey).toBe('store_special');
      expect(flags[0]!.resolvedFrom).toBe('store');
    });
  });

  // =========================================================================
  // SCOPE RESOLUTION: Supplier overrides global
  // =========================================================================
  describe('getFlagsForSupplier — scope resolution', () => {
    it('supplier override replaces global flag', async () => {
      mockGetFlagsForScope
        .mockResolvedValueOnce([
          { flagKey: 'bulk_orders', enabled: false, payloadJson: null } as any,
        ])
        .mockResolvedValueOnce([
          { flagKey: 'bulk_orders', enabled: true, payloadJson: null } as any,
        ]);

      const flags = await getFlagsForSupplier('supplier-1');
      const bulk = flags.find(f => f.flagKey === 'bulk_orders');

      expect(bulk!.enabled).toBe(true);
      expect(bulk!.resolvedFrom).toBe('supplier');
    });
  });

  // =========================================================================
  // isFlagEnabled — cascading check
  // =========================================================================
  describe('isFlagEnabled', () => {
    it('returns scoped value when scope provided', async () => {
      mockGetScopedFlag.mockResolvedValue({ enabled: true } as any);

      const result = await isFlagEnabled('feature_x', 'store', 'store-1');
      expect(result).toBe(true);
    });

    it('falls back to global when no scoped flag', async () => {
      mockGetScopedFlag.mockResolvedValue(null as any);
      mockGetGlobalFlag.mockResolvedValue({ enabled: false } as any);

      const result = await isFlagEnabled('feature_x', 'store', 'store-1');
      expect(result).toBe(false);
    });

    it('returns false when no flag exists', async () => {
      mockGetScopedFlag.mockResolvedValue(null as any);
      mockGetGlobalFlag.mockResolvedValue(null as any);

      const result = await isFlagEnabled('nonexistent');
      expect(result).toBe(false);
    });

    it('checks only global when no scope provided', async () => {
      mockGetGlobalFlag.mockResolvedValue({ enabled: true } as any);

      const result = await isFlagEnabled('global_flag');
      expect(result).toBe(true);
      expect(mockGetScopedFlag).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // VALIDATION
  // =========================================================================
  describe('createNewFlag — validation', () => {
    it('rejects empty flag key', async () => {
      await expect(
        createNewFlag({ flagKey: '', scopeType: 'global', enabled: true } as any)
      ).rejects.toThrow('Flag key is required');
    });

    it('rejects whitespace-only flag key', async () => {
      await expect(
        createNewFlag({ flagKey: '   ', scopeType: 'global', enabled: true } as any)
      ).rejects.toThrow('Flag key is required');
    });

    it('rejects non-global flag without scope ID', async () => {
      await expect(
        createNewFlag({ flagKey: 'test', scopeType: 'store', enabled: true } as any)
      ).rejects.toThrow('Scope ID is required');
    });

    it('rejects global flag with scope ID', async () => {
      await expect(
        createNewFlag({
          flagKey: 'test',
          scopeType: 'global',
          scopeId: 'store-1',
          enabled: true,
        } as any)
      ).rejects.toThrow('Scope ID must be null');
    });
  });

  // =========================================================================
  // GET & REMOVE
  // =========================================================================
  describe('getFlag', () => {
    it('throws not found for missing flag', async () => {
      mockGetFlagById.mockResolvedValue(null as any);
      await expect(getFlag('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('removeFlag', () => {
    it('throws not found when flag does not exist', async () => {
      mockDeleteFlag.mockResolvedValue(false as any);
      await expect(removeFlag('nonexistent')).rejects.toThrow('not found');
    });
  });
});
