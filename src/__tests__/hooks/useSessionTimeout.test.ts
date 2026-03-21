/**
 * Tests for useSessionTimeout hook
 * GCP-STG-0005: Timeout is 30 minutes for kirana POS (soft-lock to PIN re-entry)
 */
import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useSessionTimeout } from '../../hooks/useSessionTimeout';

describe('useSessionTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns resetTimer function', () => {
    const onLogout = jest.fn();
    const { result } = renderHook(() => useSessionTimeout(onLogout));
    expect(typeof result.current.resetTimer).toBe('function');
  });

  it('does not call onLogout immediately', () => {
    const onLogout = jest.fn();
    renderHook(() => useSessionTimeout(onLogout));
    expect(onLogout).not.toHaveBeenCalled();
  });

  // GCP-STG-0005: Timeout is 30 minutes
  it('calls onLogout after idle timeout (30 minutes)', () => {
    const onLogout = jest.fn();
    renderHook(() => useSessionTimeout(onLogout));

    // Advance past 30 minutes
    jest.advanceTimersByTime(30 * 60 * 1000 + 30000);

    expect(onLogout).toHaveBeenCalled();
  });

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const onLogout = jest.fn();
    const { unmount } = renderHook(() => useSessionTimeout(onLogout));
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  // GCP-STG-0005: 30-min timeout, reset at 20 min, check 20 min later
  it('resetTimer resets the idle counter', () => {
    const onLogout = jest.fn();
    const { result } = renderHook(() => useSessionTimeout(onLogout));

    // Advance 20 minutes (near timeout but not yet)
    jest.advanceTimersByTime(20 * 60 * 1000);

    // Reset timer
    act(() => {
      result.current.resetTimer();
    });

    // Advance another 20 minutes (only 20 min from reset, under 30-min threshold)
    jest.advanceTimersByTime(20 * 60 * 1000);

    // Should not have logged out because we reset at 20 min
    // (need 30 min from reset to logout)
    expect(onLogout).not.toHaveBeenCalled();
  });

  // GCP-STG-0005: isFocused=false prevents timeout (payment screen protection)
  it('does not call onLogout when isFocused is false', () => {
    const onLogout = jest.fn();
    renderHook(() => useSessionTimeout(onLogout, false));

    // Advance past 30 minutes
    jest.advanceTimersByTime(30 * 60 * 1000 + 30000);

    // Should NOT have logged out — payment screen is active
    expect(onLogout).not.toHaveBeenCalled();
  });
});
