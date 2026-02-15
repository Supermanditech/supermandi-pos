import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useUrlState } from '../hooks/useUrlState';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
);

describe('useUrlState', () => {
  it('returns default value when param not in URL', () => {
    const { result } = renderHook(() => useUrlState('filter', 'all'), { wrapper });
    expect(result.current[0]).toBe('all');
  });

  it('returns empty string as default when no default specified', () => {
    const { result } = renderHook(() => useUrlState('search'), { wrapper });
    expect(result.current[0]).toBe('');
  });

  it('updates value via setter', () => {
    const { result } = renderHook(() => useUrlState('filter', 'all'), { wrapper });
    act(() => {
      result.current[1]('active');
    });
    expect(result.current[0]).toBe('active');
  });

  it('resets to default when setting default value', () => {
    const { result } = renderHook(() => useUrlState('filter', 'all'), { wrapper });
    act(() => {
      result.current[1]('active');
    });
    expect(result.current[0]).toBe('active');
    act(() => {
      result.current[1]('all');
    });
    expect(result.current[0]).toBe('all');
  });

  it('resets to default when setting empty string', () => {
    const { result } = renderHook(() => useUrlState('search', ''), { wrapper });
    act(() => {
      result.current[1]('test');
    });
    expect(result.current[0]).toBe('test');
    act(() => {
      result.current[1]('');
    });
    expect(result.current[0]).toBe('');
  });

  it('returns a tuple with value and setter', () => {
    const { result } = renderHook(() => useUrlState('key'), { wrapper });
    expect(Array.isArray(result.current)).toBe(true);
    expect(result.current).toHaveLength(2);
    expect(typeof result.current[0]).toBe('string');
    expect(typeof result.current[1]).toBe('function');
  });
});
