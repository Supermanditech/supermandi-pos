import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import { API_BASE_URL } from "../config/api";
import { getDeviceSession, getDeviceToken } from "./deviceSession";

/**
 * Cloud-first POS event logger.
 * - Fire-and-forget (never blocks UI)
 * - Queues to AsyncStorage when offline/unreachable
 * - Flushes automatically when network becomes available
 *
 * Sends events to: POST /api/v1/pos/events
 */

export type PosEventType =
  | "APP_START"
  | "SCAN_BARCODE"
  | "ADD_TO_CART"
  | "REMOVE_FROM_CART"
  | "PAYMENT_INIT"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "PRINTER_ERROR"
  | "NETWORK_OFFLINE"
  // Payment lifecycle (UPI/QR)
  | "PAYMENT_QR_CREATED"
  | "PAYMENT_PENDING"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_TIMEOUT"
  | "PAYMENT_CANCELLED";

type QueuedPosEvent = {
  id: string; // local event id (not stored in DB, included inside payload for reconciliation)
  deviceId: string;
  storeId: string;
  eventType: PosEventType;
  payload: Record<string, unknown>;
  createdAt: string;
};

const QUEUE_KEY = "supermandi.queue.posEvents.v1";

let started = false;
let isOnline = true;
let inMemoryQueue: QueuedPosEvent[] | null = null;
let flushing = false;

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function appVersion(): string {
  // Expo: app.json -> expo.version
  const v = (Constants.expoConfig as any)?.version ?? (Constants.manifest as any)?.version;
  return typeof v === "string" && v.trim() ? v.trim() : "unknown";
}

async function loadQueue(): Promise<QueuedPosEvent[]> {
  if (inMemoryQueue) return inMemoryQueue;
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) {
    inMemoryQueue = [];
    return inMemoryQueue;
  }
  try {
    const parsed = JSON.parse(raw) as QueuedPosEvent[];
    inMemoryQueue = Array.isArray(parsed) ? parsed : [];
  } catch {
    inMemoryQueue = [];
  }
  return inMemoryQueue;
}

async function saveQueue(queue: QueuedPosEvent[]): Promise<void> {
  inMemoryQueue = queue;
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function sendToBackend(ev: QueuedPosEvent): Promise<boolean> {
  const deviceToken = await getDeviceToken();
  if (!deviceToken) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/pos/events`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-device-token": deviceToken
      },
      body: JSON.stringify({
        eventType: ev.eventType,
        payload: {
          ...ev.payload,
          // Reconciliation-friendly metadata
          eventId: ev.id,
          appVersion: appVersion(),
          createdAt: ev.createdAt
        }
      }),
      signal: controller.signal
    });

    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const queue = await loadQueue();
    if (!isOnline || queue.length === 0) return;

    for (let i = 0; i < queue.length; i++) {
      const ev = queue[i];
      if (!isOnline) {
        // keep the rest
        await saveQueue(queue.slice(i));
        return;
      }

      const ok = await sendToBackend(ev);
      if (!ok) {
        // stop on first failure to avoid hammering network; keep the rest
        await saveQueue(queue.slice(i));
        return;
      }
    }

    // All sent
    await saveQueue([]);
  } finally {
    flushing = false;
  }
}

export function startCloudEventLogger(): void {
  if (started) return;
  started = true;

  // Start network listener.
  NetInfo.addEventListener((state) => {
    const nextOnline = Boolean(state.isConnected);
    const wasOnline = isOnline;
    isOnline = nextOnline;

    if (wasOnline && !nextOnline) {
      // Queue an offline event (will flush when online again).
      void logPosEvent("NETWORK_OFFLINE", { reason: "netinfo_disconnected" });
    }

    if (!wasOnline && nextOnline) {
      void flushQueue();
    }
  });

  // Best-effort periodic flush.
  setInterval(() => {
    void flushQueue();
  }, 30_000);
}

/**
 * Public API: fire-and-forget event log.
 */
export async function logPosEvent(eventType: PosEventType, payload: Record<string, unknown> = {}): Promise<void> {
  try {
    const session = await getDeviceSession();
    if (!session) return;
    const ev: QueuedPosEvent = {
      id: createId(),
      deviceId: session.deviceId,
      storeId: session.storeId,
      eventType,
      payload,
      createdAt: nowIso()
    };

    const queue = await loadQueue();
    // cap queue to avoid unbounded growth
    const capped = queue.length > 2000 ? queue.slice(queue.length - 1500) : queue;
    capped.push(ev);
    await saveQueue(capped);

    // Try to send now, but never block caller.
    if (isOnline) {
      void flushQueue();
    }
  } catch {
    // Swallow all errors: POS UI must never crash.
  }
}

/**
 * Payment lifecycle helper:
 * Ensures transactionId is present on all payment events.
 */
export async function logPaymentEvent(
  eventType:
    | "PAYMENT_INIT"
    | "PAYMENT_QR_CREATED"
    | "PAYMENT_PENDING"
    | "PAYMENT_CONFIRMED"
    | "PAYMENT_TIMEOUT"
    | "PAYMENT_CANCELLED"
    | "PAYMENT_SUCCESS"
    | "PAYMENT_FAILED",
  params: {
    transactionId: string;
    billId?: string;
    paymentMode?: string;
    amountMinor?: number;
    currency?: string;
    [k: string]: unknown;
  }
): Promise<void> {
  const { transactionId, ...rest } = params;

  // Idempotency: avoid double terminal events for the same transaction.
  const terminal = new Set([
    "PAYMENT_CONFIRMED",
    "PAYMENT_TIMEOUT",
    "PAYMENT_CANCELLED",
    "PAYMENT_SUCCESS",
    "PAYMENT_FAILED"
  ]);

  if (terminal.has(eventType)) {
    try {
      const key = `supermandi.payment.once.${transactionId}.${eventType}`;
      const seen = await AsyncStorage.getItem(key);
      if (seen) return;
      await AsyncStorage.setItem(key, nowIso());
    } catch {
      // If storage fails, still attempt to log.
    }
  }

  await logPosEvent(eventType, { transactionId, ...rest });
}

