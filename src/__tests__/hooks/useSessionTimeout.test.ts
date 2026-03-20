/**
 * Tests for useSessionTimeout hook
 * V3-SESSION-025: Timeout reduced to 10 minutes (soft-lock to PIN re-entry)
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

  // V3-SESSION-025: Timeout is 10 minutes (not legacy 35)
  it('calls onLogout after idle timeout (10 minutes)', () => {
    const onLogout = jest.fn();
    renderHook(() => useSessionTimeout(onLogout));

    // Advance past 10 minutes
    jest.advanceTimersByTime(10 * 60 * 1000 + 30000);

    expect(onLogout).toHaveBeenCalled();
  });

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const onLogout = jest.fn();
    const { unmount } = renderHook(() => useSessionTimeout(onLogout));
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  // V3-SESSION-025: 10-min timeout, reset at 8 min, check 8 min later
  it('resetTimer resets the idle counter', () => {
    const onLogout = jest.fn();
    const { result } = renderHook(() => useSessionTimeout(onLogout));

    // Advance 8 minutes (near timeout but not yet)
    jest.advanceTimersByTime(8 * 60 * 1000);

    // Reset timer
    act(() => {
      result.current.resetTimer();
    });

    // Advance another 8 minutes (only 8 min from reset, under 10-min threshold)
    jest.advanceTimersByTime(8 * 60 * 1000);

    // Should not have logged out because we reset at 8 min
    // (need 10 min from reset to logout)
    expect(onLogout).not.toHaveBeenCalled();
  });
});
