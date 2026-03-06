// SuperAdmin — Test StoresTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StoresTab } from '../../tabs/StoresTab';
import type { StoreRecord } from '../../api/stores';

import React from 'react';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

function createDefaultProps(overrides: Partial<Parameters<typeof StoresTab>[0]> = {}) {
  const defaultProps: Parameters<typeof StoresTab>[0] = {
    createStoreName: '',
    setCreateStoreName: vi.fn(),
    createStoreId: '',
    setCreateStoreId: vi.fn(),
    handleCreateStore: vi.fn(),
    createStoreLoading: false,
    createStoreError: '',
    createStoreSuccess: '',
    storeAdminId: '',
    setStoreAdminId: vi.fn(),
    storeUpiInput: '',
    setStoreUpiInput: vi.fn(),
    storeUpiInputRef: React.createRef(),
    handleStoreLoad: vi.fn(),
    handleStoreSave: vi.fn(),
    storeLoading: false,
    storeError: '',
    storeSuccess: '',
    storeRecord: null,
    storeDirectory: [],
    storeDirectoryLoading: false,
    storeDirectoryError: '',
    storeNameError: '',
    storeNameEdits: {},
    updateStoreNameDraft: vi.fn(),
    storeNameSaving: {},
    handleStoreNameSave: vi.fn(),
    expandedStoreId: null,
    setExpandedStoreId: vi.fn(),
    loadStoreFeatureFlags: vi.fn(),
    requestStoreStatusChange: vi.fn(),
    getStoreContactDraft: () => ({ address: '', contactName: '', contactPhone: '', contactEmail: '' }),
    updateStoreContactDraft: vi.fn(),
    getStorePaymentDraft: () => ['CASH'],
    toggleStorePaymentMethod: vi.fn(),
    storeFeatureFlags: {},
    storeFFLoading: {},
    handleStoreFFToggle: vi.fn(),
    selectedStoreIds: new Set<string>(),
    setSelectedStoreIds: vi.fn(),
    toggleStoreSelection: vi.fn(),
    bulkFlagKey: '',
    setBulkFlagKey: vi.fn(),
    bulkFlagAction: 'enable' as const,
    setBulkFlagAction: vi.fn(),
    handleBulkFF: vi.fn(),
    bulkFlagLoading: false,
    bulkFlagResult: '',
    featureFlags: [],
    barcodeSheetStoreId: '',
    setBarcodeSheetStoreId: vi.fn(),
    barcodeSheetTier: 'tier1' as const,
    setBarcodeSheetTier: vi.fn(),
    barcodeSheetBusy: false,
    barcodeSheetError: '',
    barcodeSheetSuccess: '',
    handleBarcodeSheetDownload: vi.fn(),
    handleBarcodeSheetShare: vi.fn(),
    stores: [],
    limit: 100,
    handleCreateEnrollmentForStore: vi.fn(),
    enrollmentForStoreLoading: '',
    storeEnrollments: {},
    loadStoreEnrollments: vi.fn(),
    storeEnrollmentsLoading: {},
    handleRevokeEnrollment: vi.fn(),
    revokeLoading: false,
    handleResendCode: vi.fn(),
    resendLoading: false,
    handleCreditToggle: vi.fn(),
    ...overrides,
  };
  return defaultProps;
}

const makeStore = (overrides: Partial<StoreRecord> = {}): StoreRecord => ({
  id: 'store-1',
  name: 'Test Store',
  status: 'ACTIVE',
  active: true,
  upi_vpa: 'test@upi',
  ...overrides,
});

describe('StoresTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Create store section
  // =========================================================================

  describe('create store', () => {
    it('renders create store section', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('Create Store')).toBeTruthy();
    });

    it('renders store name input', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByPlaceholderText('Supermandi Pilot Store')).toBeTruthy();
    });

    it('renders create button', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('Create store')).toBeTruthy();
    });

    it('shows creating state', () => {
      render(<StoresTab {...createDefaultProps({ createStoreLoading: true })} />);
      expect(screen.getByText('Creating...')).toBeTruthy();
    });

    it('calls handleCreateStore on click', () => {
      const handleCreate = vi.fn();
      render(<StoresTab {...createDefaultProps({ handleCreateStore: handleCreate })} />);
      fireEvent.click(screen.getByText('Create store'));
      expect(handleCreate).toHaveBeenCalled();
    });

    it('shows create store error', () => {
      render(<StoresTab {...createDefaultProps({ createStoreError: 'Store creation failed' })} />);
      expect(screen.getByText('Store creation failed')).toBeTruthy();
    });

    it('shows create store success', () => {
      render(<StoresTab {...createDefaultProps({ createStoreSuccess: 'Store created!' })} />);
      expect(screen.getByText('Store created!')).toBeTruthy();
    });
  });

  // =========================================================================
  // UPI VPA section
  // =========================================================================

  describe('UPI VPA section', () => {
    it('renders UPI VPA section', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('Store Activation (UPI VPA)')).toBeTruthy();
    });

    it('renders load store and save VPA buttons', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('Load store')).toBeTruthy();
      expect(screen.getByText('Save VPA')).toBeTruthy();
    });

    it('calls handleStoreLoad on click', () => {
      const handleLoad = vi.fn();
      render(<StoresTab {...createDefaultProps({ handleStoreLoad: handleLoad })} />);
      fireEvent.click(screen.getByText('Load store'));
      expect(handleLoad).toHaveBeenCalled();
    });

    it('calls handleStoreSave on click', () => {
      const handleSave = vi.fn();
      render(<StoresTab {...createDefaultProps({ handleStoreSave: handleSave })} />);
      fireEvent.click(screen.getByText('Save VPA'));
      expect(handleSave).toHaveBeenCalled();
    });

    it('shows store record table when loaded', () => {
      const storeRecord = makeStore();
      render(<StoresTab {...createDefaultProps({ storeRecord })} />);
      expect(screen.getByText('store-1')).toBeTruthy();
      expect(screen.getByText('test@upi')).toBeTruthy();
    });

    it('shows store error', () => {
      render(<StoresTab {...createDefaultProps({ storeError: 'Store not found' })} />);
      expect(screen.getByText('Store not found')).toBeTruthy();
    });
  });

  // =========================================================================
  // Store directory
  // =========================================================================

  describe('store directory', () => {
    it('renders stores directory section', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('Stores (directory)')).toBeTruthy();
    });

    it('shows empty state when no stores', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('No stores found.')).toBeTruthy();
    });

    it('shows loading state', () => {
      const { container } = render(<StoresTab {...createDefaultProps({ storeDirectoryLoading: true })} />);
      // UNMAPPED.044: Loading text replaced with skeleton table loaders
      expect(container.querySelector('table')).toBeTruthy();
    });

    it('renders store rows', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByText('store-1')).toBeTruthy();
    });

    it('shows ACTIVE status badge', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    it('shows SUSPENDED status badge', () => {
      const stores = [makeStore({ status: 'SUSPENDED' })];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByText('SUSPENDED')).toBeTruthy();
    });

    it('shows suspend button for active stores', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByText('Suspend')).toBeTruthy();
    });

    it('shows reactivate button for suspended stores', () => {
      const stores = [makeStore({ status: 'SUSPENDED' })];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByText('Reactivate')).toBeTruthy();
    });

    it('calls requestStoreStatusChange on suspend click', () => {
      const requestChange = vi.fn();
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, requestStoreStatusChange: requestChange })} />);
      fireEvent.click(screen.getByText('Suspend'));
      expect(requestChange).toHaveBeenCalledWith('store-1', 'Test Store', 'suspend');
    });

    it('renders save button for store name', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByText('Save')).toBeTruthy();
    });

    it('calls handleStoreNameSave on save click', () => {
      const handleSave = vi.fn();
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, handleStoreNameSave: handleSave })} />);
      fireEvent.click(screen.getByText('Save'));
      expect(handleSave).toHaveBeenCalledWith('store-1');
    });

    it('shows directory error', () => {
      render(<StoresTab {...createDefaultProps({ storeDirectoryError: 'Directory load failed' })} />);
      expect(screen.getByText('Directory load failed')).toBeTruthy();
    });

    it('shows refreshing indicator when loading with existing data', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, storeDirectoryLoading: true })} />);
      expect(screen.getByText('Refreshing stores...')).toBeTruthy();
    });
  });

  // =========================================================================
  // Barcode sheets
  // =========================================================================

  describe('barcode sheets', () => {
    it('renders barcode sheets section', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('Barcode Sheets')).toBeTruthy();
    });

    it('renders download PDF button', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('Download PDF')).toBeTruthy();
    });

    it('renders share to WhatsApp button', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('Share to WhatsApp')).toBeTruthy();
    });

    it('calls handleBarcodeSheetDownload on click', () => {
      const handleDownload = vi.fn();
      render(<StoresTab {...createDefaultProps({ handleBarcodeSheetDownload: handleDownload })} />);
      fireEvent.click(screen.getByText('Download PDF'));
      expect(handleDownload).toHaveBeenCalled();
    });

    it('shows busy state', () => {
      render(<StoresTab {...createDefaultProps({ barcodeSheetBusy: true })} />);
      const workingButtons = screen.getAllByText('Working...');
      expect(workingButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('shows barcode sheet error', () => {
      render(<StoresTab {...createDefaultProps({ barcodeSheetError: 'PDF generation failed' })} />);
      expect(screen.getByText('PDF generation failed')).toBeTruthy();
    });
  });

  // =========================================================================
  // Bulk feature flags toolbar
  // =========================================================================

  describe('bulk feature flags', () => {
    it('shows bulk toolbar when stores are selected', () => {
      render(<StoresTab {...createDefaultProps({ selectedStoreIds: new Set(['store-1', 'store-2']) })} />);
      expect(screen.getByText('2 store(s) selected')).toBeTruthy();
    });

    it('does not show bulk toolbar when no stores selected', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.queryByText(/store\(s\) selected/)).toBeNull();
    });

    it('shows apply button', () => {
      render(<StoresTab {...createDefaultProps({ selectedStoreIds: new Set(['store-1']) })} />);
      expect(screen.getByText('Apply')).toBeTruthy();
    });

    it('shows clear button', () => {
      render(<StoresTab {...createDefaultProps({ selectedStoreIds: new Set(['store-1']) })} />);
      expect(screen.getByText('Clear')).toBeTruthy();
    });
  });

  // =========================================================================
  // Store activity
  // =========================================================================

  describe('store activity', () => {
    it('renders activity section', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('Stores (activity)')).toBeTruthy();
    });

    it('shows no stores message when empty', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('No stores seen yet.')).toBeTruthy();
    });

    it('renders activity data', () => {
      const stores = [{ storeId: 'store-1', eventCount: 42, lastSeen: '2024-01-15' }];
      render(<StoresTab {...createDefaultProps({ stores })} />);
      expect(screen.getByText('42')).toBeTruthy();
    });
  });
});
