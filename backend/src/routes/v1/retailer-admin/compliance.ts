// Retailer Admin Compliance Routes - MED-001
// Returns compliance document status for retailer stores

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireRetailerAuth } from "../../../middleware/retailerAuth";

export const retailerComplianceRouter = Router();

// Document types that retailers need to submit
const REQUIRED_DOCUMENT_TYPES = [
  { value: "gstin", label: "GSTIN Certificate", required: false },
  { value: "fssai", label: "FSSAI License", required: false },
  { value: "shop_license", label: "Shop License", required: true },
  { value: "pan", label: "PAN Card", required: true },
  { value: "trade_license", label: "Trade License", required: false },
];

/**
 * GET /api/v1/retailer-admin/compliance
 * Returns compliance documents status for the retailer's store
 */
retailerComplianceRouter.get("/compliance", requireRetailerAuth, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ success: false, error: "database unavailable" });

  const { storeId } = (req as any).retailerAuth as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ success: false, error: "Store not configured" });
  }

  try {
    // MED-001: For now, return empty documents with feature flag
    // Full implementation would query a compliance_documents table
    const documents: any[] = [];

    // Note: gstin, pan, fssai_license_no columns don't exist yet in platform.stores
    // When they're added, we can query them here. For now, return empty list.

    // Calculate summary
    const verifiedCount = documents.filter(d => d.status === "verified").length;
    const pendingCount = documents.filter(d => d.status === "pending").length;
    const rejectedCount = documents.filter(d => d.status === "rejected").length;

    return res.json({
      success: true,
      data: {
        documents,
        summary: {
          verified: verifiedCount,
          pending: pendingCount,
          rejected: rejectedCount,
          total: documents.length,
        },
        documentTypes: REQUIRED_DOCUMENT_TYPES,
        // MED-001: Flag that document upload is not yet implemented
        uploadEnabled: false,
        message: "Document upload coming soon. Contact support to update compliance documents.",
      },
    });
  } catch (error: any) {
    console.error("[Compliance] Error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to fetch compliance status" });
  }
});

/**
 * GET /api/v1/retailer-admin/compliance/types
 * Returns list of required document types
 */
retailerComplianceRouter.get("/compliance/types", requireRetailerAuth, async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      documentTypes: REQUIRED_DOCUMENT_TYPES,
    },
  });
});
