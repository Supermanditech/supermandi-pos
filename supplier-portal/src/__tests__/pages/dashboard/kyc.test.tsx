import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import KycPage from '../../../app/(dashboard)/kyc/page';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock react-query
const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'kyc-documents') {
      return { data: [], isLoading: false };
    }
    if (queryKey[0] === 'kyc-status') {
      return {
        data: {
          payoutReady: false,
          message: 'Complete requirements',
          requirements: {
            bankVerified: false,
            panCardApproved: false,
            cancelledChequeApproved: false,
            profileVerified: false,
          },
        },
        isLoading: false,
      };
    }
    return { data: null };
  },
  useMutation: ({ onSuccess, onError }: any) => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('nav', { 'data-testid': 'breadcrumb' }),
  };
});

// Mock API
jest.mock('../../../lib/api', () => ({
  getKycDocuments: jest.fn(),
  getKycStatus: jest.fn(),
  uploadKycDocument: jest.fn(),
  deleteKycDocument: jest.fn(),
  verifyIFSC: jest.fn(),
  verifyBankAccount: jest.fn(),
}));

describe('KycPage', () => {
  it('renders the page heading', () => {
    render(<KycPage />);
    expect(screen.getByText('KYC & Bank Verification')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<KycPage />);
    expect(screen.getByText(/Upload documents and verify bank details/)).toBeInTheDocument();
  });

  it('renders payout readiness card', () => {
    render(<KycPage />);
    expect(screen.getByText('Complete Requirements for Payouts')).toBeInTheDocument();
  });

  it('renders requirements checklist', () => {
    render(<KycPage />);
    expect(screen.getByText('Bank Verified')).toBeInTheDocument();
    // PAN Card and Cancelled Cheque appear in both checklist and document types
    expect(screen.getAllByText('PAN Card').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Cancelled Cheque').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Profile Verified')).toBeInTheDocument();
  });

  it('renders KYC Documents tab (default active)', () => {
    render(<KycPage />);
    expect(screen.getByText('KYC Documents')).toBeInTheDocument();
  });

  it('renders Bank Verification tab', () => {
    render(<KycPage />);
    expect(screen.getByText('Bank Verification')).toBeInTheDocument();
  });

  it('renders document types when on documents tab', () => {
    render(<KycPage />);
    // PAN Card and Cancelled Cheque appear in both the checklist and document types
    expect(screen.getAllByText('PAN Card').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('GSTIN Certificate')).toBeInTheDocument();
    expect(screen.getAllByText('Cancelled Cheque').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Address Proof')).toBeInTheDocument();
    expect(screen.getByText('Business License')).toBeInTheDocument();
  });

  it('renders accepted formats info', () => {
    render(<KycPage />);
    expect(screen.getByText(/Accepted formats/)).toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG, PDF/)).toBeInTheDocument();
  });

  it('switches to Bank Verification tab', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByText('Bank Verification'));
    expect(screen.getByText(/Verify your bank account to receive payouts/)).toBeInTheDocument();
  });

  it('renders IFSC Code input on bank tab', () => {
    render(<KycPage />);
    fireEvent.click(screen.getByText('Bank Verification'));
    expect(screen.getByText('IFSC Code')).toBeInTheDocument();
    expect(screen.getByText('Verify IFSC')).toBeInTheDocument();
  });

  it('renders breadcrumb', () => {
    render(<KycPage />);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
