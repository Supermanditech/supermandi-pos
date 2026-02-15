// SuperAdmin — Test ConfirmDialog and EnrollmentResultModal components
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog, EnrollmentResultModal } from '../../components/ConfirmDialog';
import type { ConfirmDialogConfig, EnrollmentResult } from '../../components/ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    title: 'Confirm Action',
    message: 'Are you sure?',
    confirmLabel: 'Yes, Do It',
    variant: 'danger' as const,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it('renders title and message', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Confirm Action')).toBeTruthy();
    expect(screen.getByText('Are you sure?')).toBeTruthy();
  });

  it('renders confirm label', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Yes, Do It')).toBeTruthy();
  });

  it('shows detail text when provided', () => {
    render(<ConfirmDialog {...defaultProps} detail="This cannot be undone." />);
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
  });

  it('does not show detail when not provided', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.queryByText('This cannot be undone.')).toBeNull();
  });

  it('calls onConfirm on confirm button click', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Yes, Do It'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onCancel on Cancel button click', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows Processing... when loading', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);
    expect(screen.getByText('Processing...')).toBeTruthy();
  });

  it('disables buttons when loading', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);
    expect(screen.getByText('Processing...')).toHaveProperty('disabled', true);
    expect(screen.getByText('Cancel')).toHaveProperty('disabled', true);
  });

  it('renders warning variant', () => {
    render(<ConfirmDialog {...defaultProps} variant="warning" />);
    expect(screen.getByText('Yes, Do It')).toBeTruthy();
  });

  it('renders info variant', () => {
    render(<ConfirmDialog {...defaultProps} variant="info" />);
    expect(screen.getByText('Yes, Do It')).toBeTruthy();
  });

  it('calls onCancel when overlay is clicked and not loading', () => {
    const onCancel = vi.fn();
    const { container } = render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    const overlay = container.querySelector('.modalOverlay');
    if (overlay) fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('EnrollmentResultModal', () => {
  const defaultResult: EnrollmentResult = {
    enrollmentCode: 'ABC123',
    expiresAt: '2026-01-01T12:00:00Z',
    smsSent: true,
    emailSent: false,
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it('renders enrollment code', () => {
    render(<EnrollmentResultModal result={defaultResult} onClose={vi.fn()} />);
    expect(screen.getByText('ABC123')).toBeTruthy();
  });

  it('renders header', () => {
    render(<EnrollmentResultModal result={defaultResult} onClose={vi.fn()} />);
    expect(screen.getByText('Enrollment Code Sent')).toBeTruthy();
  });

  it('shows SMS Sent status', () => {
    render(<EnrollmentResultModal result={defaultResult} onClose={vi.fn()} />);
    expect(screen.getByText(/SMS:.*Sent/)).toBeTruthy();
  });

  it('shows Email Skipped status', () => {
    render(<EnrollmentResultModal result={defaultResult} onClose={vi.fn()} />);
    expect(screen.getByText(/Email:.*Skipped/)).toBeTruthy();
  });

  it('shows Copy to Clipboard button', () => {
    render(<EnrollmentResultModal result={defaultResult} onClose={vi.fn()} />);
    expect(screen.getByText('Copy to Clipboard')).toBeTruthy();
  });

  it('calls onClose on Close click', () => {
    const onClose = vi.fn();
    render(<EnrollmentResultModal result={defaultResult} onClose={onClose} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('copies code to clipboard on Copy click', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<EnrollmentResultModal result={defaultResult} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Copy to Clipboard'));
    expect(writeText).toHaveBeenCalledWith('ABC123');
  });
});
