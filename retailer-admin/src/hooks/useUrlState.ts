// T-120: Sync filter/sort/search state with URL search params
// Enables browser back/forward to restore previous filter state
import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Custom hook that syncs a single URL search parameter with React state.
 * Reading from URL is the source of truth — when user navigates back,
 * the URL changes and the component re-renders with the previous value.
 *
 * @param key - The URL search parameter name (e.g., 'search', 'status', 'page')
 * @param defaultValue - The fallback value when the parameter is absent from URL
 * @returns [value, setValue] tuple — value is always a string
 */
export function useUrlState(key: string, defaultValue: string = ''): readonly [string, (newValue: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback((newValue: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (newValue === defaultValue || newValue === '') {
        next.delete(key);
      } else {
        next.set(key, newValue);
      }
      return next;
    }, { replace: true });
  }, [key, defaultValue, setSearchParams]);

  return [value, setValue] as const;
}
