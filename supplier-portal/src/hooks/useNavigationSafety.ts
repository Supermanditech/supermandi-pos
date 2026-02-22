// LIVE.NAV.RESILIENCE.BACK_FORWARD_DRAFT_RECOVERY.001
// Shared navigation safety hooks for supplier-portal

'use client';

import { useEffect, useCallback, useState } from 'react';

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Adds a beforeunload guard when isDirty is true.
 * Prevents accidental page close/refresh with unsaved changes.
 */
export function useUnsavedChanges(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}

interface DraftEntry<T> {
  data: T;
  savedAt: number;
}

interface DraftStorage<T> {
  draft: T | null;
  hasDraft: boolean;
  draftAge: number | null;
  saveDraft: (data: T) => void;
  discardDraft: () => void;
}

/**
 * Manages form draft state in sessionStorage with TTL.
 * Returns draft data if it exists and hasn't expired.
 */
export function useDraftStorage<T>(key: string, ttlMs: number = DRAFT_TTL_MS): DraftStorage<T> {
  const [draft, setDraft] = useState<T | null>(() => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const entry: DraftEntry<T> = JSON.parse(raw);
      if (Date.now() - entry.savedAt > ttlMs) {
        sessionStorage.removeItem(key);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  });

  const [draftAge, setDraftAge] = useState<number | null>(() => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const entry: DraftEntry<T> = JSON.parse(raw);
      if (Date.now() - entry.savedAt > ttlMs) return null;
      return Date.now() - entry.savedAt;
    } catch {
      return null;
    }
  });

  const saveDraft = useCallback((data: T) => {
    const entry: DraftEntry<T> = { data, savedAt: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(entry));
    setDraft(data);
    setDraftAge(0);
  }, [key]);

  const discardDraft = useCallback(() => {
    sessionStorage.removeItem(key);
    setDraft(null);
    setDraftAge(null);
  }, [key]);

  return {
    draft,
    hasDraft: draft !== null,
    draftAge,
    saveDraft,
    discardDraft,
  };
}
