// T-121: Sync filter/sort/search state with URL search params (Next.js App Router)
// Enables browser back/forward to restore previous filter state
'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Custom hook that syncs a single URL search parameter with React state.
 * Reading from URL is the source of truth — when user navigates back,
 * the URL changes and the component re-renders with the previous value.
 *
 * Uses Next.js App Router navigation (router.replace with scroll: false).
 *
 * @param key - The URL search parameter name (e.g., 'status', 'page')
 * @param defaultValue - The fallback value when the parameter is absent from URL
 * @returns [value, setValue] tuple — value is always a string
 */
export function useUrlState(key: string, defaultValue: string = ''): readonly [string, (newValue: string) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback((newValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newValue === defaultValue || newValue === '') {
      params.delete(key);
    } else {
      params.set(key, newValue);
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? '?' + query : ''}`, { scroll: false });
  }, [key, defaultValue, searchParams, router, pathname]);

  return [value, setValue] as const;
}
