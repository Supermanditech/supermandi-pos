// T-121: Sync filter/sort/search state with URL search params (Next.js App Router)
// Enables browser back/forward to restore previous filter state
'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useRef } from 'react';

/**
 * Custom hook that syncs a single URL search parameter with React state.
 * Reading from URL is the source of truth — when user navigates back,
 * the URL changes and the component re-renders with the previous value.
 *
 * FIX-066: Debounces URL updates to prevent excessive router.replace calls on every keystroke.
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setValue = useCallback((newValue: string) => {
    // FIX-066: Debounce URL updates (300ms) to prevent excessive history manipulation
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (newValue === defaultValue || newValue === '') {
        params.delete(key);
      } else {
        params.set(key, newValue);
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? '?' + query : ''}`, { scroll: false });
    }, 300);
  }, [key, defaultValue, searchParams, router, pathname]);

  return [value, setValue] as const;
}
