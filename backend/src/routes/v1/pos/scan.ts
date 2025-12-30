import { Router } from "express";
import { resolveScan, updateProductPrice, type ScanMode } from "../../../services/posScanStore";
import { requireDeviceToken } from "../../../middleware/deviceToken";

export const posScanRouter = Router();

// POST /api/v1/pos/scan/resolve
posScanRouter.post("/scan/resolve", requireDeviceToken, async (req, res) => {
  const { scanValue, mode } = req.body as {
    scanValue?: string;
    mode?: ScanMode;
  };

  if (typeof scanValue !== "string" || scanValue.trim().length === 0) {
    return res.status(400).json({ error: "scanValue is required" });
  }

  if (mode !== "SELL" && mode !== "DIGITISE") {
    return res.status(400).json({ error: "mode must be SELL or DIGITISE" });
  }

  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    const result = await resolveScan(scanValue, mode, storeId);
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
