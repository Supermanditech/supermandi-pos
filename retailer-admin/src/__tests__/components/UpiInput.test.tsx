import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UpiInput, { validateUpiVpa } from '../../components/UpiInput';

describe('validateUpiVpa', () => {
  it('returns undefined for valid UPI VPA', () => {
    expect(validateUpiVpa('store@ybl')).toBeUndefined();
    expect(validateUpiVpa('9876543210@paytm')).toBeUndefined();
    expect(validateUpiVpa('my.store@okaxis')).toBeUndefined();
    expect(validateUpiVpa('test_user@upi')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(validateUpiVpa('')).toBeUndefined();
  });

  it('returns error for VPA too short (less than 6 chars)', () => {
    expect(validateUpiVpa('a@b')).toBe('UPI VPA must be at least 6 characters');
    expect(validateUpiVpa('ab@cd')).toBe('UPI VPA must be at least 6 characters');
  });

  it('returns error for VPA too long (more than 100 chars)', () => {
    const longVpa = 'a'.repeat(95) + '@b'.repeat(10);
    expect(validateUpiVpa(longVpa)).toBe('UPI VPA cannot exceed 100 characters');
  });

  it('returns error for invalid format (no @ symbol)', () => {
    expect(validateUpiVpa('storeybl')).toBe('Invalid UPI VPA format. Use: name@bank (e.g., store@ybl)');
  });

  it('returns error for invalid format (too short before @)', () => {
    expect(validateUpiVpa('ab@bank')).toBe('Invalid UPI VPA format. Use: name@bank (e.g., store@ybl)');
  });

  it('returns error for invalid format (too short after @)', () => {
    expect(validateUpiVpa('store@y')).toBe('Invalid UPI VPA format. Use: name@bank (e.g., store@ybl)');
  });

  it('returns error for invalid characters', () => {
    expect(validateUpiVpa('store name@ybl')).toBe('Invalid UPI VPA format. Use: name@bank (e.g., store@ybl)');
    expect(validateUpiVpa('store!@ybl')).toBe('Invalid UPI VPA format. Use: name@bank (e.g., store@ybl)');
  });

  it('accepts alphanumeric, dots, underscores, and dashes', () => {
    expect(validateUpiVpa('my-store.123@ybl')).toBeUndefined();
    expect(validateUpiVpa('test_user-1.2.3@paytm')).toBeUndefined();
  });
});

describe('UpiInput', () => {
  it('renders input field with label', () => {
    render(<UpiInput value="" onChange={vi.fn()} />);

    // Label exists but is not associated with input via htmlFor, so use text query
    expect(screen.getByText(/UPI VPA \(Virtual Payment Address\)/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('yourstore@upi')).toBeInTheDocument();
  });

  it('renders required asterisk when required prop is true', () => {
    const { container } = render(<UpiInput value="" onChange={vi.fn()} required />);

    // Find the label element and check it contains the asterisk
    const label = container.querySelector('label');
    expect(label).toBeInTheDocument();
    expect(label?.innerHTML).toContain('*');
  });

  it('calls onChange with lowercase value when user types', () => {
    const onChange = vi.fn();
    render(<UpiInput value="" onChange={onChange} />);

    const input = screen.getByPlaceholderText('yourstore@upi');
    fireEvent.change(input, { target: { value: 'STORE@YBL' } });

    expect(onChange).toHaveBeenCalledWith('store@ybl');
  });

  it('shows error message after blur with invalid VPA', () => {
    render(<UpiInput value="invalid" onChange={vi.fn()} />);

    const input = screen.getByPlaceholderText('yourstore@upi');

    // Initially no error shown
    expect(screen.queryByText(/Invalid UPI VPA format/)).not.toBeInTheDocument();

    // Blur triggers validation
    fireEvent.blur(input);

    expect(screen.getByText(/Invalid UPI VPA format/)).toBeInTheDocument();
  });

  it('does not show error before blur (untouched state)', () => {
    render(<UpiInput value="invalid" onChange={vi.fn()} />);

    expect(screen.queryByText(/Invalid UPI VPA format/)).not.toBeInTheDocument();
  });

  it('shows required error when required and empty after blur', () => {
    render(<UpiInput value="" onChange={vi.fn()} required />);

    const input = screen.getByPlaceholderText('yourstore@upi');
    fireEvent.blur(input);

    expect(screen.getByText(/UPI VPA is required/)).toBeInTheDocument();
  });

  it('shows help text when no error', () => {
    render(<UpiInput value="" onChange={vi.fn()} />);

    expect(
      screen.getByText(/Enter your UPI VPA for receiving payments/i)
    ).toBeInTheDocument();
  });

  it('hides help text when error is shown', () => {
    render(<UpiInput value="invalid" onChange={vi.fn()} />);

    const input = screen.getByPlaceholderText('yourstore@upi');
    fireEvent.blur(input);

    expect(
      screen.queryByText(/Enter your UPI VPA for receiving payments/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Invalid UPI VPA format/)).toBeInTheDocument();
  });

  it('disables input when disabled prop is true', () => {
    render(<UpiInput value="store@ybl" onChange={vi.fn()} disabled />);

    const input = screen.getByPlaceholderText('yourstore@upi');
    expect(input).toBeDisabled();
  });

  it('has upi-input class for default styling (border via CSS)', () => {
    render(<UpiInput value="" onChange={vi.fn()} />);

    const input = screen.getByPlaceholderText('yourstore@upi');

    // Default state: has upi-input class, no error class
    expect(input.className).toContain('upi-input');
    expect(input.className).not.toContain('upi-input--error');
  });

  it('applies error class when there is an error', () => {
    render(<UpiInput value="invalid" onChange={vi.fn()} />);

    const input = screen.getByPlaceholderText('yourstore@upi');

    // Before blur - no error class
    expect(input.className).not.toContain('upi-input--error');

    // Trigger error by blurring
    fireEvent.blur(input);

    // Error class applied
    expect(input.className).toContain('upi-input--error');
  });

  it('does not show error for valid VPA after blur', () => {
    render(<UpiInput value="store@ybl" onChange={vi.fn()} />);

    const input = screen.getByPlaceholderText('yourstore@upi');
    fireEvent.blur(input);

    expect(screen.queryByText(/Invalid UPI VPA format/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Enter your UPI VPA for receiving payments/i)
    ).toBeInTheDocument();
  });
});
