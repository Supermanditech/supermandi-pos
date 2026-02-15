/**
 * Tests for useUrlState hook (hooks/useUrlState.ts)
 * Covers: reading from URL, setting URL, default values, removing params
 */
import { renderHook, act } from '@testing-library/react';

// Mock next/navigation with controllable search params
const mockReplace = jest.fn();
let currentSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/supplier/products',
  useSearchParams: () => currentSearchParams,
}));

import { useUrlState } from '../../hooks/useUrlState';

describe('useUrlState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentSearchParams = new URLSearchParams();
  });

  it('returns default value when param not in URL', () => {
    const { result } = renderHook(() => useUrlState('status', 'all'));
    expect(result.current[0]).toBe('all');
  });

  it('returns URL param value when present', () => {
    currentSearchParams = new URLSearchParams('status=pending');
    const { result } = renderHook(() => useUrlState('status', 'all'));
    expect(result.current[0]).toBe('pending');
  });

  it('returns empty string as default when no default provided', () => {
    const { result } = renderHook(() => useUrlState('page'));
    expect(result.current[0]).toBe('');
  });

  it('calls router.replace when setValue is called', () => {
    const { result } = renderHook(() => useUrlState('status', 'all'));

    act(() => {
      result.current[1]('pending');
    });

    expect(mockReplace).toHaveBeenCalledWith(
      '/supplier/products?status=pending',
      { scroll: false }
    );
  });

  it('removes param when setting to default value', () => {
    currentSearchParams = new URLSearchParams('status=pending');
    const { result } = renderHook(() => useUrlState('status', 'all'));

    act(() => {
      result.current[1]('all');
    });

    expect(mockReplace).toHaveBeenCalledWith(
      '/supplier/products',
      { scroll: false }
    );
  });

  it('removes param when setting to empty string', () => {
    currentSearchParams = new URLSearchParams('status=pending');
    const { result } = renderHook(() => useUrlState('status', 'all'));

    act(() => {
      result.current[1]('');
    });

    expect(mockReplace).toHaveBeenCalledWith(
      '/supplier/products',
      { scroll: false }
    );
  });

  it('preserves other URL params when setting one', () => {
    currentSearchParams = new URLSearchParams('page=2&sort=name');
    const { result } = renderHook(() => useUrlState('status', 'all'));

    act(() => {
      result.current[1]('pending');
    });

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('status=pending'),
      { scroll: false }
    );
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('page=2'),
      { scroll: false }
    );
  });
});
