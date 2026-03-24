// T-130: Recent search history service
// Stores last 10 unique search terms per store in AsyncStorage
// STG-402: Added 7-day expiry for search history entries

import AsyncStorage from "@react-native-async-storage/async-storage";

import { SK_SEARCH_HISTORY, SK_SEARCH_HISTORY_V2 } from "../constants/storageKeys";
const STORAGE_KEY = SK_SEARCH_HISTORY;
// STG-402: Switch to v2 format with timestamps
const STORAGE_KEY_V2 = SK_SEARCH_HISTORY_V2;
const MAX_TERMS = 10;
// STG-402: 7-day expiry in milliseconds
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// STG-402: Entry with timestamp for expiry tracking
interface SearchEntry {
  term: string;
  addedAt: number;
}

function storeKey(storeId: string): string {
  return `${STORAGE_KEY_V2}.${storeId}`;
}

function legacyStoreKey(storeId: string): string {
  return `${STORAGE_KEY}.${storeId}`;
}

/**
 * STG-402: Migrate legacy v1 entries (plain strings) to v2 (with timestamps).
 */
async function migrateIfNeeded(storeId: string): Promise<SearchEntry[]> {
  const key = storeKey(storeId);
  const raw = await AsyncStorage.getItem(key);
  if (raw) {
    return JSON.parse(raw) as SearchEntry[];
  }

  // Check for legacy v1 data
  const legacyKey = legacyStoreKey(storeId);
  const legacyRaw = await AsyncStorage.getItem(legacyKey);
  if (legacyRaw) {
    const legacyTerms: string[] = JSON.parse(legacyRaw);
    const now = Date.now();
    const entries: SearchEntry[] = legacyTerms.map((term) => ({
      term,
      addedAt: now, // Treat existing entries as just added
    }));
    // Save in v2 format and remove v1
    await AsyncStorage.setItem(key, JSON.stringify(entries));
    await AsyncStorage.removeItem(legacyKey);
    return entries;
  }

  return [];
}

/**
 * STG-402: Filter out expired entries (older than 7 days).
 */
function filterExpired(entries: SearchEntry[]): SearchEntry[] {
  const cutoff = Date.now() - EXPIRY_MS;
  return entries.filter((e) => e.addedAt >= cutoff);
}

/**
 * Add a search term to history for the given store.
 * Deduplicates and keeps only the last MAX_TERMS entries.
 * STG-402: Entries older than 7 days are automatically pruned.
 */
export async function addTerm(storeId: string, term: string): Promise<void> {
  const trimmed = term.trim();
  if (!trimmed || trimmed.length < 2) return;

  try {
    let history = await migrateIfNeeded(storeId);

    // STG-402: Prune expired entries
    history = filterExpired(history);

    // Remove existing occurrence (case-insensitive dedup)
    history = history.filter((e) => e.term.toLowerCase() !== trimmed.toLowerCase());

    // Add to front with current timestamp
    history.unshift({ term: trimmed, addedAt: Date.now() });

    // Cap at MAX_TERMS
    if (history.length > MAX_TERMS) {
      history = history.slice(0, MAX_TERMS);
    }

    await AsyncStorage.setItem(storeKey(storeId), JSON.stringify(history));
  } catch (error) {
    console.warn("[searchHistory] Failed to save term:", error);
  }
}

/**
 * Get search history for the given store.
 * Returns up to MAX_TERMS terms, most recent first.
 * STG-402: Expired entries (>7 days) are filtered out.
 */
export async function getHistory(storeId: string): Promise<string[]> {
  try {
    let history = await migrateIfNeeded(storeId);

    // STG-402: Prune expired entries
    history = filterExpired(history);

    return history.slice(0, MAX_TERMS).map((e) => e.term);
  } catch (error) {
    console.warn("[searchHistory] Failed to read history:", error);
    return [];
  }
}

/**
 * Clear all search history for the given store.
 */
export async function clearHistory(storeId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storeKey(storeId));
    // Also remove legacy key if present
    await AsyncStorage.removeItem(legacyStoreKey(storeId));
  } catch (error) {
    console.warn("[searchHistory] Failed to clear history:", error);
  }
}

/**
 * FIX-058: Clear ALL search history across all stores.
 * Called on device re-enrollment or logout to prevent cross-store leakage.
 */
export async function clearAllHistory(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const historyKeys = allKeys.filter(
      (k) => k.startsWith(STORAGE_KEY) || k.startsWith(STORAGE_KEY_V2)
    );
    if (historyKeys.length > 0) {
      await AsyncStorage.multiRemove(historyKeys);
    }
  } catch (error) {
    console.warn("[searchHistory] Failed to clear all history:", error);
  }
}
