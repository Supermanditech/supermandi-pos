// RET-WEB-003: UPI VPA Input Component
// GO-LIVE-123: Client-side validation matching backend regex

import { useState, useCallback } from 'react';

interface UpiInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}

/**
 * GO-LIVE-123: Validate UPI VPA format
 * Format: name@bank (e.g., store@ybl, 9876543210@paytm)
 * Rules:
 * - Min 3 chars before @
 * - Min 2 chars after @ (valid bank handles are 2+ chars)
 * - Max 100 chars total
 * - Only alphanumeric, dots, underscores, dashes allowed
 */
export function validateUpiVpa(vpa: string): string | undefined {
  if (!vpa) return undefined; // Allow empty if not required

  const trimmed = vpa.trim();

  if (trimmed.length < 6) {
    return 'UPI VPA must be at least 6 characters';
  }

  if (trimmed.length > 100) {
    return 'UPI VPA cannot exceed 100 characters';
  }

  // GO-LIVE-123: Strict regex matching backend
  const vpaRegex = /^[a-zA-Z0-9._-]{3,}@[a-zA-Z0-9]{2,}$/;
  if (!vpaRegex.test(trimmed)) {
    return 'Invalid UPI VPA format. Use: name@bank (e.g., store@ybl)';
  }

  return undefined;
}

export default function UpiInput({ value, onChange, disabled = false, required = false }: UpiInputProps) {
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);

  const error = touched ? validateUpiVpa(value) || (required && !value ? 'UPI VPA is required' : undefined) : undefined;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Convert to lowercase as we type (backend normalizes to lowercase)
    onChange(e.target.value.toLowerCase());
  }, [onChange]);

  const handleBlur = useCallback(() => {
    setTouched(true);
    setFocused(false);
  }, []);

  const handleFocus = useCallback(() => {
    setFocused(true);
  }, []);

  return (
    <div>
      <label className="upi-label">
        UPI VPA (Virtual Payment Address) {required && <span className="upi-required">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        disabled={disabled}
        placeholder="yourstore@upi"
        autoComplete="off"
        spellCheck={false}
        className="upi-input"
        style={{
          border: `1px solid ${error ? '#ef4444' : focused ? '#3b82f6' : '#e2e8f0'}`,
          background: disabled ? '#f8fafc' : 'white',
          color: disabled ? '#94a3b8' : '#1e293b',
        }}
      />
      {error && (
        <p className="upi-error">
          {error}
        </p>
      )}
      {!error && (
        <p className="upi-hint">
          Enter your UPI VPA for receiving payments (e.g., store@ybl, 9876543210@paytm)
        </p>
      )}
    </div>
  );
}
