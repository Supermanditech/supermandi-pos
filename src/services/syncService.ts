import NetInfo from "@react-native-community/netinfo";
import { syncOutbox } from "./offline/sync";

let unsubscribe: null | (() => void) = null;

// GO-LIVE-167: Track retry state for exponential backoff
let outboxRetryCount = 0;
const MAX_RETRY_COUNT = 5;
const BASE_RETRY_DELAY_MS = 1000;

function getRetryDelay(retryCount: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped)
  return Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCount), 16000);
}

async function syncOutboxWithRetry(): Promise<void> {
  try {
    await syncOutbox();
    outboxRetryCount = 0; // Reset on success
  } catch (error) {
    outboxRetryCount++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GO-LIVE-167] syncOutbox failed (attempt ${outboxRetryCount}):`, errorMessage);

    if (outboxRetryCount < MAX_RETRY_COUNT) {
      const delay = getRetryDelay(outboxRetryCount);
      setTimeout(() => {
        syncOutboxWithRetry().catch(() => {
          console.error('[GO-LIVE-167] Retry of syncOutbox also failed');
        });
      }, delay);
    } else {
      console.error(`[GO-LIVE-167] syncOutbox failed after ${MAX_RETRY_COUNT} attempts, giving up until next connectivity change`);
      outboxRetryCount = 0; // Reset for next connectivity event
    }
  }
}

export function startAutoSync(): void {
  if (unsubscribe) return;
  unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      // GO-LIVE-167: Use retry wrapper instead of silent error swallowing
      syncOutboxWithRetry();
    }
  });
}

export function stopAutoSync(): void {
  unsubscribe?.();
  unsubscribe = null;
}
