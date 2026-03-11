// SA-P2-005: Force Sync Check Service
// Checks if SuperAdmin has queued a force-sync command for this device.
// If a pending request is found, triggers a full sync and acknowledges it.

import { API_BASE_URL } from "../config/api";
import { getDeviceToken } from "./deviceSession";
import { useProductsStore } from "../stores/productsStore";
import { refreshStockSnapshot } from "./stockService";

/**
 * Check for pending force-sync requests from SuperAdmin.
 * If found, execute a forced full refresh and acknowledge the request.
 *
 * Called from autoSync's syncTick on every cycle.
 * Safe to call frequently — returns immediately if no pending requests.
 */
export async function checkAndExecuteForceSync(): Promise<void> {
  const deviceToken = await getDeviceToken();
  if (!deviceToken) return;

  // Step 1: Check for pending sync request
  let pendingRequest: { id: string; reason: string } | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${API_BASE_URL}/api/v1/pos/devices/me/pending-sync`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-device-token": deviceToken,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return;

    const data = await res.json();
    if (!data.hasPendingSync || !data.syncRequest?.id) return;

    pendingRequest = {
      id: data.syncRequest.id,
      reason: data.syncRequest.reason || "",
    };
  } catch {
    // Network error or timeout — skip this cycle
    return;
  }

  if (!pendingRequest) return;

  console.log(`[ForceSync] Pending force-sync detected (id=${pendingRequest.id}, reason=${pendingRequest.reason}). Executing full sync...`);

  // Step 2: Execute forced full sync — force refresh products + stock
  try {
    // Force product catalog refresh (bypass staleness check — always reload)
    await useProductsStore.getState().loadProducts();
  } catch (error) {
    console.warn("[ForceSync] Product force refresh failed:", error);
  }

  try {
    // Force stock snapshot refresh
    await refreshStockSnapshot();
  } catch (error) {
    console.warn("[ForceSync] Stock refresh failed:", error);
  }

  // Step 3: Acknowledge the force-sync request
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    await fetch(`${API_BASE_URL}/api/v1/pos/devices/me/acknowledge-sync`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-device-token": deviceToken,
      },
      body: JSON.stringify({ requestId: pendingRequest.id }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    console.log(`[ForceSync] Force-sync acknowledged (id=${pendingRequest.id})`);
  } catch (ackError) {
    // Non-critical — sync was already performed, ack can retry next tick
    console.warn("[ForceSync] Failed to acknowledge force-sync:", ackError);
  }
}
