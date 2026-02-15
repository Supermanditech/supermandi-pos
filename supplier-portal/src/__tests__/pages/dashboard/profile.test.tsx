import { render, screen, fireEvent } from '@testing-library/react';
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

// Mock auth context
jest.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    supplier: {
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
    },
    refreshProfile: jest.fn(),
  }),
}));

// Mock react-query
jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
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
    default: () => React.createElement('nav', { 'data-testid': 'breadcrumb' }),
  };
});

describe('ProfilePage', () => {
  it('renders the page heading', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Profile Settings')).toBeInTheDocument();
  });

  it('renders business name', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Test Supplier Co')).toBeInTheDocument();
  });

  it('renders GSTIN', () => {
    render(<ProfilePage />);
    expect(screen.getByText(/GSTIN: 22AAAAA0000A1Z5/)).toBeInTheDocument();
  });

  it('renders verification status badge', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('renders Contact Details tab (default active)', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Contact Details')).toBeInTheDocument();
  });

  it('renders Bank Details tab', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Bank Details')).toBeInTheDocument();
  });

  it('renders Change Password tab', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Change Password')).toBeInTheDocument();
  });

  it('renders contact form fields on profile tab', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Contact Person Name')).toBeInTheDocument();
    expect(screen.getByText('Email Address')).toBeInTheDocument();
    expect(screen.getByText('Phone Number')).toBeInTheDocument();
    expect(screen.getByText('Business Address')).toBeInTheDocument();
    expect(screen.getByText('City')).toBeInTheDocument();
    // Note: "State" appears in address but we check for the label
    expect(screen.getByText('PIN Code')).toBeInTheDocument();
  });

  it('renders Save Changes button on profile tab', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('shows email as disabled', () => {
    render(<ProfilePage />);
    const emailInput = screen.getByDisplayValue('john@test.com');
    expect(emailInput).toBeDisabled();
  });

  it('switches to password tab', () => {
    render(<ProfilePage />);
    // Click the tab (first occurrence of 'Change Password')
    const changePasswordElements = screen.getAllByText('Change Password');
    fireEvent.click(changePasswordElements[0]);
    expect(screen.getByText('Current Password')).toBeInTheDocument();
    expect(screen.getByText('New Password')).toBeInTheDocument();
    expect(screen.getByText('Confirm New Password')).toBeInTheDocument();
    // After switching, 'Change Password' appears as both tab label and submit button
    expect(screen.getAllByText('Change Password').length).toBeGreaterThanOrEqual(2);
  });

  it('switches to bank tab', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByText('Bank Details'));
    expect(screen.getByText('Account Holder Name')).toBeInTheDocument();
    expect(screen.getByText('Bank Name')).toBeInTheDocument();
    expect(screen.getByText('Account Number')).toBeInTheDocument();
    expect(screen.getByText('IFSC Code')).toBeInTheDocument();
  });

  it('renders breadcrumb', () => {
    render(<ProfilePage />);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
