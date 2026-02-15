import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LimitedModeBanner, { LimitedModeIndicator } from '../components/LimitedModeBanner';

describe('LimitedModeBanner', () => {
  it('renders nothing for ACTIVE status', () => {
    const { container } = render(<LimitedModeBanner status="ACTIVE" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for lowercase active status', () => {
    const { container } = render(<LimitedModeBanner status="active" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders DRAFT status with correct message', () => {
    render(<LimitedModeBanner status="DRAFT" />);
    expect(screen.getByText(/LIMITED MODE/)).toBeInTheDocument();
    expect(screen.getByText('Status: Draft')).toBeInTheDocument();
    expect(screen.getByText(/Complete your registration/)).toBeInTheDocument();
  });

  it('renders KYC_SUBMITTED status with review message', () => {
    render(<LimitedModeBanner status="KYC_SUBMITTED" />);
    expect(screen.getByText('Status: Under Review')).toBeInTheDocument();
    expect(screen.getByText(/documents are being reviewed/)).toBeInTheDocument();
  });

  it('renders NEEDS_FIX status with action required', () => {
    render(<LimitedModeBanner status="NEEDS_FIX" />);
    expect(screen.getByText('Status: Action Required')).toBeInTheDocument();
    expect(screen.getByText(/update your information/)).toBeInTheDocument();
  });

  it('renders SUSPENDED status', () => {
    render(<LimitedModeBanner status="SUSPENDED" />);
    expect(screen.getByText('Status: Suspended')).toBeInTheDocument();
    expect(screen.getByText(/temporarily suspended/)).toBeInTheDocument();
  });

  it('renders EXPIRED status', () => {
    render(<LimitedModeBanner status="EXPIRED" />);
    expect(screen.getByText('Status: Expired')).toBeInTheDocument();
  });

  it('falls back to DRAFT config for unknown status', () => {
    render(<LimitedModeBanner status="UNKNOWN_STATUS" />);
    expect(screen.getByText('Status: Draft')).toBeInTheDocument();
  });

  it('shows restricted/allowed actions in details', () => {
    render(<LimitedModeBanner status="DRAFT" />);
    const details = screen.getByText('View restrictions');
    expect(details).toBeInTheDocument();
    fireEvent.click(details);
    expect(screen.getByText('Create Sales')).toBeInTheDocument();
    expect(screen.getByText('View Dashboard')).toBeInTheDocument();
  });

  it('shows dismiss button when onDismiss is provided', () => {
    const onDismiss = vi.fn();
    render(<LimitedModeBanner status="DRAFT" onDismiss={onDismiss} />);
    const dismissBtn = screen.getByLabelText('Dismiss');
    expect(dismissBtn).toBeInTheDocument();
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not show dismiss button when onDismiss is not provided', () => {
    render(<LimitedModeBanner status="DRAFT" />);
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument();
  });
});

describe('LimitedModeIndicator', () => {
  it('renders nothing for ACTIVE status', () => {
    const { container } = render(<LimitedModeIndicator status="ACTIVE" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders compact indicator for DRAFT status', () => {
    render(<LimitedModeIndicator status="DRAFT" />);
    expect(screen.getByText(/Draft/)).toBeInTheDocument();
  });

  it('renders compact indicator for SUSPENDED status', () => {
    render(<LimitedModeIndicator status="SUSPENDED" />);
    expect(screen.getByText(/Suspended/)).toBeInTheDocument();
  });
});
