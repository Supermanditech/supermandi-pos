// SA-P1-001: POS staff identity middleware
// Reads X-Staff-Id header, validates staff belongs to the store and is active.
// Attaches req.posStaff with { staffId, name, role }.
import type { NextFunction, Request, Response } from "express";
import { getPool } from "../db/client";
import type { PosDeviceContext } from "./deviceToken";

export type PosStaffContext = {
  staffId: string;
  name: string;
  role: "CASHIER" | "STOCK_MANAGER" | "MANAGER";
};

/**
 * Middleware: requires X-Staff-Id header and validates staff.
 * Must be used AFTER requireDeviceToken (needs req.posDevice).
 */
export async function requirePosStaff(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const staffId = req.header("x-staff-id")?.trim();
  if (!staffId) {
    res.status(401).json({
      error: { code: "STAFF_REQUIRED", message: "Staff login required" }
    });
    return;
  }

  const posDevice = (req as any).posDevice as PosDeviceContext | undefined;
  if (!posDevice?.storeId) {
    res.status(403).json({
      error: { code: "DEVICE_NOT_ENROLLED", message: "Device not enrolled to a store" }
    });
    return;
  }

  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });
    return;
  }

  const result = await pool.query(
    `SELECT id, name, role FROM platform.store_staff
     WHERE id = $1 AND store_id = $2::uuid AND is_active = true`,
    [staffId, posDevice.storeId]
  );

  const staff = result.rows[0];
  if (!staff) {
    res.status(401).json({
      error: { code: "STAFF_INVALID", message: "Staff not found or inactive" }
    });
    return;
  }

  (req as any).posStaff = {
    staffId: staff.id,
    name: staff.name,
    role: staff.role,
  } satisfies PosStaffContext;

  next();
}

/**
 * Middleware factory: blocks specific roles from accessing the route.
 * Usage: requireRole("STOCK_MANAGER", "MANAGER") — blocks CASHIER
 */
export function requireRole(...allowedRoles: Array<"CASHIER" | "STOCK_MANAGER" | "MANAGER">) {
  return (req: Request, res: Response, next: NextFunction) => {
    const staff = (req as any).posStaff as PosStaffContext | undefined;
    if (!staff) {
      res.status(401).json({
        error: { code: "STAFF_REQUIRED", message: "Staff login required" }
      });
      return;
    }
    if (!allowedRoles.includes(staff.role)) {
      res.status(403).json({
        error: { code: "ROLE_FORBIDDEN", message: `Role ${staff.role} is not allowed for this action` }
      });
      return;
    }
    next();
  };
}
