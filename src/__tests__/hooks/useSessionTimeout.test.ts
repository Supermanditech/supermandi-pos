/**
 * Tests for useSessionTimeout hook
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

  it('calls onLogout after idle timeout (35 minutes)', () => {
    const onLogout = jest.fn();
    renderHook(() => useSessionTimeout(onLogout));

    // Advance past 35 minutes
    jest.advanceTimersByTime(35 * 60 * 1000 + 30000);

    expect(onLogout).toHaveBeenCalled();
  });

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const onLogout = jest.fn();
    const { unmount } = renderHook(() => useSessionTimeout(onLogout));
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('resetTimer resets the idle counter', () => {
    const onLogout = jest.fn();
    const { result } = renderHook(() => useSessionTimeout(onLogout));

    // Advance 30 minutes
    jest.advanceTimersByTime(30 * 60 * 1000);

    // Reset timer
    act(() => {
      result.current.resetTimer();
    });

    // Advance another 30 minutes (total 60 from start, but only 30 from reset)
    jest.advanceTimersByTime(30 * 60 * 1000);

    // Should not have logged out because we reset at 30 min
    // (need 35 min from reset to logout)
    expect(onLogout).not.toHaveBeenCalled();
  });
});
