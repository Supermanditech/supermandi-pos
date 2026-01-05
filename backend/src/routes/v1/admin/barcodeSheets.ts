import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import {
  buildBarcodeSheetPdf,
  listBarcodeSheetItems,
  resolveBarcodeSheetTier
} from "../../../services/barcodeSheetService";

export const adminBarcodeSheetsRouter = Router();

adminBarcodeSheetsRouter.use(requireAdminToken);

// GET /api/v1/admin/barcode-sheets?storeId=...&tier=1
adminBarcodeSheetsRouter.get("/barcode-sheets", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = typeof req.query.storeId === "string" ? req.query.storeId.trim() : "";
  const tier = resolveBarcodeSheetTier(typeof req.query.tier === "string" ? req.query.tier : undefined);

  if (!storeId) {
    return res.status(400).json({ error: "storeId is required" });
  }

  if (!tier) {
    return res.status(400).json({ error: "tier must be 1 or 2" });
  }

  try {
    const items = await listBarcodeSheetItems({ client: pool, storeId });
    if (items.length === 0) {
      return res.status(404).json({ error: "no_barcodes" });
    }

    const pdf = await buildBarcodeSheetPdf({
      items,
      tier,
      title: `SuperMandi Barcode Sheet (${storeId})`
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="supermandi-barcodes-${storeId}-${tier}.pdf"`
    );
    return res.send(pdf);
  } catch (error) {
    return res.status(500).json({ error: "barcode_sheet_failed" });
  }
});
