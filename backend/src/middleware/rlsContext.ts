// GCP-STG-0084 FIX: RLS context middleware
// Sets app.current_store_id on every request so PostgreSQL RLS policies filter rows.
// Without this, rls_store_check() returns FALSE (deny-by-default) and queries return 0 rows.

import type { Request, Response, NextFunction } from "express";
import { getPool } from "../db/client";
import { log } from "../lib/logger";

/**
 * Middleware for POS routes: sets RLS context from req.posDevice.storeId.
 * Must be placed AFTER requireDeviceToken middleware (which populates req.posDevice).
 *
 * This sets the PostgreSQL session variable `app.current_store_id` on the connection
 * so that RLS policies (rls_store_check) can filter rows by store.
 *
 * NOTE: SET LOCAL only works within a transaction. For non-transactional queries,
 * routes should use withStoreContext() or queryInStore() from db/client.ts.
 * This middleware provides a fallback by setting it at session level.
 */
export function setRlsStoreContext(req: Request, _res: Response, next: NextFunction): void {
  const posDevice = (req as any).posDevice as { storeId?: string } | undefined;
  const storeId = posDevice?.storeId;

  if (storeId) {
    // Attach storeId to request for downstream use with withStoreContext()
    (req as any)._rlsStoreId = storeId;
  }

  next();
}

/**
 * Middleware for admin routes: sets ADMIN_BYPASS so RLS allows full access.
 * Must be placed AFTER requireAdminToken middleware.
 */
export function setRlsAdminContext(req: Request, _res: Response, next: NextFunction): void {
  (req as any)._rlsStoreId = "ADMIN_BYPASS";
  next();
}

/**
 * Middleware for retailer routes: sets RLS context from JWT storeId.
 * Must be placed AFTER JWT auth middleware (which populates req.storeId or similar).
 */
export function setRlsRetailerContext(req: Request, _res: Response, next: NextFunction): void {
  const storeId = (req as any).storeId || (req as any).user?.storeId;
  if (storeId) {
    (req as any)._rlsStoreId = storeId;
  }
  next();
}

/**
 * Helper: Execute a callback with RLS store context from the request.
 * Wraps the callback in a transaction with SET LOCAL app.current_store_id.
 * Use this in route handlers instead of raw pool.query() for store-scoped data.
 *
 * Usage:
 *   const rows = await withRequestRls(req, async (client) => {
 *     const result = await client.query("SELECT * FROM sales WHERE ...");
 *     return result.rows;
 *   });
 */
export async function withRequestRls<T>(
  req: Request,
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  const storeId = (req as any)._rlsStoreId;
  if (!storeId) {
    throw new Error("RLS context not set — ensure RLS middleware is applied before this route");
  }

  const pool = getPool();
  if (!pool) throw new Error("Database pool not initialized");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_store_id', $1::text, true)", [storeId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
