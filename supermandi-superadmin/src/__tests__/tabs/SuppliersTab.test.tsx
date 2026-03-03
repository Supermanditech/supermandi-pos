// SuperAdmin — Test SuppliersTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuppliersTab } from '../../tabs/SuppliersTab';
import type { PendingSupplierRequest, VerifiedSupplier, PendingProduct, BankChangeEntry } from '../../api/suppliers';

// Mock API modules
vi.mock('../../api/suppliers', () => ({
  toggleAutoApproval: vi.fn().mockResolvedValue({ supplierId: 's1', autoApproveProducts: true, message: 'ok' }),
  publishProduct: vi.fn().mockResolvedValue({ productId: 'p1', productName: 'Rice', supplierName: 'Vendor', publishedToStores: 3 }),
  batchProductAction: vi.fn().mockResolvedValue({ processed: 2, succeeded: 2, failed: 0, errors: [] }),
}));

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
  formatDate: vi.fn((v: string) => v || '--'),
}));

function createDefaultProps(overrides: Partial<Parameters<typeof SuppliersTab>[0]> = {}) {
  const defaultProps: Parameters<typeof SuppliersTab>[0] = {
    refreshSuppliers: vi.fn(),
    suppliersLoading: false,
    suppliersError: '',
    supplierActionError: '',
    pendingSuppliers: [],
    verifiedSuppliers: [],
    selectedSupplierForLink: {},
    setSelectedSupplierForLink: vi.fn(),
    rejectReason: {},
    setRejectReason: vi.fn(),
    supplierActionLoading: {},
    handleVerifySupplierDirectly: vi.fn(),
    handleVerifySupplier: vi.fn(),
    handleRejectSupplier: vi.fn(),
    bankChanges: [],
    bankVerifyLoading: {},
    bankRejectReason: {},
    setBankRejectReason: vi.fn(),
    handleBankVerify: vi.fn(),
    confirmedBankApprove: vi.fn(),
    supplierSearch: '',
    setSupplierSearch: vi.fn(),
    requestSupplierStatusChange: vi.fn(),
    pendingProducts: [],
    productActionError: '',
    productRejectReason: {},
    setProductRejectReason: vi.fn(),
    productActionLoading: {},
    handleOpenEditProduct: vi.fn(),
    handleApproveProduct: vi.fn(),
    handleRejectProduct: vi.fn(),
    editingProduct: null,
    setEditingProduct: vi.fn(),
    handleCloseEditProduct: vi.fn(),
    onModalDirty: vi.fn(),
    editProductForm: {
      editedName: '',
      marginType: 'fixed' as const,
      fixedMargin: '',
      percentMargin: '',
      bnplEligible: false,
      bnplMaxDays: '7',
      invoiceModel: 'buy_resell' as const,
      hsnCode: '',
      gstRate: '',
    },
    setEditProductForm: vi.fn(),
    editProductError: '',
    editProductSuccess: '',
    editProductLoading: false,
    handleSubmitEditProduct: vi.fn(),
    ...overrides,
  };
  return defaultProps;
}

const makePendingSupplier = (overrides: Partial<PendingSupplierRequest> = {}): PendingSupplierRequest => ({
  id: 'req-1',
  storeId: 'store-1',
  storeName: 'Test Store',
  requestedName: 'New Vendor',
  requestedGstin: '12ABCDE1234Z5',
  requestedPhone: '+919999999999',
  requestedEmail: 'vendor@test.com',
  status: 'pending',
  createdAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

const makeVerifiedSupplier = (overrides: Partial<VerifiedSupplier> = {}): VerifiedSupplier => ({
  id: 'vs-1',
  gstin: '12ABCDE1234Z5',
  businessName: 'Verified Corp',
  verificationStatus: 'VERIFIED',
  status: 'active',
  ...overrides,
});

const makePendingProduct = (overrides: Partial<PendingProduct> = {}): PendingProduct => ({
  id: 'prod-1',
  productName: 'Premium Rice',
  purchasePrice: 5000,
  mrp: 6000,
  supplierId: 's1',
  supplierName: 'Test Vendor',
  createdAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

const makeBankChange = (overrides: Partial<BankChangeEntry> = {}): BankChangeEntry => ({
  id: 'bc-1',
  businessName: 'Bank Change Corp',
  gstin: '12XYZ0000Z5',
  phone: '+919999999999',
  email: 'bank@test.com',
  bankAccountMasked: 'XXXX1234',
  bankIfsc: 'SBIN0001234',
  bankAccountName: 'Corp Account',
  bankVerificationStatus: 'pending',
  updatedAt: '2024-01-15T00:00:00Z',
  ...overrides,
});

describe('SuppliersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Basic rendering
  // =========================================================================

  describe('basic rendering', () => {
    it('renders the component with header', () => {
      render(<SuppliersTab {...createDefaultProps()} />);
      expect(screen.getByText('Pending Supplier Requests')).toBeTruthy();
    });

    it('renders refresh button', () => {
      render(<SuppliersTab {...createDefaultProps()} />);
      expect(screen.getByText('Refresh')).toBeTruthy();
    });

    it('shows loading state on refresh button', () => {
      render(<SuppliersTab {...createDefaultProps({ suppliersLoading: true })} />);
      expect(screen.getByText('Refreshing...')).toBeTruthy();
    });

    it('shows empty state when no pending suppliers', () => {
      render(<SuppliersTab {...createDefaultProps()} />);
      expect(screen.getByText('No pending supplier requests.')).toBeTruthy();
    });

    it('shows loading text when loading with no data', () => {
      render(<SuppliersTab {...createDefaultProps({ suppliersLoading: true })} />);
      expect(screen.getByText('Loading pending requests...')).toBeTruthy();
    });
  });

  // =========================================================================
  // Error display
  // =========================================================================

  describe('error display', () => {
    it('displays suppliersError banner', () => {
      render(<SuppliersTab {...createDefaultProps({ suppliersError: 'Failed to load' })} />);
      expect(screen.getByText('Failed to load')).toBeTruthy();
    });

    it('displays supplierActionError banner', () => {
      render(<SuppliersTab {...createDefaultProps({ supplierActionError: 'Action failed' })} />);
      expect(screen.getByText('Action failed')).toBeTruthy();
    });

    it('displays productActionError banner', () => {
      render(<SuppliersTab {...createDefaultProps({ productActionError: 'Product error' })} />);
      expect(screen.getByText('Product error')).toBeTruthy();
    });
  });

  // =========================================================================
  // Pending suppliers
  // =========================================================================

  describe('pending suppliers', () => {
    it('renders pending supplier cards', () => {
      const pending = [makePendingSupplier()];
      render(<SuppliersTab {...createDefaultProps({ pendingSuppliers: pending })} />);
      expect(screen.getByText('New Vendor')).toBeTruthy();
      expect(screen.getByText('12ABCDE1234Z5')).toBeTruthy();
    });

    it('shows store name for pending supplier', () => {
      const pending = [makePendingSupplier()];
      render(<SuppliersTab {...createDefaultProps({ pendingSuppliers: pending })} />);
      expect(screen.getByText('Test Store')).toBeTruthy();
    });

    it('renders verify directly button', () => {
      const pending = [makePendingSupplier()];
      render(<SuppliersTab {...createDefaultProps({ pendingSuppliers: pending })} />);
      expect(screen.getByText('Verify Directly')).toBeTruthy();
    });

    it('renders reject button', () => {
      const pending = [makePendingSupplier()];
      render(<SuppliersTab {...createDefaultProps({ pendingSuppliers: pending })} />);
      expect(screen.getByText('Reject')).toBeTruthy();
    });

    it('calls handleVerifySupplierDirectly on click', () => {
      const handleVerify = vi.fn();
      const pending = [makePendingSupplier()];
      render(<SuppliersTab {...createDefaultProps({ pendingSuppliers: pending, handleVerifySupplierDirectly: handleVerify })} />);
      fireEvent.click(screen.getByText('Verify Directly'));
      expect(handleVerify).toHaveBeenCalledWith('req-1');
    });

    it('calls handleRejectSupplier on reject click', () => {
      const handleReject = vi.fn();
      const pending = [makePendingSupplier()];
      render(<SuppliersTab {...createDefaultProps({ pendingSuppliers: pending, handleRejectSupplier: handleReject })} />);
      fireEvent.click(screen.getByText('Reject'));
      expect(handleReject).toHaveBeenCalledWith('req-1');
    });

    it('shows loading state on action buttons', () => {
      const pending = [makePendingSupplier()];
      render(<SuppliersTab {...createDefaultProps({ pendingSuppliers: pending, supplierActionLoading: { 'req-1': true } })} />);
      expect(screen.getByText('Verifying...')).toBeTruthy();
      expect(screen.getByText('Rejecting...')).toBeTruthy();
    });
  });

  // =========================================================================
  // Verified suppliers
  // =========================================================================

  describe('verified suppliers', () => {
    it('renders verified suppliers table', () => {
      const verified = [makeVerifiedSupplier()];
      render(<SuppliersTab {...createDefaultProps({ verifiedSuppliers: verified })} />);
      expect(screen.getByText('Verified Corp')).toBeTruthy();
    });

    it('shows empty state when no verified suppliers', () => {
      render(<SuppliersTab {...createDefaultProps()} />);
      expect(screen.getByText(/No verified suppliers found/)).toBeTruthy();
    });

    it('shows suspend button for active suppliers', () => {
      const verified = [makeVerifiedSupplier()];
      render(<SuppliersTab {...createDefaultProps({ verifiedSuppliers: verified })} />);
      expect(screen.getByText('Suspend')).toBeTruthy();
    });

    it('shows reactivate button for suspended suppliers', () => {
      const verified = [makeVerifiedSupplier({ verificationStatus: 'SUSPENDED' })];
      render(<SuppliersTab {...createDefaultProps({ verifiedSuppliers: verified })} />);
      expect(screen.getByText('Reactivate')).toBeTruthy();
    });

    it('calls requestSupplierStatusChange on suspend click', () => {
      const requestChange = vi.fn();
      const verified = [makeVerifiedSupplier()];
      render(<SuppliersTab {...createDefaultProps({ verifiedSuppliers: verified, requestSupplierStatusChange: requestChange })} />);
      fireEvent.click(screen.getByText('Suspend'));
      expect(requestChange).toHaveBeenCalledWith('vs-1', 'Verified Corp', 'suspend');
    });

    it('shows auto-approve toggle', () => {
      const verified = [makeVerifiedSupplier({ autoApproveProducts: true })];
      render(<SuppliersTab {...createDefaultProps({ verifiedSuppliers: verified })} />);
      expect(screen.getByText('ON')).toBeTruthy();
    });

    it('shows supplier search input', () => {
      render(<SuppliersTab {...createDefaultProps()} />);
      expect(screen.getByPlaceholderText('GSTIN or business name...')).toBeTruthy();
    });
  });

  // =========================================================================
  // Pending products
  // =========================================================================

  describe('pending products', () => {
    it('renders pending product cards', () => {
      const products = [makePendingProduct()];
      render(<SuppliersTab {...createDefaultProps({ pendingProducts: products })} />);
      expect(screen.getByText('Premium Rice')).toBeTruthy();
      expect(screen.getByText('Test Vendor')).toBeTruthy();
    });

    it('shows product count badge', () => {
      const products = [makePendingProduct()];
      render(<SuppliersTab {...createDefaultProps({ pendingProducts: products })} />);
      // '1' appears in multiple places (count badge, quantity, etc.), so use getAllByText
      const ones = screen.getAllByText('1');
      expect(ones.length).toBeGreaterThanOrEqual(1);
    });

    it('shows empty state when no pending products', () => {
      render(<SuppliersTab {...createDefaultProps()} />);
      expect(screen.getByText('No products pending approval.')).toBeTruthy();
    });

    it('renders approve, reject, and edit buttons', () => {
      const products = [makePendingProduct()];
      render(<SuppliersTab {...createDefaultProps({ pendingProducts: products })} />);
      expect(screen.getByText('Approve')).toBeTruthy();
      // Reject button is disabled when no reason
      expect(screen.getByTitle('Reject this product')).toBeTruthy();
      expect(screen.getByText('Edit / Set Margin')).toBeTruthy();
    });

    it('calls handleApproveProduct on approve click', () => {
      const handleApprove = vi.fn();
      const products = [makePendingProduct()];
      render(<SuppliersTab {...createDefaultProps({ pendingProducts: products, handleApproveProduct: handleApprove })} />);
      fireEvent.click(screen.getByText('Approve'));
      expect(handleApprove).toHaveBeenCalledWith('prod-1');
    });

    it('calls handleOpenEditProduct on edit click', () => {
      const handleEdit = vi.fn();
      const products = [makePendingProduct()];
      render(<SuppliersTab {...createDefaultProps({ pendingProducts: products, handleOpenEditProduct: handleEdit })} />);
      fireEvent.click(screen.getByText('Edit / Set Margin'));
      expect(handleEdit).toHaveBeenCalledWith(products[0]);
    });

    it('shows Select All checkbox when products exist', () => {
      const products = [makePendingProduct()];
      render(<SuppliersTab {...createDefaultProps({ pendingProducts: products })} />);
      expect(screen.getByText('Select All')).toBeTruthy();
    });
  });

  // =========================================================================
  // Bank verifications
  // =========================================================================

  describe('bank verifications', () => {
    it('renders bank change section when changes exist', () => {
      const bankChanges = [makeBankChange()];
      render(<SuppliersTab {...createDefaultProps({ bankChanges })} />);
      expect(screen.getByText('Pending Bank Verifications')).toBeTruthy();
      expect(screen.getByText('Bank Change Corp')).toBeTruthy();
    });

    it('does not render bank section when no changes', () => {
      render(<SuppliersTab {...createDefaultProps()} />);
      expect(screen.queryByText('Pending Bank Verifications')).toBeNull();
    });

    it('shows bank details', () => {
      const bankChanges = [makeBankChange()];
      render(<SuppliersTab {...createDefaultProps({ bankChanges })} />);
      expect(screen.getByText('XXXX1234')).toBeTruthy();
      expect(screen.getByText('SBIN0001234')).toBeTruthy();
    });

    it('calls confirmedBankApprove on approve click', () => {
      const confirmApprove = vi.fn();
      const bankChanges = [makeBankChange()];
      render(<SuppliersTab {...createDefaultProps({ bankChanges, confirmedBankApprove: confirmApprove })} />);
      fireEvent.click(screen.getByText('Approve Bank Details'));
      expect(confirmApprove).toHaveBeenCalledWith('bc-1');
    });
  });

  // =========================================================================
  // Product edit modal
  // =========================================================================

  describe('product edit modal', () => {
    it('renders edit modal when editingProduct is set', () => {
      const product = makePendingProduct();
      render(<SuppliersTab {...createDefaultProps({ editingProduct: product })} />);
      expect(screen.getByText('Edit Product - Set Margin & BNPL')).toBeTruthy();
    });

    it('does not render modal when editingProduct is null', () => {
      render(<SuppliersTab {...createDefaultProps()} />);
      expect(screen.queryByText('Edit Product - Set Margin & BNPL')).toBeNull();
    });

    it('shows product name in modal', () => {
      const product = makePendingProduct();
      render(<SuppliersTab {...createDefaultProps({ editingProduct: product })} />);
      expect(screen.getByText('Premium Rice')).toBeTruthy();
    });

    it('shows save button', () => {
      const product = makePendingProduct();
      render(<SuppliersTab {...createDefaultProps({ editingProduct: product })} />);
      expect(screen.getByText('Save Changes')).toBeTruthy();
    });

    it('calls handleSubmitEditProduct on save', () => {
      const handleSubmit = vi.fn();
      const product = makePendingProduct();
      render(<SuppliersTab {...createDefaultProps({ editingProduct: product, handleSubmitEditProduct: handleSubmit })} />);
      fireEvent.click(screen.getByText('Save Changes'));
      expect(handleSubmit).toHaveBeenCalled();
    });

    it('shows saving state', () => {
      const product = makePendingProduct();
      render(<SuppliersTab {...createDefaultProps({ editingProduct: product, editProductLoading: true })} />);
      expect(screen.getByText('Saving...')).toBeTruthy();
    });

    it('shows edit product error', () => {
      const product = makePendingProduct();
      render(<SuppliersTab {...createDefaultProps({ editingProduct: product, editProductError: 'Edit failed' })} />);
      expect(screen.getByText('Edit failed')).toBeTruthy();
    });

    it('shows edit product success', () => {
      const product = makePendingProduct();
      render(<SuppliersTab {...createDefaultProps({ editingProduct: product, editProductSuccess: 'Saved!' })} />);
      expect(screen.getByText('Saved!')).toBeTruthy();
    });
  });

  // =========================================================================
  // Recently processed
  // =========================================================================

  describe('recently processed', () => {
    it('shows no processed requests message when empty', () => {
      render(<SuppliersTab {...createDefaultProps()} />);
      expect(screen.getByText('No processed requests yet.')).toBeTruthy();
    });

    it('renders processed supplier rows', () => {
      const suppliers = [
        makePendingSupplier({ id: 'req-2', status: 'approved', requestedName: 'Approved Vendor', reviewedAt: '2024-01-05' }),
      ];
      render(<SuppliersTab {...createDefaultProps({ pendingSuppliers: suppliers })} />);
      expect(screen.getByText('Approved Vendor')).toBeTruthy();
    });
  });

  // =========================================================================
  // Refresh button
  // =========================================================================

  describe('refresh button', () => {
    it('calls refreshSuppliers on click', () => {
      const refresh = vi.fn();
      render(<SuppliersTab {...createDefaultProps({ refreshSuppliers: refresh })} />);
      const buttons = screen.getAllByText('Refresh');
      fireEvent.click(buttons[0]);
      expect(refresh).toHaveBeenCalled();
    });
  });
});
