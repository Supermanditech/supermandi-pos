// SA-P0-007: Maintenance Mode Middleware
// Returns 503 with a maintenance message for all non-admin routes when
// maintenance mode is enabled.  Uses the in-memory cache from the
// maintenance route module (30 s TTL) to avoid a DB hit on every request.

import type { Request, Response, NextFunction } from "express";
import { getMaintenanceStatus } from "../routes/v1/admin/maintenance";

/**
 * Middleware factory.  Call once and mount on the v1 router *before*
 * non-admin route handlers but *after* admin routes so that superadmin
 * traffic is never blocked.
 *
 * Usage (in routes/v1/index.ts):
 *   v1Router.use("/admin", ...adminRouters);          // admin first
 *   v1Router.use(maintenanceGate());                   // gate everything else
 *   v1Router.use("/pos", ...posRouters);
 */
export function maintenanceGate() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Never block admin routes (they are mounted before this middleware)
    // This is a safety check in case of mount-order changes.
    if (req.path.startsWith("/admin")) {
      return next();
    }

    try {
      const status = await getMaintenanceStatus();

      if (status.enabled) {
        res.status(503).json({
          error: "SERVICE_UNAVAILABLE",
          code: "MAINTENANCE_MODE",
          message: status.message || "System is under maintenance. Please try again later.",
          retry_after: 300, // hint: retry in 5 minutes
        });
        return;
      }
    } catch {
      // If cache/DB read fails, do NOT block traffic — fail open.
    }

    next();
  };
}
