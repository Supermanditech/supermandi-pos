import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfilePage from '../../../app/(dashboard)/profile/page';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Configurable auth mock
let mockSupplier: any = {
  businessName: 'Test Supplier Co',
  gstin: '22AAAAA0000A1Z5',
  verificationStatus: 'verified',
  contactName: 'John Doe',
  email: 'john@test.com',
  phone: '+919876543210',
  address: '123 Main St',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001',
  bankDetails: {
    accountName: 'Test Supplier',
    accountNumber: '1234567890',
    ifscCode: 'HDFC0001234',
    bankName: 'HDFC Bank',
  },
  bankVerificationStatus: null,
  emailVerified: true,
};
let mockAuthLoading = false;
const mockRefreshProfile = jest.fn();
jest.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    supplier: mockSupplier,
    refreshProfile: mockRefreshProfile,
    isLoading: mockAuthLoading,
  }),
}));

// Configurable useMutation mock
let profileMutateFn: jest.Mock;
let passwordMutateFn: jest.Mock;
let profileMutationPending = false;
let passwordMutationPending = false;
let profileMutationCallbacks: { onSuccess?: Function; onError?: Function } = {};
let passwordMutationCallbacks: { onSuccess?: Function; onError?: Function } = {};
const mockInvalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useMutation: (opts: any) => {
    // Distinguish by mutationFn identity
    const fnName = opts.mutationFn?.name || opts.mutationFn?.toString() || '';
    if (fnName.includes('changePassword') || fnName === 'changePassword') {
      passwordMutationCallbacks = { onSuccess: opts.onSuccess, onError: opts.onError };
      return { mutate: passwordMutateFn, isPending: passwordMutationPending };
    }
    profileMutationCallbacks = { onSuccess: opts.onSuccess, onError: opts.onError };
    return { mutate: profileMutateFn, isPending: profileMutationPending };
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// Mock API
jest.mock('../../../lib/api', () => ({
  updateSupplierProfile: jest.fn(),
  changePassword: jest.fn(),
}));

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ items }: any) =>
      React.createElement('nav', { 'data-testid': 'breadcrumb' },
        items.map((item: any, i: number) =>
          React.createElement('span', { key: i }, item.label)
        )
      ),
  };
});

// Mock useNavigationSafety
jest.mock('../../../hooks/useNavigationSafety', () => ({
  useUnsavedChanges: jest.fn(),
}));

describe('ProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupplier = {
      businessName: 'Test Supplier Co',
      gstin: '22AAAAA0000A1Z5',
      verificationStatus: 'verified',
      contactName: 'John Doe',
      email: 'john@test.com',
      phone: '+919876543210',
      address: '123 Main St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      bankDetails: {
        accountName: 'Test Supplier',
        accountNumber: '1234567890',
        ifscCode: 'HDFC0001234',
        bankName: 'HDFC Bank',
      },
      bankVerificationStatus: null,
      emailVerified: true,
    };
    mockAuthLoading = false;
    profileMutateFn = jest.fn();
    passwordMutateFn = jest.fn();
    profileMutationPending = false;
    passwordMutationPending = false;
    profileMutationCallbacks = {};
    passwordMutationCallbacks = {};
  });

  // ── Header & Breadcrumb ───────────────────────────────────────

  it('renders page heading', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Profile Settings')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<ProfilePage />);
    expect(screen.getByText(/Manage your business profile, security settings/)).toBeInTheDocument();
  });

  it('renders breadcrumb with Dashboard and Profile', () => {
    render(<ProfilePage />);
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toHaveTextContent('Dashboard');
    expect(breadcrumb).toHaveTextContent('Profile');
  });

  // ── Business Info Card ────────────────────────────────────────

  it('renders business name', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Test Supplier Co')).toBeInTheDocument();
  });

  it('renders GSTIN', () => {
    render(<ProfilePage />);
    expect(screen.getByText(/GSTIN: 22AAAAA0000A1Z5/)).toBeInTheDocument();
  });

  it('renders Verified status badge', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('renders Pending status badge', () => {
    mockSupplier = { ...mockSupplier, verificationStatus: 'pending' };
    render(<ProfilePage />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders Rejected status badge', () => {
    mockSupplier = { ...mockSupplier, verificationStatus: 'rejected' };
    render(<ProfilePage />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  // ── Tabs ──────────────────────────────────────────────────────

  it('renders tablist with 3 tabs', () => {
    render(<ProfilePage />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
  });

  it('renders Contact Details tab as default selected', () => {
    render(<ProfilePage />);
    const contactTab = screen.getByRole('tab', { name: 'Contact Details' });
    expect(contactTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders Bank Details tab', () => {
    render(<ProfilePage />);
    expect(screen.getByRole('tab', { name: 'Bank Details' })).toBeInTheDocument();
  });

  it('renders Change Password tab', () => {
    render(<ProfilePage />);
    expect(screen.getByRole('tab', { name: 'Change Password' })).toBeInTheDocument();
  });

  // ── Contact Details Tab (Default) ─────────────────────────────

  it('renders contact form fields', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Contact Person Name')).toBeInTheDocument();
    expect(screen.getByText('Email Address')).toBeInTheDocument();
    expect(screen.getByText('Phone Number')).toBeInTheDocument();
    expect(screen.getByText('Business Address')).toBeInTheDocument();
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByText('PIN Code')).toBeInTheDocument();
  });

  it('pre-fills contact form from supplier data', () => {
    render(<ProfilePage />);
    expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('john@test.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+919876543210')).toBeInTheDocument();
    expect(screen.getByDisplayValue('123 Main St')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mumbai')).toBeInTheDocument();
    expect(screen.getByDisplayValue('400001')).toBeInTheDocument();
  });

  it('shows email as disabled', () => {
    render(<ProfilePage />);
    const emailInput = screen.getByDisplayValue('john@test.com');
    expect(emailInput).toBeDisabled();
  });

  it('shows email cannot be changed helper text', () => {
    render(<ProfilePage />);
    expect(screen.getByText(/Email cannot be changed/)).toBeInTheDocument();
  });

  it('renders Save Changes button on profile tab', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('allows editing contact name', () => {
    render(<ProfilePage />);
    const nameInput = screen.getByDisplayValue('John Doe');
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });
    expect(nameInput).toHaveValue('Jane Doe');
  });

  // ── Bank Details Tab ──────────────────────────────────────────

  it('switches to bank tab and shows fields', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Details' }));
    expect(screen.getByText('Account Holder Name')).toBeInTheDocument();
    expect(screen.getByText('Bank Name')).toBeInTheDocument();
    expect(screen.getByText('Account Number')).toBeInTheDocument();
    expect(screen.getByText('IFSC Code')).toBeInTheDocument();
  });

  it('pre-fills bank details from supplier data', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Details' }));
    expect(screen.getByDisplayValue('Test Supplier')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1234567890')).toBeInTheDocument();
    expect(screen.getByDisplayValue('HDFC0001234')).toBeInTheDocument();
    expect(screen.getByDisplayValue('HDFC Bank')).toBeInTheDocument();
  });

  it('renders Save Bank Details button', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Details' }));
    expect(screen.getByText('Save Bank Details')).toBeInTheDocument();
  });

  it('shows bank info box about payouts', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Details' }));
    expect(screen.getByText(/Bank details are used for order payouts/)).toBeInTheDocument();
  });

  it('shows pending bank verification banner', () => {
    mockSupplier = { ...mockSupplier, bankVerificationStatus: 'pending' };
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Details' }));
    expect(screen.getByText(/Bank details are under review/)).toBeInTheDocument();
  });

  it('shows rejected bank verification banner', () => {
    mockSupplier = { ...mockSupplier, bankVerificationStatus: 'rejected' };
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Details' }));
    expect(screen.getByText(/Bank details were rejected/)).toBeInTheDocument();
  });

  it('shows verified bank verification banner', () => {
    mockSupplier = { ...mockSupplier, bankVerificationStatus: 'verified' };
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Details' }));
    expect(screen.getByText('Bank details verified.')).toBeInTheDocument();
  });

  it('uppercases IFSC input', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Details' }));
    const ifscInput = screen.getByDisplayValue('HDFC0001234');
    fireEvent.change(ifscInput, { target: { value: 'sbin0001234' } });
    expect(ifscInput).toHaveValue('SBIN0001234');
  });

  // ── Change Password Tab ───────────────────────────────────────

  it('switches to password tab and shows fields', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Change Password' }));
    expect(screen.getByText('Current Password')).toBeInTheDocument();
    expect(screen.getByText('New Password')).toBeInTheDocument();
    expect(screen.getByText('Confirm New Password')).toBeInTheDocument();
  });

  it('renders Change Password submit button', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Change Password' }));
    // Tab label + submit button
    expect(screen.getAllByText('Change Password').length).toBeGreaterThanOrEqual(2);
  });

  it('renders password strength checklist', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Change Password' }));
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    expect(screen.getByText('One uppercase letter')).toBeInTheDocument();
    expect(screen.getByText('One lowercase letter')).toBeInTheDocument();
    expect(screen.getByText('One digit')).toBeInTheDocument();
  });

  it('renders show/hide toggle for current password', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Change Password' }));
    expect(screen.getByLabelText('Show current password')).toBeInTheDocument();
  });

  it('toggles current password visibility', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Change Password' }));
    const toggle = screen.getByLabelText('Show current password');
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Hide current password')).toBeInTheDocument();
  });

  it('renders show/hide toggle for new password', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Change Password' }));
    expect(screen.getByLabelText('Show new password')).toBeInTheDocument();
  });

  it('renders show/hide toggle for confirm password', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Change Password' }));
    expect(screen.getByLabelText('Show confirm password')).toBeInTheDocument();
  });

  it('shows password mismatch warning', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Change Password' }));
    const newPw = screen.getByPlaceholderText('Minimum 8 characters');
    const confirmPw = screen.getByPlaceholderText('Re-enter new password');
    fireEvent.change(newPw, { target: { value: 'Password1' } });
    fireEvent.change(confirmPw, { target: { value: 'Password2' } });
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  it('hides password mismatch when passwords match', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Change Password' }));
    const newPw = screen.getByPlaceholderText('Minimum 8 characters');
    const confirmPw = screen.getByPlaceholderText('Re-enter new password');
    fireEvent.change(newPw, { target: { value: 'Password1' } });
    fireEvent.change(confirmPw, { target: { value: 'Password1' } });
    expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
  });

  // ── Loading State ─────────────────────────────────────────────

  it('renders loading skeleton when auth is loading', () => {
    mockAuthLoading = true;
    render(<ProfilePage />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
    // Should NOT show the form
    expect(screen.queryByText('Profile Settings')).not.toBeInTheDocument();
  });

  // ── Edge Cases ────────────────────────────────────────────────

  it('handles supplier with no bank details', () => {
    mockSupplier = { ...mockSupplier, bankDetails: null };
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Details' }));
    // Should still render the form with empty fields
    expect(screen.getByText('Account Holder Name')).toBeInTheDocument();
  });

  it('handles supplier with missing GSTIN', () => {
    mockSupplier = { ...mockSupplier, gstin: null };
    render(<ProfilePage />);
    expect(screen.getByText(/GSTIN: —/)).toBeInTheDocument();
  });

  it('switches between all three tabs', () => {
    render(<ProfilePage />);
    // Start on contact
    expect(screen.getByText('Contact Person Name')).toBeInTheDocument();
    // Switch to bank
    fireEvent.click(screen.getByRole('tab', { name: 'Bank Details' }));
    expect(screen.getByText('Account Holder Name')).toBeInTheDocument();
    // Switch to password
    fireEvent.click(screen.getByRole('tab', { name: 'Change Password' }));
    expect(screen.getByText('Current Password')).toBeInTheDocument();
    // Back to contact
    fireEvent.click(screen.getByRole('tab', { name: 'Contact Details' }));
    expect(screen.getByText('Contact Person Name')).toBeInTheDocument();
  });
});
