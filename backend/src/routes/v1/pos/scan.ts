import { Router } from "express";
import {
  lookupProductByBarcode,
  resolveScan,
  updateProductPrice,
  type ScanMode
} from "../../../services/posScanStore";
import { resolveScanForDigitisation } from "../../../services/storeProductDigitisationService";
import { requireDeviceToken } from "../../../middleware/deviceToken";

export const posScanRouter = Router();

/**
 * POST /api/v1/pos/scan/resolve
 *
 * Supports TWO request formats:
 *
 * 1. NEW FORMAT (SD-ONBOARD-001B digitisation contract):
 *    Body: { "barcode": "8901030000000" }
 *    Response: { status: "FOUND" | "NEEDS_CREATE" | "NOT_FOUND", ... }
 *
 * 2. LEGACY FORMAT (backward compatibility):
 *    Body: { "scanValue": "...", "mode": "SELL" | "DIGITISE" }
 *    Response: { action: "ADD_TO_CART" | "PROMPT_PRICE" | ..., product: {...} }
 */
posScanRouter.post("/scan/resolve", requireDeviceToken, async (req, res) => {
  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };

  // Detect request format
  const { barcode, scanValue, mode } = req.body as {
    barcode?: string;
    scanValue?: string;
    mode?: ScanMode;
  };

  // NEW FORMAT: { barcode } - SD-ONBOARD-001B digitisation contract
  if (typeof barcode === "string") {
    const trimmedBarcode = barcode.trim();

    if (trimmedBarcode.length === 0) {
      return res.status(422).json({
        error: "VALIDATION_ERROR",
        message: "Barcode is required"
      });
    }

    try {
      const result = await resolveScanForDigitisation(storeId, trimmedBarcode);
      return res.json(result);
    } catch (error) {
      console.error("[scan/resolve] Error resolving barcode:", error);
      return res.status(503).json({
        error: "SERVICE_UNAVAILABLE",
        message: "Database unavailable"
      });
    }
  }

  // LEGACY FORMAT: { scanValue, mode }
  if (typeof scanValue !== "string" || scanValue.trim().length === 0) {
    return res.status(400).json({ error: "scanValue is required" });
  }

  if (mode !== "SELL" && mode !== "DIGITISE") {
    return res.status(400).json({ error: "mode must be SELL or DIGITISE" });
  }

  try {
    const result = await resolveScan(scanValue, mode, storeId, deviceId);
    return res.json(result);
  } catch (error) {
    return res.status(503).json({ error: "database unavailable" });
  }
});

// POST /api/v1/pos/products/price
posScanRouter.post("/products/price", requireDeviceToken, async (req, res) => {
  const { productId, priceMinor } = req.body as {
    productId?: string;
    priceMinor?: number;
  };

  if (typeof productId !== "string" || productId.trim().length === 0) {
    return res.status(400).json({ error: "productId is required" });
  }

  if (typeof priceMinor !== "number" || !Number.isFinite(priceMinor) || priceMinor <= 0) {
    return res.status(400).json({ error: "priceMinor must be a positive number" });
  }

  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    const updated = await updateProductPrice(productId, Math.round(priceMinor), storeId);
    if (!updated) {
      return res.status(404).json({ error: "product not found" });
    }

    return res.json({ product: updated });
  } catch (error) {
    return res.status(503).json({ error: "database unavailable" });
  }
});

// GET /api/v1/pos/products/lookup?barcode=...
posScanRouter.get("/products/lookup", requireDeviceToken, async (req, res) => {
  const barcode = typeof req.query.barcode === "string" ? req.query.barcode : "";

  if (!barcode.trim()) {
    return res.status(400).json({ error: "barcode is required" });
  }

  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    const product = await lookupProductByBarcode(barcode, storeId);
    if (!product) {
      return res.status(404).json({ error: "product_not_found" });
    }
    return res.json({ product });
  } catch (error) {
    return res.status(503).json({ error: "database unavailable" });
  }
});
