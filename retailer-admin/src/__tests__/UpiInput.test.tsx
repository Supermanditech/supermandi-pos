import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UpiInput, { validateUpiVpa } from '../components/UpiInput';

describe('validateUpiVpa', () => {
  it('returns undefined for empty value', () => {
    expect(validateUpiVpa('')).toBeUndefined();
  });

  it('returns error for too short VPA', () => {
    expect(validateUpiVpa('a@b')).toBe('UPI VPA must be at least 6 characters');
  });

  it('returns error for VPA exceeding 100 chars', () => {
    const longVpa = 'a'.repeat(95) + '@' + 'b'.repeat(10);
    expect(validateUpiVpa(longVpa)).toBe('UPI VPA cannot exceed 100 characters');
  });

  it('returns error for invalid format', () => {
    expect(validateUpiVpa('invalid-no-at')).toContain('Invalid UPI VPA format');
  });

  it('returns error for invalid chars', () => {
    expect(validateUpiVpa('st re@ybl')).toContain('Invalid UPI VPA format');
  });

  it('accepts valid VPA format', () => {
    expect(validateUpiVpa('store@ybl')).toBeUndefined();
    expect(validateUpiVpa('9876543210@paytm')).toBeUndefined();
    expect(validateUpiVpa('my.store@upi')).toBeUndefined();
    expect(validateUpiVpa('my-store@upi')).toBeUndefined();
    expect(validateUpiVpa('my_store@upi')).toBeUndefined();
  });

  it('rejects VPA with less than 3 chars before @', () => {
    expect(validateUpiVpa('ab@ybl')).toContain('Invalid UPI VPA format');
  });

  it('rejects VPA with less than 2 chars after @', () => {
    expect(validateUpiVpa('store@y')).toContain('Invalid UPI VPA format');
  });
});

describe('UpiInput', () => {
  it('renders label and input', () => {
    render(<UpiInput value="" onChange={vi.fn()} />);
    // Both label and helper text contain "UPI VPA", use getAllByText
    const upiTexts = screen.getAllByText(/UPI VPA/);
    expect(upiTexts.length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('yourstore@upi')).toBeInTheDocument();
  });

  it('shows required asterisk when required', () => {
    render(<UpiInput value="" onChange={vi.fn()} required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('converts input to lowercase', () => {
    const onChange = vi.fn();
    render(<UpiInput value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('yourstore@upi');
    fireEvent.change(input, { target: { value: 'STORE@YBL' } });
    expect(onChange).toHaveBeenCalledWith('store@ybl');
  });

  it('shows error only after blur (touched)', () => {
    render(<UpiInput value="ab" onChange={vi.fn()} />);
    // Before blur, no error
    expect(screen.queryByText(/UPI VPA must be/)).not.toBeInTheDocument();
    // Blur the input
    const input = screen.getByPlaceholderText('yourstore@upi');
    fireEvent.blur(input);
    expect(screen.getByText(/UPI VPA must be at least 6 characters/)).toBeInTheDocument();
  });

  it('shows helper text when no error', () => {
    render(<UpiInput value="store@ybl" onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText('yourstore@upi');
    fireEvent.blur(input);
    expect(screen.queryByText(/Invalid UPI VPA/)).not.toBeInTheDocument();
    expect(screen.getByText(/Enter your UPI VPA/)).toBeInTheDocument();
  });

  it('shows required error when required and empty after blur', () => {
    render(<UpiInput value="" onChange={vi.fn()} required />);
    const input = screen.getByPlaceholderText('yourstore@upi');
    fireEvent.blur(input);
    expect(screen.getByText('UPI VPA is required')).toBeInTheDocument();
  });

  it('disables input when disabled prop is true', () => {
    render(<UpiInput value="" onChange={vi.fn()} disabled />);
    expect(screen.getByPlaceholderText('yourstore@upi')).toBeDisabled();
  });
});
