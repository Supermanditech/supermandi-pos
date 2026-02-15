import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LimitedModeBanner, { LimitedModeIndicator } from '../../components/LimitedModeBanner';

describe('LimitedModeBanner', () => {
  it('renders null for active status', () => {
    const { container } = render(
      <LimitedModeBanner status="active" />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders null for verified status', () => {
    const { container } = render(
      <LimitedModeBanner status="verified" />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders null for ACTIVE (uppercase) status', () => {
    const { container } = render(
      <LimitedModeBanner status="ACTIVE" />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders banner for DRAFT status', () => {
    render(<LimitedModeBanner status="DRAFT" />);
    expect(screen.getByText(/LIMITED MODE/)).toBeInTheDocument();
    expect(screen.getByText('Status: Draft')).toBeInTheDocument();
    expect(screen.getByText(/Complete your registration/)).toBeInTheDocument();
  });

  it('renders banner for KYC_SUBMITTED status', () => {
    render(<LimitedModeBanner status="KYC_SUBMITTED" />);
    expect(screen.getByText('Status: Under Review')).toBeInTheDocument();
    expect(screen.getByText(/documents are being reviewed/)).toBeInTheDocument();
  });

  it('renders banner for pending status', () => {
    render(<LimitedModeBanner status="pending" />);
    expect(screen.getByText('Status: Pending')).toBeInTheDocument();
  });

  it('renders banner for NEEDS_FIX status', () => {
    render(<LimitedModeBanner status="NEEDS_FIX" />);
    expect(screen.getByText('Status: Action Required')).toBeInTheDocument();
    expect(screen.getByText(/Please update your information/)).toBeInTheDocument();
  });

  it('renders banner for rejected status', () => {
    render(<LimitedModeBanner status="rejected" />);
    expect(screen.getByText('Status: Rejected')).toBeInTheDocument();
  });

  it('renders banner for EXPIRED status', () => {
    render(<LimitedModeBanner status="EXPIRED" />);
    expect(screen.getByText('Status: Expired')).toBeInTheDocument();
  });

  it('falls back to pending config for unknown status', () => {
    render(<LimitedModeBanner status="some_unknown_status" />);
    expect(screen.getByText('Status: Pending')).toBeInTheDocument();
  });

  it('renders dismiss button when onDismiss is provided', () => {
    const onDismiss = jest.fn();
    render(<LimitedModeBanner status="DRAFT" onDismiss={onDismiss} />);
    const dismissBtn = screen.getByLabelText('Dismiss');
    expect(dismissBtn).toBeInTheDocument();
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not render dismiss button when onDismiss is not provided', () => {
    render(<LimitedModeBanner status="DRAFT" />);
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument();
  });

  it('renders restrictions details section', () => {
    render(<LimitedModeBanner status="DRAFT" />);
    expect(screen.getByText('View restrictions')).toBeInTheDocument();
    expect(screen.getByText('Add Products')).toBeInTheDocument();
    expect(screen.getByText('View Dashboard')).toBeInTheDocument();
  });
});

describe('LimitedModeIndicator', () => {
  it('renders null for active status', () => {
    const { container } = render(<LimitedModeIndicator status="active" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders null for verified status', () => {
    const { container } = render(<LimitedModeIndicator status="verified" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders indicator for DRAFT status', () => {
    render(<LimitedModeIndicator status="DRAFT" />);
    expect(screen.getByText(/Draft/)).toBeInTheDocument();
  });

  it('renders indicator for pending status', () => {
    render(<LimitedModeIndicator status="pending" />);
    expect(screen.getByText(/Pending/)).toBeInTheDocument();
  });

  it('falls back to pending for unknown status', () => {
    render(<LimitedModeIndicator status="xyz" />);
    expect(screen.getByText(/Pending/)).toBeInTheDocument();
  });
});
