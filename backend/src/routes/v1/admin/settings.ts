// ADM-SCR-003: Admin Settings Route
import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";

export const adminSettingsRouter = Router();

adminSettingsRouter.use(requireAdminToken);

export interface SystemSettings {
  version: string;
  environment: string;
  features: {
    aiEnabled: boolean;
    analyticsEnabled: boolean;
  };
  database: {
    connected: boolean;
  };
}

// GET /api/v1/admin/settings - Get system settings
adminSettingsRouter.get("/settings", async (_req, res) => {
  const pool = getPool();
  const dbConnected = !!pool;

  // Check AI configuration (GO-LIVE: OpenAI only)
  const aiEnabled = !!process.env.OPENAI_API_KEY;

  const settings: SystemSettings = {
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    features: {
      aiEnabled,
      analyticsEnabled: true,
    },
    database: {
      connected: dbConnected,
    },
  };

  return res.json({ settings });
});

// GET /api/v1/admin/settings/stats - Get system statistics
adminSettingsRouter.get("/settings/stats", async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const [storesResult, devicesResult, usersResult] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM platform.stores"),
      pool.query("SELECT COUNT(*) as count FROM public.pos_devices"),
      pool.query("SELECT COUNT(*) as count FROM auth.users"),
    ]);

    const stats = {
      totalStores: parseInt(storesResult.rows[0]?.count || "0", 10),
      totalDevices: parseInt(devicesResult.rows[0]?.count || "0", 10),
      totalUsers: parseInt(usersResult.rows[0]?.count || "0", 10),
    };

    return res.json({ stats });
  } catch (error: any) {
    console.error("[admin/settings] Failed to fetch stats:", error);
    return res.status(500).json({ error: "fetch_stats_failed" });
  }
});
