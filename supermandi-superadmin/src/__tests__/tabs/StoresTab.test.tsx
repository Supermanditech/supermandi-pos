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
    storeSuspendLoading: false,
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
    revokeLoading: null,
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

    it('renders activity table headers', () => {
      const stores = [{ storeId: 'store-1', eventCount: 10, lastSeen: '2024-01-15' }];
      render(<StoresTab {...createDefaultProps({ stores })} />);
      expect(screen.getByText('Event count')).toBeTruthy();
      expect(screen.getByText('Last seen')).toBeTruthy();
    });

    it('renders multiple store activities', () => {
      const stores = [
        { storeId: 'store-a', eventCount: 10, lastSeen: '2024-01-10' },
        { storeId: 'store-b', eventCount: 25, lastSeen: '2024-01-15' },
      ];
      render(<StoresTab {...createDefaultProps({ stores })} />);
      expect(screen.getByText('store-a')).toBeTruthy();
      expect(screen.getByText('store-b')).toBeTruthy();
      expect(screen.getByText('25')).toBeTruthy();
    });
  });

  // =========================================================================
  // Additional coverage
  // =========================================================================

  describe('create store details', () => {
    it('renders store ID optional input', () => {
      render(<StoresTab {...createDefaultProps()} />);
      // Two inputs with this placeholder (create store + barcode sheet)
      expect(screen.getAllByPlaceholderText('UUID or store code').length).toBeGreaterThanOrEqual(1);
    });

    it('renders subtitle description', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('Generate a Store ID for new device enrollment.')).toBeTruthy();
    });

    it('disables create button when loading', () => {
      render(<StoresTab {...createDefaultProps({ createStoreLoading: true })} />);
      expect((screen.getByText('Creating...') as HTMLButtonElement).disabled).toBe(true);
    });

    it('shows create store error with role=alert', () => {
      render(<StoresTab {...createDefaultProps({ createStoreError: 'Duplicate store' })} />);
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  describe('UPI VPA details', () => {
    it('renders UPI VPA input placeholder', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByPlaceholderText('merchant@upi')).toBeTruthy();
    });

    it('renders store ID input for UPI section', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByPlaceholderText('e.g. store-1')).toBeTruthy();
    });

    it('shows store error with role=alert', () => {
      render(<StoresTab {...createDefaultProps({ storeError: 'Not found' })} />);
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });

    it('shows store success message', () => {
      render(<StoresTab {...createDefaultProps({ storeSuccess: 'VPA saved!' })} />);
      expect(screen.getByText('VPA saved!')).toBeTruthy();
    });

    it('shows store record table headers', () => {
      const storeRecord = makeStore();
      render(<StoresTab {...createDefaultProps({ storeRecord })} />);
      // "UPI VPA" appears as both label and table header
      expect(screen.getAllByText('UPI VPA').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('UPI Updated')).toBeTruthy();
    });

    it('shows active status in store record', () => {
      const storeRecord = makeStore({ active: true });
      render(<StoresTab {...createDefaultProps({ storeRecord })} />);
      expect(screen.getByText('true')).toBeTruthy();
    });
  });

  describe('store directory details', () => {
    it('renders directory subtitle', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByText('Edit store names and status')).toBeTruthy();
    });

    it('renders directory table headers', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByText('Store Name')).toBeTruthy();
      expect(screen.getByText('Contact')).toBeTruthy();
    });

    it('renders store name edit input', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByPlaceholderText('Store name')).toBeTruthy();
    });

    it('renders QR button for enrollment', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByText('QR')).toBeTruthy();
    });

    it('calls handleCreateEnrollmentForStore on QR click', () => {
      const handleEnroll = vi.fn();
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, handleCreateEnrollmentForStore: handleEnroll })} />);
      fireEvent.click(screen.getByText('QR'));
      expect(handleEnroll).toHaveBeenCalledWith('store-1');
    });

    it('shows saving state on name save', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, storeNameSaving: { 'store-1': true } })} />);
      expect(screen.getByText('Saving...')).toBeTruthy();
    });

    it('renders multiple stores in directory', () => {
      const stores = [
        makeStore({ id: 'store-a', name: 'Store Alpha' }),
        makeStore({ id: 'store-b', name: 'Store Beta' }),
      ];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByText('store-a')).toBeTruthy();
      expect(screen.getByText('store-b')).toBeTruthy();
    });

    it('renders select all checkbox', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByLabelText('Select all stores')).toBeTruthy();
    });

    it('renders per-store checkbox', () => {
      const stores = [makeStore({ name: 'Check Store' })];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores })} />);
      expect(screen.getByLabelText('Select store Check Store')).toBeTruthy();
    });

    it('shows storeNameError with role=alert', () => {
      render(<StoresTab {...createDefaultProps({ storeNameError: 'Name too short' })} />);
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('expanded store row', () => {
    it('renders contact fields when expanded', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1' })} />);
      expect(screen.getByText('Contact Name')).toBeTruthy();
      expect(screen.getByPlaceholderText('Contact name')).toBeTruthy();
      expect(screen.getByPlaceholderText('email@example.com')).toBeTruthy();
      expect(screen.getByPlaceholderText('Store address')).toBeTruthy();
    });

    it('renders payment method checkboxes when expanded', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1' })} />);
      expect(screen.getByText('Payment Methods')).toBeTruthy();
      expect(screen.getByText('CASH')).toBeTruthy();
      expect(screen.getByText('UPI')).toBeTruthy();
      expect(screen.getByText('DUE')).toBeTruthy();
    });

    it('renders credit/BNPL section when expanded', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1' })} />);
      expect(screen.getByText('Credit / BNPL')).toBeTruthy();
      expect(screen.getByText('Enable Credit')).toBeTruthy();
    });

    it('renders feature flags section when expanded', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1' })} />);
      expect(screen.getByText('Feature Flags')).toBeTruthy();
    });

    it('renders enrollment codes section when expanded', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1' })} />);
      expect(screen.getByText('Enrollment Codes')).toBeTruthy();
      expect(screen.getByText('No enrollment codes yet')).toBeTruthy();
    });

    it('renders enrollment codes when available', () => {
      const stores = [makeStore()];
      const storeEnrollments = {
        'store-1': [
          { id: 'e1', code: 'ABC123', status: 'ACTIVE' as const, uses_count: 0, max_uses: 5, store_id: 'store-1', created_at: '2024-01-01', expires_at: '2024-12-31', created_by: 'admin', revoked_at: null, used_at: null, last_used_at: null },
        ],
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeEnrollments })} />);
      expect(screen.getByText('ABC123')).toBeTruthy();
      // ACTIVE appears in both status badge for store and enrollment
      expect(screen.getAllByText('ACTIVE').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('0/5 uses')).toBeTruthy();
    });
  });

  describe('barcode sheet details', () => {
    it('renders tier selector', () => {
      render(<StoresTab {...createDefaultProps()} />);
      expect(screen.getByLabelText('Tier')).toBeTruthy();
    });

    it('calls handleBarcodeSheetShare on click', () => {
      const handleShare = vi.fn();
      render(<StoresTab {...createDefaultProps({ handleBarcodeSheetShare: handleShare })} />);
      fireEvent.click(screen.getByText('Share to WhatsApp'));
      expect(handleShare).toHaveBeenCalled();
    });

    it('shows barcode sheet success', () => {
      render(<StoresTab {...createDefaultProps({ barcodeSheetSuccess: 'PDF generated!' })} />);
      expect(screen.getByText('PDF generated!')).toBeTruthy();
    });

    it('disables buttons when busy', () => {
      render(<StoresTab {...createDefaultProps({ barcodeSheetBusy: true })} />);
      const workingButtons = screen.getAllByText('Working...');
      workingButtons.forEach(btn => {
        expect((btn as HTMLButtonElement).disabled).toBe(true);
      });
    });
  });

  describe('bulk feature flags details', () => {
    it('shows applying state', () => {
      render(<StoresTab {...createDefaultProps({ selectedStoreIds: new Set(['store-1']), bulkFlagLoading: true })} />);
      expect(screen.getByText('Applying...')).toBeTruthy();
    });

    it('shows bulk result message', () => {
      render(<StoresTab {...createDefaultProps({ selectedStoreIds: new Set(['store-1']), bulkFlagResult: '2 stores updated' })} />);
      expect(screen.getByText('2 stores updated')).toBeTruthy();
    });

    it('calls handleBulkFF on Apply click', () => {
      const handleBulk = vi.fn();
      render(<StoresTab {...createDefaultProps({ selectedStoreIds: new Set(['store-1']), bulkFlagKey: 'test_flag', handleBulkFF: handleBulk })} />);
      fireEvent.click(screen.getByText('Apply'));
      expect(handleBulk).toHaveBeenCalled();
    });

    it('calls setSelectedStoreIds with empty set on Clear click', () => {
      const setIds = vi.fn();
      render(<StoresTab {...createDefaultProps({ selectedStoreIds: new Set(['store-1']), setSelectedStoreIds: setIds })} />);
      fireEvent.click(screen.getByText('Clear'));
      expect(setIds).toHaveBeenCalled();
    });
  });
});
