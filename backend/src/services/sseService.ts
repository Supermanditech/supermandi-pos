/**
 * T-173: Server-Sent Events (SSE) Service
 *
 * Manages SSE connections for real-time product/stock/settings sync to POS devices.
 * Stores connected clients in a Map<storeId, Set<Response>>.
 * Provides emitStoreEvent() for broadcasting events to all connected devices of a store.
 */

import type { Response } from "express";
import { log } from "../lib/logger";

// Connected SSE clients: storeId -> Set of Response objects
const connectedClients = new Map<string, Set<Response>>();

// Heartbeat interval (30 seconds) to keep connections alive
const HEARTBEAT_INTERVAL_MS = 30_000;

// Maximum connections per store to prevent resource exhaustion
const MAX_CONNECTIONS_PER_STORE = 20;

/**
 * Register a new SSE client for a store.
 * Returns a cleanup function to call when the connection closes.
 */
export function registerSseClient(storeId: string, res: Response): () => void {
  let clients = connectedClients.get(storeId);
  if (!clients) {
    clients = new Set();
    connectedClients.set(storeId, clients);
  }

  // Enforce max connections per store
  if (clients.size >= MAX_CONNECTIONS_PER_STORE) {
    // Remove oldest connection (first in set)
    const oldest = clients.values().next().value;
    if (oldest) {
      try {
        oldest.end();
      } catch {
        // Connection may already be closed
      }
      clients.delete(oldest);
    }
  }

  clients.add(res);

  log.info(`[SSE] Client connected: storeId=${storeId}, total=${clients.size}`);

  // Return cleanup function
  return () => {
    const storeClients = connectedClients.get(storeId);
    if (storeClients) {
      storeClients.delete(res);
      if (storeClients.size === 0) {
        connectedClients.delete(storeId);
      }
      log.info(`[SSE] Client disconnected: storeId=${storeId}, remaining=${storeClients.size}`);
    }
  };
}

/**
 * Emit an event to all connected SSE clients for a specific store.
 * Safe to call even if no clients are connected.
 *
 * @param storeId - The store to broadcast to
 * @param event - Event name (e.g., 'product_updated', 'stock_updated', 'settings_updated')
 * @param data - Event payload (will be JSON-stringified)
 */
export function emitStoreEvent(storeId: string, event: string, data: unknown): void {
  const clients = connectedClients.get(storeId);
  if (!clients || clients.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  const deadClients: Response[] = [];

  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      // Client connection is broken, mark for cleanup
      deadClients.push(client);
    }
  }

  // Clean up dead connections
  for (const dead of deadClients) {
    clients.delete(dead);
    try {
      dead.end();
    } catch {
      // Already closed
    }
  }

  if (clients.size === 0) {
    connectedClients.delete(storeId);
  }
}

/**
 * Send a comment/ping to keep the connection alive.
 * Called by the heartbeat interval.
 */
function sendHeartbeat(): void {
  const now = new Date().toISOString();

  for (const [storeId, clients] of connectedClients.entries()) {
    const deadClients: Response[] = [];

    for (const client of clients) {
      try {
        client.write(`: heartbeat ${now}\n\n`);
      } catch {
        deadClients.push(client);
      }
    }

    // Clean up dead connections
    for (const dead of deadClients) {
      clients.delete(dead);
      try {
        dead.end();
      } catch {
        // Already closed
      }
    }

    if (clients.size === 0) {
      connectedClients.delete(storeId);
    }
  }
}

// Start heartbeat timer
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startSseHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  // Don't prevent process exit
  if (heartbeatTimer && typeof heartbeatTimer === 'object' && 'unref' in heartbeatTimer) {
    heartbeatTimer.unref();
  }
  log.info(`[SSE] Heartbeat started (interval=${HEARTBEAT_INTERVAL_MS}ms)`);
}

export function stopSseHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * Get current SSE connection stats (for monitoring/health checks).
 */
export function getSseStats(): { totalStores: number; totalConnections: number } {
  let totalConnections = 0;
  for (const clients of connectedClients.values()) {
    totalConnections += clients.size;
  }
  return {
    totalStores: connectedClients.size,
    totalConnections,
  };
}
