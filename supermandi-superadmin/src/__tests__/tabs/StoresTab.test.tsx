// SuperAdmin — Test StoresTab component
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
    getStoreContactDraft: () => ({ address: '', contactName: '', contactPhone: '', contactEmail: '', gstin: '' }),
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
    storeSettings: {},
    storeSettingsLoading: {},
    loadStoreSettings: vi.fn(),
    handleBnplSave: vi.fn(),
    bnplSaving: {},
    handleDiscountLimitSave: vi.fn(),
    discountLimitSaving: {},
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

  afterEach(() => {
    cleanup();
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

    it('disables Apply when no flag key selected', () => {
      render(<StoresTab {...createDefaultProps({ selectedStoreIds: new Set(['store-1']), bulkFlagKey: '' })} />);
      expect((screen.getByText('Apply') as HTMLButtonElement).disabled).toBe(true);
    });

    it('enables Apply when flag key is selected', () => {
      render(<StoresTab {...createDefaultProps({ selectedStoreIds: new Set(['store-1']), bulkFlagKey: 'some_flag' })} />);
      expect((screen.getByText('Apply') as HTMLButtonElement).disabled).toBe(false);
    });

    it('renders feature flag options in bulk dropdown', () => {
      const featureFlags = [{ flag_key: 'flag_a', description: '', enabled: true }, { flag_key: 'flag_b', description: '', enabled: false }];
      render(<StoresTab {...createDefaultProps({ selectedStoreIds: new Set(['store-1']), featureFlags: featureFlags as any })} />);
      expect(screen.getByText('flag_a')).toBeTruthy();
      expect(screen.getByText('flag_b')).toBeTruthy();
    });

    it('renders enable/disable action options', () => {
      render(<StoresTab {...createDefaultProps({ selectedStoreIds: new Set(['store-1']) })} />);
      expect(screen.getByText('Enable')).toBeTruthy();
      expect(screen.getByText('Disable')).toBeTruthy();
    });
  });

  // =========================================================================
  // Additional edge cases
  // =========================================================================

  describe('edge cases and interactions', () => {
    it('calls setCreateStoreName on store name input change', () => {
      const setName = vi.fn();
      render(<StoresTab {...createDefaultProps({ setCreateStoreName: setName })} />);
      fireEvent.change(screen.getByPlaceholderText('Supermandi Pilot Store'), { target: { value: 'New Store' } });
      expect(setName).toHaveBeenCalledWith('New Store');
    });

    it('calls setCreateStoreId on store ID input change', () => {
      const setId = vi.fn();
      render(<StoresTab {...createDefaultProps({ setCreateStoreId: setId })} />);
      const inputs = screen.getAllByPlaceholderText('UUID or store code');
      fireEvent.change(inputs[0], { target: { value: 'custom-id' } });
      expect(setId).toHaveBeenCalledWith('custom-id');
    });

    it('calls setStoreAdminId on UPI store ID input change', () => {
      const setAdminId = vi.fn();
      render(<StoresTab {...createDefaultProps({ setStoreAdminId: setAdminId })} />);
      fireEvent.change(screen.getByPlaceholderText('e.g. store-1'), { target: { value: 'store-abc' } });
      expect(setAdminId).toHaveBeenCalledWith('store-abc');
    });

    it('calls setStoreUpiInput on UPI VPA input change', () => {
      const setUpi = vi.fn();
      render(<StoresTab {...createDefaultProps({ setStoreUpiInput: setUpi })} />);
      fireEvent.change(screen.getByPlaceholderText('merchant@upi'), { target: { value: 'test@upi' } });
      expect(setUpi).toHaveBeenCalledWith('test@upi');
    });

    it('shows loading text on Load store button', () => {
      render(<StoresTab {...createDefaultProps({ storeLoading: true })} />);
      expect(screen.getAllByText('Loading...').length).toBeGreaterThanOrEqual(1);
    });

    it('shows saving text on Save VPA button', () => {
      render(<StoresTab {...createDefaultProps({ storeLoading: true })} />);
      expect(screen.getByText('Saving...')).toBeTruthy();
    });

    it('disables Load store and Save VPA when loading', () => {
      render(<StoresTab {...createDefaultProps({ storeLoading: true })} />);
      const loadingBtns = screen.getAllByText('Loading...');
      expect((loadingBtns[0] as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByText('Saving...') as HTMLButtonElement).disabled).toBe(true);
    });

    it('shows store record with inactive status', () => {
      const storeRecord = makeStore({ active: false });
      render(<StoresTab {...createDefaultProps({ storeRecord })} />);
      expect(screen.getByText('false')).toBeTruthy();
    });

    it('shows dash for missing UPI VPA in store record', () => {
      const storeRecord = makeStore({ upi_vpa: null as any });
      render(<StoresTab {...createDefaultProps({ storeRecord })} />);
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it('shows dash for missing store name in store record', () => {
      const storeRecord = makeStore({ name: null as any });
      render(<StoresTab {...createDefaultProps({ storeRecord })} />);
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it('calls requestStoreStatusChange with reactivate for suspended store', () => {
      const requestChange = vi.fn();
      const stores = [makeStore({ status: 'SUSPENDED' })];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, requestStoreStatusChange: requestChange })} />);
      fireEvent.click(screen.getByText('Reactivate'));
      expect(requestChange).toHaveBeenCalledWith('store-1', 'Test Store', 'reactivate');
    });

    it('disables suspend button when storeSuspendLoading is true', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, storeSuspendLoading: true })} />);
      expect((screen.getByText('Suspend') as HTMLButtonElement).disabled).toBe(true);
    });

    it('calls updateStoreNameDraft on store name edit', () => {
      const updateDraft = vi.fn();
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, updateStoreNameDraft: updateDraft })} />);
      fireEvent.change(screen.getByPlaceholderText('Store name'), { target: { value: 'Updated Name' } });
      expect(updateDraft).toHaveBeenCalledWith('store-1', 'Updated Name');
    });

    it('calls toggleStoreSelection on per-store checkbox click', () => {
      const toggle = vi.fn();
      const stores = [makeStore({ name: 'My Store' })];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, toggleStoreSelection: toggle })} />);
      fireEvent.click(screen.getByLabelText('Select store My Store'));
      expect(toggle).toHaveBeenCalledWith('store-1');
    });

    it('calls setSelectedStoreIds to select all on header checkbox', () => {
      const setIds = vi.fn();
      const stores = [makeStore({ id: 'a' }), makeStore({ id: 'b', name: 'Store B' })];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, setSelectedStoreIds: setIds })} />);
      fireEvent.click(screen.getByLabelText('Select all stores'));
      expect(setIds).toHaveBeenCalled();
    });

    it('renders enrollment code with REVOKED status', () => {
      const stores = [makeStore()];
      const storeEnrollments = {
        'store-1': [
          { id: 'e2', code: 'REV001', status: 'REVOKED' as const, uses_count: 1, max_uses: 5, store_id: 'store-1', created_at: '2024-01-01', expires_at: '2024-12-31', created_by: 'admin', revoked_at: '2024-06-01', used_at: null, last_used_at: null },
        ],
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeEnrollments })} />);
      expect(screen.getByText('REV001')).toBeTruthy();
      expect(screen.getByText('REVOKED')).toBeTruthy();
    });

    it('renders enrollment code with USED status', () => {
      const stores = [makeStore()];
      const storeEnrollments = {
        'store-1': [
          { id: 'e3', code: 'USED01', status: 'USED' as const, uses_count: 5, max_uses: 5, store_id: 'store-1', created_at: '2024-01-01', expires_at: '2024-12-31', created_by: 'admin', revoked_at: null, used_at: '2024-03-01', last_used_at: null },
        ],
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeEnrollments })} />);
      expect(screen.getByText('USED01')).toBeTruthy();
      expect(screen.getByText('USED')).toBeTruthy();
      expect(screen.getByText('5/5 uses')).toBeTruthy();
    });

    it('calls handleRevokeEnrollment on revoke click', () => {
      const handleRevoke = vi.fn();
      const stores = [makeStore()];
      const storeEnrollments = {
        'store-1': [
          { id: 'e1', code: 'ACT001', status: 'ACTIVE' as const, uses_count: 0, max_uses: 5, store_id: 'store-1', created_at: '2024-01-01', expires_at: '2024-12-31', created_by: 'admin', revoked_at: null, used_at: null, last_used_at: null },
        ],
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeEnrollments, handleRevokeEnrollment: handleRevoke })} />);
      fireEvent.click(screen.getByLabelText('Revoke enrollment code ACT001'));
      expect(handleRevoke).toHaveBeenCalledWith('ACT001');
    });

    it('calls handleResendCode on resend click', () => {
      const handleResend = vi.fn();
      const stores = [makeStore()];
      const storeEnrollments = {
        'store-1': [
          { id: 'e1', code: 'ACT002', status: 'ACTIVE' as const, uses_count: 0, max_uses: 5, store_id: 'store-1', created_at: '2024-01-01', expires_at: '2024-12-31', created_by: 'admin', revoked_at: null, used_at: null, last_used_at: null },
        ],
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeEnrollments, handleResendCode: handleResend })} />);
      fireEvent.click(screen.getByLabelText('Resend enrollment code ACT002'));
      expect(handleResend).toHaveBeenCalledWith('ACT002');
    });

    it('shows feature flags loading state when expanded', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeFFLoading: { 'store-1': true } })} />);
      // "Loading..." text should be present for feature flags
      const loadingElements = screen.getAllByText('Loading...');
      expect(loadingElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders feature flag checkboxes when loaded', () => {
      const stores = [makeStore()];
      const storeFeatureFlags = {
        'store-1': [
          { flag_key: 'test_flag', effective: true, global_enabled: true, store_override: null },
        ],
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeFeatureFlags: storeFeatureFlags as any })} />);
      expect(screen.getByText('test_flag')).toBeTruthy();
    });

    it('shows (killed) for globally disabled feature flag', () => {
      const stores = [makeStore()];
      const storeFeatureFlags = {
        'store-1': [
          { flag_key: 'killed_flag', effective: false, global_enabled: false, store_override: null },
        ],
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeFeatureFlags: storeFeatureFlags as any })} />);
      expect(screen.getByText('(killed)')).toBeTruthy();
    });

    it('shows (override) for store-overridden feature flag', () => {
      const stores = [makeStore()];
      const storeFeatureFlags = {
        'store-1': [
          { flag_key: 'override_flag', effective: true, global_enabled: true, store_override: true },
        ],
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeFeatureFlags: storeFeatureFlags as any })} />);
      expect(screen.getByText('(override)')).toBeTruthy();
    });

    it('calls handleCreditToggle on credit checkbox click', () => {
      const handleCredit = vi.fn();
      const stores = [makeStore({ creditEnabled: false })];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', handleCreditToggle: handleCredit })} />);
      fireEvent.click(screen.getByText('Enable Credit'));
      expect(handleCredit).toHaveBeenCalledWith('store-1', true);
    });

    it('calls setBarcodeSheetStoreId on barcode store ID input change', () => {
      const setId = vi.fn();
      render(<StoresTab {...createDefaultProps({ setBarcodeSheetStoreId: setId })} />);
      const inputs = screen.getAllByPlaceholderText('UUID or store code');
      fireEvent.change(inputs[inputs.length - 1], { target: { value: 'barcode-store' } });
      expect(setId).toHaveBeenCalledWith('barcode-store');
    });

    it('calls setBarcodeSheetTier on tier select change', () => {
      const setTier = vi.fn();
      render(<StoresTab {...createDefaultProps({ setBarcodeSheetTier: setTier })} />);
      fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'tier2' } });
      expect(setTier).toHaveBeenCalledWith('tier2');
    });

    it('shows enrollments loading state when expanded', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeEnrollmentsLoading: { 'store-1': true } })} />);
      const loadingElements = screen.getAllByText('Loading...');
      expect(loadingElements.length).toBeGreaterThanOrEqual(1);
    });

    it('shows QR button loading state', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, enrollmentForStoreLoading: 'store-1' })} />);
      expect(screen.getByText('...')).toBeTruthy();
    });

    it('renders contact toggle arrow text for expanded vs collapsed', () => {
      const stores = [makeStore({ contact_name: 'John' })];
      const { rerender } = render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: null })} />);
      // Collapsed shows down arrow
      expect(screen.getByText(/▼/)).toBeTruthy();
      // Expanded shows up arrow
      rerender(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1' })} />);
      expect(screen.getByText(/▲/)).toBeTruthy();
    });

    it('calls updateStoreContactDraft on contact name change', () => {
      const updateContact = vi.fn();
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', updateStoreContactDraft: updateContact })} />);
      fireEvent.change(screen.getByPlaceholderText('Contact name'), { target: { value: 'Jane' } });
      expect(updateContact).toHaveBeenCalledWith('store-1', { contactName: 'Jane' });
    });

    it('calls toggleStorePaymentMethod on payment checkbox click', () => {
      const togglePayment = vi.fn();
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', toggleStorePaymentMethod: togglePayment })} />);
      fireEvent.click(screen.getByText('UPI'));
      expect(togglePayment).toHaveBeenCalledWith('store-1', 'UPI', ['CASH']);
    });

    it('shows credit limit amount', () => {
      const stores = [makeStore({ creditLimit: 500000 })];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1' })} />);
      expect(screen.getByText(/5,000/)).toBeTruthy();
    });
  });

  // =========================================================================
  // SA-P1-014: Store Settings audit view
  // =========================================================================

  describe('store settings audit view', () => {
    it('renders Store Settings section when expanded', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1' })} />);
      expect(screen.getByText('Store Settings')).toBeTruthy();
    });

    it('renders View Settings button when no settings loaded', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1' })} />);
      expect(screen.getByText('View Settings')).toBeTruthy();
    });

    it('calls loadStoreSettings on View Settings click', () => {
      const loadSettings = vi.fn();
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', loadStoreSettings: loadSettings })} />);
      fireEvent.click(screen.getByText('View Settings'));
      expect(loadSettings).toHaveBeenCalledWith('store-1');
    });

    it('shows loading state for settings', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettingsLoading: { 'store-1': true } })} />);
      expect(screen.getByText('Loading settings...')).toBeTruthy();
    });

    it('does not show View Settings button when loading', () => {
      const stores = [makeStore()];
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettingsLoading: { 'store-1': true } })} />);
      expect(screen.queryByText('View Settings')).toBeNull();
    });

    it('does not show View Settings button when settings are loaded', () => {
      const stores = [makeStore()];
      const settings = {
        'store-1': {
          storeId: 'store-1',
          name: 'Test Store',
          code: 'TST001',
          storeType: null,
          status: 'ACTIVE',
          statusReason: null,
          statusUpdatedAt: null,
          address: '123 Main St',
          contactName: 'John',
          contactPhone: '+911234567890',
          contactEmail: 'john@test.com',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          location: null,
          upiVpa: 'test@upi',
          upiVpaUpdatedAt: '2024-01-15',
          allowedPaymentMethods: ['CASH', 'UPI'],
          creditEnabled: true,
          creditLimit: 500000,
          bnplEnabled: false,
          bnplCreditLimit: 5000000,
          bnplMaxDays: 7,
          deviceBound: true,
          kycComplete: true,
          upiComplete: true,
          adminApproved: true,
          activeDeviceCount: 1,
          posDeviceId: 'dev-123',
          kycStatus: 'VERIFIED',
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          scanLookupV2Enabled: true,
          featureFlags: [{ flag_key: 'scan_v2', enabled: true, scope_type: 'global', description: null }],
          createdAt: '2024-01-01',
          updatedAt: '2024-01-15',
        },
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettings: settings as any })} />);
      expect(screen.queryByText('View Settings')).toBeNull();
    });

    it('renders store settings sections when loaded', () => {
      const stores = [makeStore()];
      const settings = {
        'store-1': {
          storeId: 'store-1',
          name: 'Test Store',
          code: 'TST001',
          storeType: 'retail',
          status: 'ACTIVE',
          statusReason: null,
          statusUpdatedAt: null,
          address: '123 Main St',
          contactName: 'John',
          contactPhone: '+911234567890',
          contactEmail: 'john@test.com',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          location: null,
          upiVpa: 'test@upi',
          upiVpaUpdatedAt: null,
          allowedPaymentMethods: ['CASH', 'UPI'],
          creditEnabled: true,
          creditLimit: 500000,
          bnplEnabled: false,
          bnplCreditLimit: 5000000,
          bnplMaxDays: 7,
          deviceBound: true,
          kycComplete: true,
          upiComplete: true,
          adminApproved: true,
          activeDeviceCount: 1,
          posDeviceId: null,
          kycStatus: null,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          scanLookupV2Enabled: false,
          featureFlags: [],
          createdAt: '2024-01-01',
          updatedAt: '2024-01-15',
        },
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettings: settings as any })} />);
      // Section headers
      expect(screen.getByText('Identity')).toBeTruthy();
      expect(screen.getByText('Payment Settings')).toBeTruthy();
      expect(screen.getAllByText('Credit / BNPL').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Readiness Flags')).toBeTruthy();
      expect(screen.getByText('Device Info')).toBeTruthy();
      expect(screen.getByText('Timestamps')).toBeTruthy();
      // Values
      expect(screen.getByText('TST001')).toBeTruthy();
      expect(screen.getByText('retail')).toBeTruthy();
      expect(screen.getByText('Asia/Kolkata')).toBeTruthy();
      expect(screen.getByText('CASH, UPI')).toBeTruthy();
    });

    it('renders readiness flags correctly', () => {
      const stores = [makeStore()];
      const settings = {
        'store-1': {
          storeId: 'store-1',
          name: 'Test Store',
          code: 'TST001',
          storeType: null,
          status: 'ACTIVE',
          statusReason: null,
          statusUpdatedAt: null,
          address: null,
          contactName: null,
          contactPhone: null,
          contactEmail: null,
          city: null,
          state: null,
          pincode: null,
          location: null,
          upiVpa: null,
          upiVpaUpdatedAt: null,
          allowedPaymentMethods: ['CASH'],
          creditEnabled: false,
          creditLimit: 0,
          bnplEnabled: true,
          bnplCreditLimit: 5000000,
          bnplMaxDays: 7,
          deviceBound: true,
          kycComplete: false,
          upiComplete: true,
          adminApproved: false,
          activeDeviceCount: 2,
          posDeviceId: null,
          kycStatus: null,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          scanLookupV2Enabled: false,
          featureFlags: [],
          createdAt: '2024-01-01',
          updatedAt: '2024-01-15',
        },
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettings: settings as any })} />);
      // Device bound = Yes, KYC Complete = No (checking "Yes" and "No" appear)
      const yesElements = screen.getAllByText('Yes');
      const noElements = screen.getAllByText('No');
      expect(yesElements.length).toBeGreaterThanOrEqual(1);
      expect(noElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders feature flags in settings when present', () => {
      const stores = [makeStore()];
      const settings = {
        'store-1': {
          storeId: 'store-1',
          name: 'Test Store',
          code: 'TST001',
          storeType: null,
          status: 'ACTIVE',
          statusReason: null,
          statusUpdatedAt: null,
          address: null,
          contactName: null,
          contactPhone: null,
          contactEmail: null,
          city: null,
          state: null,
          pincode: null,
          location: null,
          upiVpa: null,
          upiVpaUpdatedAt: null,
          allowedPaymentMethods: ['CASH'],
          creditEnabled: false,
          creditLimit: 0,
          bnplEnabled: false,
          bnplCreditLimit: 0,
          bnplMaxDays: 7,
          deviceBound: false,
          kycComplete: false,
          upiComplete: false,
          adminApproved: false,
          activeDeviceCount: 0,
          posDeviceId: null,
          kycStatus: null,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          scanLookupV2Enabled: false,
          featureFlags: [
            { flag_key: 'scan_v2', enabled: true, scope_type: 'global', description: null },
            { flag_key: 'bnpl_beta', enabled: false, scope_type: 'store', description: null },
          ],
          createdAt: '2024-01-01',
          updatedAt: '2024-01-15',
        },
      };
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettings: settings as any })} />);
      expect(screen.getByText('scan_v2')).toBeTruthy();
      expect(screen.getByText('bnpl_beta')).toBeTruthy();
      expect(screen.getByText('Enabled')).toBeTruthy();
      expect(screen.getByText('Disabled')).toBeTruthy();
    });
  });

  // =========================================================================
  // SA-P2-007: BNPL Edit
  // =========================================================================

  describe('BNPL edit', () => {
    const makeSettingsForStore = (storeId: string) => ({
      [storeId]: {
        storeId,
        name: 'Test Store',
        code: 'TST001',
        storeType: null,
        status: 'ACTIVE',
        statusReason: null,
        statusUpdatedAt: null,
        address: null,
        contactName: null,
        contactPhone: null,
        contactEmail: null,
        city: null,
        state: null,
        pincode: null,
        location: null,
        upiVpa: null,
        upiVpaUpdatedAt: null,
        allowedPaymentMethods: ['CASH'] as string[],
        creditEnabled: true,
        creditLimit: 5000,
        bnplEnabled: true,
        bnplCreditLimit: 5000000,
        bnplMaxDays: 14,
        maxDiscountPercent: 100,
        deviceBound: false,
        kycComplete: false,
        upiComplete: false,
        adminApproved: false,
        activeDeviceCount: 0,
        posDeviceId: null,
        kycStatus: null,
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        scanLookupV2Enabled: false,
        featureFlags: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-15',
      },
    });

    it('renders Edit BNPL Settings button when store settings are loaded', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettings: settings as any })} />);
      expect(screen.getByTestId('edit-bnpl-store-1')).toBeTruthy();
      expect(screen.getByText('Edit BNPL Settings')).toBeTruthy();
    });

    it('opens BNPL edit modal when button is clicked', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettings: settings as any })} />);
      fireEvent.click(screen.getByTestId('edit-bnpl-store-1'));
      expect(screen.getByTestId('bnpl-edit-modal')).toBeTruthy();
      expect(screen.getByTestId('bnpl-enabled-toggle')).toBeTruthy();
      expect(screen.getByTestId('bnpl-credit-limit-input')).toBeTruthy();
      expect(screen.getByTestId('bnpl-max-days-input')).toBeTruthy();
      expect(screen.getByTestId('credit-enabled-toggle')).toBeTruthy();
      expect(screen.getByTestId('credit-limit-input')).toBeTruthy();
    });

    it('pre-populates modal with current store BNPL values', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettings: settings as any })} />);
      fireEvent.click(screen.getByTestId('edit-bnpl-store-1'));

      const bnplToggle = screen.getByTestId('bnpl-enabled-toggle') as HTMLInputElement;
      expect(bnplToggle.checked).toBe(true);

      const creditLimitInput = screen.getByTestId('bnpl-credit-limit-input') as HTMLInputElement;
      expect(creditLimitInput.value).toBe('50000'); // 5000000 paise / 100 = 50000 rupees

      const maxDaysInput = screen.getByTestId('bnpl-max-days-input') as HTMLInputElement;
      expect(maxDaysInput.value).toBe('14');

      const creditToggle = screen.getByTestId('credit-enabled-toggle') as HTMLInputElement;
      expect(creditToggle.checked).toBe(true);

      const creditLimit = screen.getByTestId('credit-limit-input') as HTMLInputElement;
      expect(creditLimit.value).toBe('50'); // 5000 paise / 100 = 50 rupees
    });

    it('closes modal when cancel is clicked', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettings: settings as any })} />);
      fireEvent.click(screen.getByTestId('edit-bnpl-store-1'));
      expect(screen.getByTestId('bnpl-edit-modal')).toBeTruthy();
      fireEvent.click(screen.getByTestId('bnpl-cancel-btn'));
      expect(screen.queryByTestId('bnpl-edit-modal')).toBeNull();
    });

    it('calls handleBnplSave and closes modal when save is clicked', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      const handleBnplSave = vi.fn();
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettings: settings as any, handleBnplSave })} />);
      fireEvent.click(screen.getByTestId('edit-bnpl-store-1'));
      fireEvent.click(screen.getByTestId('bnpl-save-btn'));

      expect(handleBnplSave).toHaveBeenCalledWith('store-1', {
        bnplEnabled: true,
        bnplCreditLimit: 5000000,
        bnplMaxDays: 14,
        creditEnabled: true,
        creditLimit: 5000,
      });
      // Modal should close after save
      expect(screen.queryByTestId('bnpl-edit-modal')).toBeNull();
    });

    it('allows toggling BNPL enabled off and saving', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      const handleBnplSave = vi.fn();
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettings: settings as any, handleBnplSave })} />);
      fireEvent.click(screen.getByTestId('edit-bnpl-store-1'));

      // Uncheck BNPL enabled
      fireEvent.click(screen.getByTestId('bnpl-enabled-toggle'));
      fireEvent.click(screen.getByTestId('bnpl-save-btn'));

      expect(handleBnplSave).toHaveBeenCalledWith('store-1', expect.objectContaining({
        bnplEnabled: false,
      }));
    });

    it('allows editing credit limit and max days', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      const handleBnplSave = vi.fn();
      render(<StoresTab {...createDefaultProps({ storeDirectory: stores, expandedStoreId: 'store-1', storeSettings: settings as any, handleBnplSave })} />);
      fireEvent.click(screen.getByTestId('edit-bnpl-store-1'));

      fireEvent.change(screen.getByTestId('bnpl-credit-limit-input'), { target: { value: '100000' } });
      fireEvent.change(screen.getByTestId('bnpl-max-days-input'), { target: { value: '30' } });
      fireEvent.click(screen.getByTestId('bnpl-save-btn'));

      expect(handleBnplSave).toHaveBeenCalledWith('store-1', expect.objectContaining({
        bnplCreditLimit: 10000000, // 100000 rupees * 100 = 10000000 paise
        bnplMaxDays: 30,
      }));
    });

    it('shows saving state on button when bnplSaving is true', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      render(<StoresTab {...createDefaultProps({
        storeDirectory: stores,
        expandedStoreId: 'store-1',
        storeSettings: settings as any,
        bnplSaving: { 'store-1': true },
      })} />);
      expect(screen.getByText('Saving...')).toBeTruthy();
    });
  });

  // =========================================================================
  // SA-P0-002: Discount limit section
  // =========================================================================
  describe('discount limit (SA-P0-002)', () => {
    const makeSettingsForStore = (storeId: string, overrides: Record<string, unknown> = {}) => ({
      [storeId]: {
        storeId,
        name: 'Test Store',
        code: 'TST001',
        storeType: null,
        status: 'ACTIVE',
        statusReason: null,
        statusUpdatedAt: null,
        address: null,
        contactName: null,
        contactPhone: null,
        contactEmail: null,
        city: null,
        state: null,
        pincode: null,
        location: null,
        upiVpa: null,
        upiVpaUpdatedAt: null,
        allowedPaymentMethods: ['CASH'] as string[],
        creditEnabled: true,
        creditLimit: 5000,
        bnplEnabled: true,
        bnplCreditLimit: 5000000,
        bnplMaxDays: 14,
        maxDiscountPercent: 100,
        deviceBound: false,
        kycComplete: false,
        upiComplete: false,
        adminApproved: false,
        activeDeviceCount: 0,
        posDeviceId: null,
        kycStatus: null,
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        scanLookupV2Enabled: false,
        featureFlags: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-15',
        ...overrides,
      },
    });

    it('renders Discount Limits section header when settings are loaded', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      render(<StoresTab {...createDefaultProps({
        storeDirectory: stores,
        expandedStoreId: 'store-1',
        storeSettings: settings as any,
      })} />);
      expect(screen.getByText('Discount Limits')).toBeTruthy();
    });

    it('renders discount limit input with current value', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1', { maxDiscountPercent: 15 });
      render(<StoresTab {...createDefaultProps({
        storeDirectory: stores,
        expandedStoreId: 'store-1',
        storeSettings: settings as any,
      })} />);
      const input = screen.getByTestId('discount-limit-input-store-1') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe('15');
    });

    it('renders save button for discount limit', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      render(<StoresTab {...createDefaultProps({
        storeDirectory: stores,
        expandedStoreId: 'store-1',
        storeSettings: settings as any,
      })} />);
      expect(screen.getByTestId('discount-limit-save-store-1')).toBeTruthy();
    });

    it('save button is disabled when no edit has been made', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      render(<StoresTab {...createDefaultProps({
        storeDirectory: stores,
        expandedStoreId: 'store-1',
        storeSettings: settings as any,
      })} />);
      const btn = screen.getByTestId('discount-limit-save-store-1') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('save button is enabled after editing the input', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      render(<StoresTab {...createDefaultProps({
        storeDirectory: stores,
        expandedStoreId: 'store-1',
        storeSettings: settings as any,
      })} />);
      const input = screen.getByTestId('discount-limit-input-store-1');
      fireEvent.change(input, { target: { value: '25' } });
      const btn = screen.getByTestId('discount-limit-save-store-1') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('calls handleDiscountLimitSave when save is clicked', () => {
      const handleDiscountLimitSave = vi.fn();
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      render(<StoresTab {...createDefaultProps({
        storeDirectory: stores,
        expandedStoreId: 'store-1',
        storeSettings: settings as any,
        handleDiscountLimitSave,
      })} />);
      const input = screen.getByTestId('discount-limit-input-store-1');
      fireEvent.change(input, { target: { value: '25' } });
      const btn = screen.getByTestId('discount-limit-save-store-1');
      fireEvent.click(btn);
      expect(handleDiscountLimitSave).toHaveBeenCalledWith('store-1', 25);
    });

    it('shows Saving... when discountLimitSaving is true', () => {
      const stores = [makeStore()];
      const settings = makeSettingsForStore('store-1');
      render(<StoresTab {...createDefaultProps({
        storeDirectory: stores,
        expandedStoreId: 'store-1',
        storeSettings: settings as any,
        discountLimitSaving: { 'store-1': true },
      })} />);
      // There may be multiple "Saving..." texts (BNPL too), so check the specific button
      const btn = screen.getByTestId('discount-limit-save-store-1');
      expect(btn.textContent).toBe('Saving...');
    });
  });
});
