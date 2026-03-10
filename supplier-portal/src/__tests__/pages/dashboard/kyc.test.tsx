import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import KycPage from '../../../app/(dashboard)/kyc/page';

// Mock react-hot-toast
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  }),
}));

// Configurable mock data for useQuery
let mockDocuments: any[] = [];
let mockKycStatus: any = {
  payoutReady: false,
  message: 'Complete requirements',
  requirements: {
    bankVerified: false,
    panCardApproved: false,
    cancelledChequeApproved: false,
    profileVerified: false,
  },
};
let mockDocsLoading = false;
let mockStatusLoading = false;

// Track mutation calls
let uploadMutationFn: any = null;
let deleteMutationFn: any = null;
let ifscMutationFn: any = null;
let bankVerifyMutationFn: any = null;
let uploadIsPending = false;
let deleteIsPending = false;
let ifscIsPending = false;
let bankVerifyIsPending = false;

const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'kyc-documents') {
      return { data: mockDocuments, isLoading: mockDocsLoading };
    }
    if (queryKey[0] === 'kyc-status') {
      return { data: mockKycStatus, isLoading: mockStatusLoading };
    }
    return { data: null };
  },
  useMutation: ({ mutationFn, onSuccess, onError }: any) => {
    // Determine which mutation by examining the function
    // We use a ref pattern to track callbacks
    const mutate = jest.fn((...args: any[]) => {
      // Store for external triggering if needed
    });
    // Return based on what's being registered
    // We distinguish by checking mutationFn identity, but since they're imported mocks,
    // we track by order of registration (upload, delete, ifsc, bankVerify)
    if (!uploadMutationFn) {
      uploadMutationFn = { mutate, onSuccess, onError, reset: jest.fn() };
      return { mutate, isPending: uploadIsPending, reset: jest.fn() };
    } else if (!deleteMutationFn) {
      deleteMutationFn = { mutate, onSuccess, onError };
      return { mutate, isPending: deleteIsPending };
    } else if (!ifscMutationFn) {
      ifscMutationFn = { mutate, onSuccess, onError, reset: jest.fn() };
      return { mutate, isPending: ifscIsPending, reset: jest.fn() };
    } else if (!bankVerifyMutationFn) {
      bankVerifyMutationFn = { mutate, onSuccess, onError };
      return { mutate, isPending: bankVerifyIsPending };
    }
    return { mutate, isPending: false };
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ items }: any) => React.createElement('nav', { 'data-testid': 'breadcrumb' },
      items?.map((item: any, i: number) => React.createElement('span', { key: i }, item.label))
    ),
  };
});

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  CheckCircle2: ({ size }: any) => require('react').createElement('span', { 'data-testid': 'check-circle-icon' }, '✓'),
  Clock: ({ size }: any) => require('react').createElement('span', { 'data-testid': 'clock-icon' }, '⏰'),
}));

// Mock API
jest.mock('../../../lib/api', () => ({
  getKycDocuments: jest.fn(),
  getKycStatus: jest.fn(),
  uploadKycDocument: jest.fn(),
  deleteKycDocument: jest.fn(),
  verifyIFSC: jest.fn(),
  verifyBankAccount: jest.fn(),
}));

// Mock fileLimits
jest.mock('../../../lib/fileLimits', () => ({
  MAX_KYC_DOCUMENT_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_KYC_DOCUMENT_SIZE_LABEL: '5MB',
}));

describe('KycPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocuments = [];
    mockKycStatus = {
      payoutReady: false,
      message: 'Complete requirements',
      requirements: {
        bankVerified: false,
        panCardApproved: false,
        cancelledChequeApproved: false,
        profileVerified: false,
      },
    };
    mockDocsLoading = false;
    mockStatusLoading = false;
    uploadIsPending = false;
    deleteIsPending = false;
    ifscIsPending = false;
    bankVerifyIsPending = false;
    uploadMutationFn = null;
    deleteMutationFn = null;
    ifscMutationFn = null;
    bankVerifyMutationFn = null;
  });

  // ── Page Header & Structure ──────────────────────────────────

  it('renders the page heading', () => {
    render(<KycPage />);
    expect(screen.getByText('KYC & Bank Verification')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<KycPage />);
    expect(screen.getByText(/Upload documents and verify bank details/)).toBeInTheDocument();
  });

  it('renders breadcrumb with Dashboard and KYC', () => {
    render(<KycPage />);
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('KYC')).toBeInTheDocument();
  });

  // ── Payout Readiness Card ────────────────────────────────────

  it('renders payout not-ready card when requirements incomplete', () => {
    render(<KycPage />);
    expect(screen.getByText('Complete Requirements for Payouts')).toBeInTheDocument();
    expect(screen.getByText('Complete requirements')).toBeInTheDocument();
  });

  it('renders payout ready card when all requirements met', () => {
    mockKycStatus = {
      payoutReady: true,
      message: 'All requirements met!',
      requirements: {
        bankVerified: true,
        panCardApproved: true,
        cancelledChequeApproved: true,
        profileVerified: true,
      },
    };
    render(<KycPage />);
    expect(screen.getByText('Payout Ready!')).toBeInTheDocument();
  });

  it('renders requirements checklist items', () => {
    render(<KycPage />);
    expect(screen.getByText('Bank Verified')).toBeInTheDocument();
    expect(screen.getByText('Profile Verified')).toBeInTheDocument();
    // PAN Card and Cancelled Cheque appear in both checklist and document types
    expect(screen.getAllByText('PAN Card').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Cancelled Cheque').length).toBeGreaterThanOrEqual(2);
  });

  it('shows loading skeleton when status is loading', () => {
    mockStatusLoading = true;
    mockKycStatus = null;
    render(<KycPage />);
    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeTruthy();
  });

  // ── Tabs ─────────────────────────────────────────────────────

  it('renders KYC Documents tab as default active', () => {
    render(<KycPage />);
    const docsTab = screen.getByRole('tab', { name: 'KYC Documents' });
    expect(docsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders Bank Verification tab', () => {
    render(<KycPage />);
    expect(screen.getByRole('tab', { name: 'Bank Verification' })).toBeInTheDocument();
  });

  it('switches to Bank Verification tab', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    expect(screen.getByText(/Verify your bank account to receive payouts/)).toBeInTheDocument();
  });

  it('switches back to Documents tab', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    fireEvent.click(screen.getByRole('tab', { name: 'KYC Documents' }));
    expect(screen.getByText(/Accepted formats/)).toBeInTheDocument();
  });

  // ── Documents Tab ────────────────────────────────────────────

  it('renders accepted formats info', () => {
    render(<KycPage />);
    expect(screen.getByText(/Accepted formats/)).toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG, PDF/)).toBeInTheDocument();
  });

  it('renders all 5 document types', () => {
    render(<KycPage />);
    expect(screen.getAllByText('PAN Card').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('GSTIN Certificate')).toBeInTheDocument();
    expect(screen.getAllByText('Cancelled Cheque').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Address Proof')).toBeInTheDocument();
    expect(screen.getByText('Business License')).toBeInTheDocument();
  });

  it('shows Required label for required document types', () => {
    render(<KycPage />);
    const requiredLabels = screen.getAllByText('Required');
    // PAN Card and Cancelled Cheque are required
    expect(requiredLabels.length).toBe(2);
  });

  it('shows document descriptions', () => {
    render(<KycPage />);
    expect(screen.getByText('Business or proprietor PAN')).toBeInTheDocument();
    expect(screen.getByText('GST registration certificate')).toBeInTheDocument();
    expect(screen.getByText('For bank account verification')).toBeInTheDocument();
  });

  it('renders Upload button for each document type', () => {
    render(<KycPage />);
    const uploadButtons = screen.getAllByText('Upload');
    expect(uploadButtons.length).toBe(5);
  });

  it('renders hidden file inputs with correct accept attribute', () => {
    render(<KycPage />);
    const fileInputs = document.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBe(5);
    fileInputs.forEach(input => {
      expect(input).toHaveAttribute('accept', '.jpg,.jpeg,.png,.pdf');
    });
  });

  it('renders file input with aria-label for accessibility', () => {
    render(<KycPage />);
    expect(screen.getByLabelText('Upload PAN Card')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload GSTIN Certificate')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload Cancelled Cheque')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload Address Proof')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload Business License')).toBeInTheDocument();
  });

  // ── Documents Tab with existing documents ────────────────────

  it('shows status badge for uploaded document', () => {
    mockDocuments = [
      { id: 'doc1', documentType: 'pan_card', status: 'pending', fileName: 'pan.pdf', fileSize: 102400 },
    ];
    render(<KycPage />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText(/pan\.pdf/)).toBeInTheDocument();
  });

  it('shows approved status badge', () => {
    mockDocuments = [
      { id: 'doc1', documentType: 'pan_card', status: 'approved', fileName: 'pan.pdf', fileSize: 102400 },
    ];
    render(<KycPage />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('shows rejected status with rejection reason', () => {
    mockDocuments = [
      { id: 'doc1', documentType: 'pan_card', status: 'rejected', fileName: 'pan.pdf', fileSize: 102400, rejectionReason: 'Blurry image' },
    ];
    render(<KycPage />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Reason: Blurry image')).toBeInTheDocument();
  });

  it('shows Replace button when document already exists', () => {
    mockDocuments = [
      { id: 'doc1', documentType: 'pan_card', status: 'approved', fileName: 'pan.pdf', fileSize: 102400 },
    ];
    render(<KycPage />);
    expect(screen.getByText('Replace')).toBeInTheDocument();
  });

  it('shows Delete button when document exists', () => {
    mockDocuments = [
      { id: 'doc1', documentType: 'pan_card', status: 'pending', fileName: 'pan.pdf', fileSize: 102400 },
    ];
    render(<KycPage />);
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('shows Confirm Delete on second click (two-click delete)', () => {
    mockDocuments = [
      { id: 'doc1', documentType: 'pan_card', status: 'pending', fileName: 'pan.pdf', fileSize: 102400 },
    ];
    render(<KycPage />);
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
  });

  it('formats file size correctly for KB', () => {
    mockDocuments = [
      { id: 'doc1', documentType: 'pan_card', status: 'pending', fileName: 'pan.pdf', fileSize: 512000 },
    ];
    render(<KycPage />);
    expect(screen.getByText(/500\.0 KB/)).toBeInTheDocument();
  });

  it('formats file size correctly for MB', () => {
    mockDocuments = [
      { id: 'doc1', documentType: 'pan_card', status: 'pending', fileName: 'pan.pdf', fileSize: 2621440 },
    ];
    render(<KycPage />);
    expect(screen.getByText(/2\.5 MB/)).toBeInTheDocument();
  });

  // ── Bank Verification Tab ────────────────────────────────────

  it('renders bank verification form fields', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    expect(screen.getByText('IFSC Code')).toBeInTheDocument();
    expect(screen.getByText('Account Number')).toBeInTheDocument();
    expect(screen.getByText('Confirm Account Number')).toBeInTheDocument();
    expect(screen.getByText('Account Holder Name')).toBeInTheDocument();
  });

  it('renders Verify IFSC button', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    expect(screen.getByText('Verify IFSC')).toBeInTheDocument();
  });

  it('disables Verify IFSC button when IFSC code is not 11 chars', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    const verifyBtn = screen.getByText('Verify IFSC').closest('button');
    expect(verifyBtn).toBeDisabled();
  });

  it('renders Verify & Save Bank Details submit button', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    expect(screen.getByText('Verify & Save Bank Details')).toBeInTheDocument();
  });

  it('disables submit when IFSC not verified', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    const submitBtn = screen.getByText('Verify & Save Bank Details').closest('button');
    expect(submitBtn).toBeDisabled();
  });

  it('shows account number minimum length hint', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    const accountInput = screen.getByPlaceholderText('9-18 digit account number');
    fireEvent.change(accountInput, { target: { value: '12345' } });
    expect(screen.getByText('Account number must be at least 9 digits')).toBeInTheDocument();
  });

  it('shows account number mismatch warning', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    const accountInput = screen.getByPlaceholderText('9-18 digit account number');
    const confirmInput = screen.getByPlaceholderText('Re-enter account number');
    fireEvent.change(accountInput, { target: { value: '123456789' } });
    fireEvent.change(confirmInput, { target: { value: '987654321' } });
    expect(screen.getByText('Account numbers do not match')).toBeInTheDocument();
  });

  it('uppercases IFSC input', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    const ifscInput = screen.getByPlaceholderText('e.g., HDFC0001234');
    fireEvent.change(ifscInput, { target: { value: 'hdfc0001234' } });
    expect((ifscInput as HTMLInputElement).value).toBe('HDFC0001234');
  });

  it('strips non-digits from account number input', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    const accountInput = screen.getByPlaceholderText('9-18 digit account number');
    fireEvent.change(accountInput, { target: { value: '12ab34cd5678' } });
    expect((accountInput as HTMLInputElement).value).toBe('12345678');
  });

  it('renders bank name hint for account holder', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    expect(screen.getByText(/Must match the name on your bank account/)).toBeInTheDocument();
  });

  it('shows important notice about business name', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    expect(screen.getByText(/Ensure the account is in your business name/)).toBeInTheDocument();
  });

  // ── Bank Verified State ──────────────────────────────────────

  it('shows read-only verified state when bank is verified', () => {
    mockKycStatus = {
      ...mockKycStatus,
      requirements: { ...mockKycStatus.requirements, bankVerified: true },
    };
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    expect(screen.getByText('Bank Account Verified')).toBeInTheDocument();
    expect(screen.getByText(/ready for payouts/)).toBeInTheDocument();
    expect(screen.getByText(/contact support/)).toBeInTheDocument();
  });

  it('hides bank form when already verified', () => {
    mockKycStatus = {
      ...mockKycStatus,
      requirements: { ...mockKycStatus.requirements, bankVerified: true },
    };
    render(<KycPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Verification' }));
    expect(screen.queryByText('Verify & Save Bank Details')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g., HDFC0001234')).not.toBeInTheDocument();
  });

  // ── Tablist Accessibility ────────────────────────────────────

  it('has proper tablist role', () => {
    render(<KycPage />);
    expect(screen.getByRole('tablist', { name: 'KYC sections' })).toBeInTheDocument();
  });

  it('tabs have correct aria-selected state', () => {
    render(<KycPage />);
    const docsTab = screen.getByRole('tab', { name: 'KYC Documents' });
    const bankTab = screen.getByRole('tab', { name: 'Bank Verification' });
    expect(docsTab).toHaveAttribute('aria-selected', 'true');
    expect(bankTab).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(bankTab);
    expect(docsTab).toHaveAttribute('aria-selected', 'false');
    expect(bankTab).toHaveAttribute('aria-selected', 'true');
  });
});
