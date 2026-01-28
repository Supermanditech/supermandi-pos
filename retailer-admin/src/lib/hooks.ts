/**
 * GL-CRIT-0078: Custom hooks for retailer admin
 */

import { useEffect } from 'react';

/**
 * GL-CRIT-0078: Hook to close modals with Escape key
 *
 * Usage:
 * ```tsx
 * useEscapeKey(() => setShowModal(false), showModal);
 * ```
 */
export function useEscapeKey(onEscape: () => void, isActive: boolean = true): void {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onEscape, isActive]);
}

/**
 * GL-CRIT-0077: Hook to generate consistent aria-labels
 *
 * Usage:
 * ```tsx
 * const ariaLabel = useAriaLabel('product', 'name');
 * // Returns: "Product name input"
 * ```
 */
export function useAriaLabel(entity: string, field: string): string {
  return `${entity.charAt(0).toUpperCase() + entity.slice(1)} ${field} input`;
}

/**
 * Hook for focus trap in modals (accessibility)
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  isActive: boolean = true
): void {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    // Focus first element when modal opens
    firstElement?.focus();

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [containerRef, isActive]);
}
