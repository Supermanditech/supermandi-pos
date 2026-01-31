/**
 * GO-LIVE-234: Partial Sale State Persistence
 *
 * Persists partial sale state to AsyncStorage so users don't lose progress
 * if the app crashes during a partial payment flow.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const PARTIAL_SALE_STATE_KEY = "supermandi.partial_sale.v1";

export interface PartialSaleState {
  saleItemIds: string[];
  confirmed: boolean;
  saleId?: string;
  createdAt: number;
}

// TTL: 30 minutes - after this, state is considered stale
const STATE_TTL_MS = 30 * 60 * 1000;

/**
 * Save partial sale state to storage
 */
export async function savePartialSaleState(state: Omit<PartialSaleState, "createdAt">): Promise<void> {
  try {
    const fullState: PartialSaleState = {
      ...state,
      createdAt: Date.now(),
    };
    await AsyncStorage.setItem(PARTIAL_SALE_STATE_KEY, JSON.stringify(fullState));
    console.log("[PartialSaleState] GO-LIVE-234: Saved partial sale state");
  } catch (error) {
    console.warn("[PartialSaleState] Failed to save state:", error);
  }
}

/**
 * Load partial sale state from storage
 * Returns null if no state exists or if state is expired
 */
export async function loadPartialSaleState(): Promise<PartialSaleState | null> {
  try {
    const json = await AsyncStorage.getItem(PARTIAL_SALE_STATE_KEY);
    if (!json) return null;

    const state: PartialSaleState = JSON.parse(json);

    // Check if state is expired
    if (Date.now() - state.createdAt > STATE_TTL_MS) {
      console.log("[PartialSaleState] GO-LIVE-234: State expired, clearing");
      await clearPartialSaleState();
      return null;
    }

    // Validate state structure
    if (!Array.isArray(state.saleItemIds) || state.saleItemIds.length === 0) {
      console.warn("[PartialSaleState] Invalid state structure, clearing");
      await clearPartialSaleState();
      return null;
    }

    console.log("[PartialSaleState] GO-LIVE-234: Loaded partial sale state");
    return state;
  } catch (error) {
    console.warn("[PartialSaleState] Failed to load state:", error);
    return null;
  }
}

/**
 * Clear partial sale state from storage
 */
export async function clearPartialSaleState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PARTIAL_SALE_STATE_KEY);
    console.log("[PartialSaleState] GO-LIVE-234: Cleared partial sale state");
  } catch (error) {
    console.warn("[PartialSaleState] Failed to clear state:", error);
  }
}

/**
 * Update just the confirmed flag without replacing other state
 */
export async function updatePartialSaleConfirmed(confirmed: boolean): Promise<void> {
  try {
    const state = await loadPartialSaleState();
    if (state) {
      await savePartialSaleState({
        ...state,
        confirmed,
      });
    }
  } catch (error) {
    console.warn("[PartialSaleState] Failed to update confirmed:", error);
  }
}

/**
 * Update the saleId after sale creation
 */
export async function updatePartialSaleSaleId(saleId: string): Promise<void> {
  try {
    const state = await loadPartialSaleState();
    if (state) {
      await savePartialSaleState({
        ...state,
        saleId,
      });
    }
  } catch (error) {
    console.warn("[PartialSaleState] Failed to update saleId:", error);
  }
}
