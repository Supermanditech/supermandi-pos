// T-174: Real-time settings sync from web to POS
// Uses fetch-based SSE implementation since EventSource is not available in React Native.
// Falls back to polling if SSE streaming is not supported.

import { API_BASE_URL } from "../config/api";
import { getDeviceToken } from "./deviceSession";
import { isOnline } from "./networkStatus";
import { useProductsStore } from "../stores/productsStore";
import { refreshStockSnapshot } from "./stockService";
import { useSettingsStore } from "../stores/settingsStore";
import { fetchUiStatus } from "./api/uiStatusApi";
import { useSyncStore } from "../stores/syncStore";
import { showToast } from "../utils/showToast";

// SSE event types from server
// GCP-STG-0108: Extended event types for order/payment/delivery
type SSEEventType =
  | "product_updated" | "stock_updated" | "settings_updated" | "heartbeat"
  | "order.created" | "order.status_changed" | "order.delivery_confirmed"
  | "payment.status_changed" | "delivery.status_changed"
  | "lifecycle:order_created" | "lifecycle:dispatched" | "lifecycle:delivered";

type SSEEvent = {
  type: SSEEventType;
  data: Record<string, unknown>;
};

// Exponential backoff configuration
const MIN_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

// Polling fallback interval (used when SSE streaming is not available)
const POLLING_INTERVAL_MS = 30000; // 30 seconds

let abortController: AbortController | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let currentReconnectDelay = MIN_RECONNECT_DELAY_MS;
let isRunning = false;
let usePollingFallback = false;
let lastEventTimestamp: string | null = null;

/**
 * Parse SSE text stream into events.
 * SSE format: "event: <type>\ndata: <json>\n\n"
 */
function parseSSEChunk(chunk: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = chunk.split("\n\n").filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n");
    let eventType: SSEEventType = "heartbeat";
    let dataStr = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim() as SSEEventType;
      } else if (line.startsWith("data:")) {
        dataStr += line.slice(5).trim();
      }
    }

    if (dataStr) {
      try {
        const data = JSON.parse(dataStr) as Record<string, unknown>;
        events.push({ type: eventType, data });
      } catch {
        // Skip malformed data lines
        console.warn("[SSE] Failed to parse event data:", dataStr.slice(0, 100));
      }
    }
  }

  return events;
}

/**
 * Handle an incoming SSE event by updating the appropriate local store.
 */
async function handleEvent(event: SSEEvent): Promise<void> {
  console.log(`[SSE] Received event: ${event.type}`);
  lastEventTimestamp = new Date().toISOString();

  switch (event.type) {
    case "settings_updated": {
      // Re-fetch settings from the server and update local store
      try {
        const status = await fetchUiStatus();
        if (status.features) {
          const {
            setBuyEnabled,
            setReorderEnabled,
            setCreditEnabled,
            setBnplEnabled,
            setVoiceEnabled,
            setCategoryBrowsingEnabled,
          } = useSettingsStore.getState();
          const buyFlag = status.features.buyEnabled ?? status.features.ordersEnabled ?? true;
          const reorderFlag = status.features.reorderEnabled ?? false;
          const creditFlag = status.features.creditEnabled ?? false;
          const bnplFlag = status.features.bnplEnabled ?? false;
          setBuyEnabled(buyFlag);
          setReorderEnabled(reorderFlag);
          setCreditEnabled(creditFlag);
          setBnplEnabled(bnplFlag);
          // V3-FIX-051: SELL feature flags from live settings refresh
          if (status.features.voiceEnabled !== undefined) setVoiceEnabled(status.features.voiceEnabled);
          if (status.features.categoryBrowsingEnabled !== undefined) setCategoryBrowsingEnabled(status.features.categoryBrowsingEnabled);
        }
        if (status.storeName) {
          useSettingsStore.getState().setStoreName(status.storeName);
        }
        if (status.storeCode) {
          useSettingsStore.getState().setStoreCode(status.storeCode);
        }
        showToast("Settings updated from web");
      } catch (error) {
        console.error("[SSE] Failed to refresh settings:", error);
      }
      break;
    }

    case "product_updated": {
      // Refresh the product catalog cache
      try {
        await useProductsStore.getState().loadProducts();
        console.log("[SSE] Product cache updated");
      } catch (error) {
        console.error("[SSE] Failed to refresh products:", error);
      }
      break;
    }

    case "stock_updated": {
      // Refresh stock snapshot from server
      try {
        await refreshStockSnapshot();
        console.log("[SSE] Stock data refreshed");
      } catch (error) {
        console.error("[SSE] Failed to refresh stock:", error);
      }
      break;
    }

    case "heartbeat": {
      // Keep-alive — just update connection status
      useSyncStore.getState().setConnectionStatus("connected");
      break;
    }

    // GCP-STG-0108: Order/payment/delivery event handlers
    case "order.created":
    case "order.status_changed":
    case "order.delivery_confirmed":
    case "lifecycle:order_created":
    case "lifecycle:dispatched":
    case "lifecycle:delivered": {
      // Show toast notification for order events
      const orderData = event.data as { orderId?: string; status?: string; orderNumber?: string };
      const msg = event.type.includes("created") ? "New order received"
        : event.type.includes("delivered") ? "Order delivered"
        : event.type.includes("dispatched") ? "Order dispatched"
        : `Order ${orderData.orderNumber || ""} updated`;
      showToast(msg);
      console.log(`[SSE] Order event: ${event.type}`, orderData);
      break;
    }

    case "payment.status_changed": {
      const paymentData = event.data as { status?: string; amountMinor?: number };
      if (paymentData.status === "paid") {
        showToast("Payment confirmed");
      }
      console.log(`[SSE] Payment event:`, paymentData);
      break;
    }

    case "delivery.status_changed": {
      const deliveryData = event.data as { orderId?: string; status?: string };
      console.log(`[SSE] Delivery event:`, deliveryData);
      break;
    }

    default:
      console.log(`[SSE] Unknown event type: ${event.type}`);
  }
}

/**
 * Connect to the SSE endpoint using fetch streaming.
 * React Native does not support the standard EventSource API,
 * so we use fetch with a streaming body reader.
 */
async function connectSSE(): Promise<void> {
  if (!isRunning) return;

  const online = await isOnline();
  if (!online) {
    useSyncStore.getState().setConnectionStatus("disconnected");
    scheduleReconnect();
    return;
  }

  const deviceToken = await getDeviceToken();
  if (!deviceToken) {
    console.warn("[SSE] No device token — cannot connect");
    useSyncStore.getState().setConnectionStatus("disconnected");
    scheduleReconnect();
    return;
  }

  useSyncStore.getState().setConnectionStatus("connecting");

  abortController = new AbortController();
  const url = `${API_BASE_URL}/api/v1/pos/sync/events`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        "x-device-token": deviceToken,
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      console.warn(`[SSE] Server returned ${response.status} — falling back to polling`);
      usePollingFallback = true;
      useSyncStore.getState().setConnectionStatus("disconnected");
      startPollingFallback();
      return;
    }

    // Check if response body is streamable
    if (!response.body) {
      console.warn("[SSE] No response body — falling back to polling");
      usePollingFallback = true;
      useSyncStore.getState().setConnectionStatus("disconnected");
      startPollingFallback();
      return;
    }

    // Connection established — reset backoff
    currentReconnectDelay = MIN_RECONNECT_DELAY_MS;
    useSyncStore.getState().setConnectionStatus("connected");
    console.log("[SSE] Connected to event stream");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (isRunning) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete events (terminated by double newline)
      while (buffer.includes("\n\n")) {
        const splitIndex = buffer.indexOf("\n\n") + 2;
        const chunk = buffer.slice(0, splitIndex);
        buffer = buffer.slice(splitIndex);

        const events = parseSSEChunk(chunk);
        for (const event of events) {
          try {
            await handleEvent(event);
          } catch (error) {
            console.error("[SSE] Error handling event:", error);
          }
        }
      }
    }

    console.log("[SSE] Stream ended");
    useSyncStore.getState().setConnectionStatus("disconnected");
    scheduleReconnect();
  } catch (error) {
    if (abortController?.signal.aborted) {
      // Intentional disconnect — do not reconnect
      console.log("[SSE] Connection aborted intentionally");
      return;
    }

    const errorMsg = error instanceof Error ? error.message : String(error);

    // If fetch streaming fails (common in React Native), fall back to polling
    if (
      errorMsg.includes("ReadableStream") ||
      errorMsg.includes("not supported") ||
      errorMsg.includes("body stream")
    ) {
      console.warn("[SSE] Streaming not supported — falling back to polling");
      usePollingFallback = true;
      startPollingFallback();
      return;
    }

    console.warn("[SSE] Connection failed:", errorMsg);
    useSyncStore.getState().setConnectionStatus("disconnected");
    scheduleReconnect();
  }
}

/**
 * Schedule a reconnection attempt with exponential backoff.
 */
function scheduleReconnect(): void {
  if (!isRunning) return;
  if (usePollingFallback) return;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  console.log(`[SSE] Reconnecting in ${currentReconnectDelay}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectSSE();
  }, currentReconnectDelay);

  // Increase delay for next attempt (exponential backoff)
  currentReconnectDelay = Math.min(
    currentReconnectDelay * BACKOFF_MULTIPLIER,
    MAX_RECONNECT_DELAY_MS
  );
}

/**
 * Polling fallback: periodically check for updates when SSE is not available.
 * This is the reliable fallback path for React Native environments.
 */
// V3-DELETE-057: Polling fallback rewritten to use fetchUiStatus
// instead of non-existent /sync/poll endpoint
function startPollingFallback(): void {
  if (pollingTimer) return;
  console.log("[SSE] Starting polling fallback via fetchUiStatus");
  useSyncStore.getState().setConnectionStatus("connected");

  const poll = async () => {
    try {
      const online = await isOnline();
      if (!online) {
        useSyncStore.getState().setConnectionStatus("disconnected");
        return;
      }
      const status = await fetchUiStatus();
      if (status.features) {
        const settings = useSettingsStore.getState();
        if (status.features.buyEnabled !== undefined) settings.setBuyEnabled(status.features.buyEnabled);
        if (status.features.reorderEnabled !== undefined) settings.setReorderEnabled(status.features.reorderEnabled);
        if (status.features.creditEnabled !== undefined) settings.setCreditEnabled(status.features.creditEnabled);
        if (status.features.bnplEnabled !== undefined) settings.setBnplEnabled(status.features.bnplEnabled);
        if (status.features.voiceEnabled !== undefined) settings.setVoiceEnabled(status.features.voiceEnabled);
        if (status.features.categoryBrowsingEnabled !== undefined) settings.setCategoryBrowsingEnabled(status.features.categoryBrowsingEnabled);
      }
      useSyncStore.getState().setConnectionStatus("connected");
    } catch (error) {
      if (__DEV__) console.warn("[SSE/Poll] Fallback poll error:", error);
      useSyncStore.getState().setConnectionStatus("disconnected");
    }
  };

  void poll();
  pollingTimer = setInterval(() => { void poll(); }, POLLING_INTERVAL_MS);
}

function stopPollingFallback(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

/**
 * Start the SSE client. Will attempt streaming first, then fall back to polling.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startSSEClient(): void {
  if (isRunning) return;
  isRunning = true;
  usePollingFallback = false;
  currentReconnectDelay = MIN_RECONNECT_DELAY_MS;
  console.log("[SSE] Starting SSE client");
  void connectSSE();
}

/**
 * Stop the SSE client and all associated timers.
 */
export function stopSSEClient(): void {
  isRunning = false;
  usePollingFallback = false;

  if (abortController) {
    abortController.abort();
    abortController = null;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  stopPollingFallback();

  useSyncStore.getState().setConnectionStatus("disconnected");
  console.log("[SSE] SSE client stopped");
}

/**
 * Check if the SSE client is currently running.
 */
export function isSSEClientRunning(): boolean {
  return isRunning;
}
