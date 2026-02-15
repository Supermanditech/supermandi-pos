// SuperAdmin — Test EnrollmentCountdown component
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { EnrollmentCountdown } from '../../components/EnrollmentCountdown';

describe('EnrollmentCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows time remaining when not expired', () => {
    const futureDate = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now
    render(<EnrollmentCountdown expiresAt={futureDate} />);
    // Should show something like "4m 59s" or "5m 00s"
    expect(screen.getByText(/\d+m \d+s/)).toBeTruthy();
  });

  it('shows expired when past', () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    render(<EnrollmentCountdown expiresAt={pastDate} />);
    expect(screen.getByText('expired')).toBeTruthy();
  });

  it('shows unknown for invalid date', () => {
    render(<EnrollmentCountdown expiresAt="not-a-date" />);
    expect(screen.getByText('unknown')).toBeTruthy();
  });

  it('counts down over time', () => {
    const futureDate = new Date(Date.now() + 120 * 1000).toISOString(); // 2 minutes
    render(<EnrollmentCountdown expiresAt={futureDate} />);

    // Initial: ~1m 59s or 2m 00s
    const initialText = screen.getByText(/\d+m \d+s/).textContent;

    // Advance 10 seconds
    act(() => { vi.advanceTimersByTime(10 * 1000); });

    const laterText = screen.getByText(/\d+m \d+s/).textContent;
    // The seconds should have changed
    expect(laterText).not.toBe(initialText);
  });

  it('transitions to expired after countdown reaches zero', () => {
    const futureDate = new Date(Date.now() + 2000).toISOString(); // 2 seconds from now
    render(<EnrollmentCountdown expiresAt={futureDate} />);

    // Should show time remaining initially
    expect(screen.getByText(/\d+m \d+s/)).toBeTruthy();

    // Advance past expiration
    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.getByText('expired')).toBeTruthy();
  });

  it('shows minutes and zero-padded seconds', () => {
    const futureDate = new Date(Date.now() + 65 * 1000).toISOString(); // 1m 5s
    render(<EnrollmentCountdown expiresAt={futureDate} />);
    // Should show "1m 04s" or "1m 05s" (zero padded)
    expect(screen.getByText(/1m 0\ds/)).toBeTruthy();
  });
});
