// T-130: Recent search history service
// Stores last 10 unique search terms per store in AsyncStorage

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "supermandi.sell.searchHistory.v1";
const MAX_TERMS = 10;

function storeKey(storeId: string): string {
  return `${STORAGE_KEY}.${storeId}`;
}

/**
 * Add a search term to history for the given store.
 * Deduplicates and keeps only the last MAX_TERMS entries.
 */
export async function addTerm(storeId: string, term: string): Promise<void> {
  const trimmed = term.trim();
  if (!trimmed || trimmed.length < 2) return;

  try {
    const key = storeKey(storeId);
    const raw = await AsyncStorage.getItem(key);
    let history: string[] = raw ? JSON.parse(raw) : [];

    // Remove existing occurrence (case-insensitive dedup)
    history = history.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());

    // Add to front
    history.unshift(trimmed);

    // Cap at MAX_TERMS
    if (history.length > MAX_TERMS) {
      history = history.slice(0, MAX_TERMS);
    }

    await AsyncStorage.setItem(key, JSON.stringify(history));
  } catch (error) {
    console.warn("[searchHistory] Failed to save term:", error);
  }
}

/**
 * Get search history for the given store.
 * Returns up to MAX_TERMS terms, most recent first.
 */
export async function getHistory(storeId: string): Promise<string[]> {
  try {
    const key = storeKey(storeId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const history: string[] = JSON.parse(raw);
    return Array.isArray(history) ? history.slice(0, MAX_TERMS) : [];
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
    const key = storeKey(storeId);
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.warn("[searchHistory] Failed to clear history:", error);
  }
}
