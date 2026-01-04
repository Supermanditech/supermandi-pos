import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { createPurchase, type PurchaseItemInput } from "../../../services/purchaseService";

export const posPurchasesRouter = Router();

posPurchasesRouter.post("/purchases", requireDeviceToken, async (req, res) => {
  const { items, supplierName, currency, purchaseId } = req.body as {
    items?: Array<{
      barcode?: string;
      productId?: string;
      productName?: string;
      quantity?: number;
      unit?: string | null;
      unitCostMinor?: number;
      currency?: string | null;
    }>;
    supplierName?: string | null;
    currency?: string | null;
    purchaseId?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items are required" });
  }

  const normalizedItems: PurchaseItemInput[] = items.map((item) => ({
    barcode: typeof item.barcode === "string" ? item.barcode.trim() : undefined,
    productId: typeof item.productId === "string" ? item.productId.trim() : undefined,
    productName: typeof item.productName === "string" ? item.productName.trim() : undefined,
    quantity: typeof item.quantity === "number" ? item.quantity : NaN,
    unit: typeof item.unit === "string" ? item.unit.trim() : null,
    unitCostMinor: typeof item.unitCostMinor === "number" ? item.unitCostMinor : NaN,
    currency: typeof item.currency === "string" ? item.currency.trim() : undefined
  }));

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await createPurchase({
      client,
      storeId,
      input: {
        purchaseId,
        supplierName: supplierName ?? null,
        currency: currency ?? null,
        items: normalizedItems
      }
    });
    await client.query("COMMIT");
    return res.status(201).json({
      purchaseId: result.purchaseId,
      totalMinor: result.totalMinor,
      currency: result.currency
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    const message = error?.message ? String(error.message) : "";
    if (message === "barcode_in_use") {
      return res.status(409).json({ error: message });
    }
    if (
      message === "items_required" ||
      message === "invalid_quantity" ||
      message === "invalid_unit_cost" ||
      message === "invalid_item" ||
      message === "product_not_found" ||
      message === "bulk_unit_mismatch"
    ) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: "failed to create purchase" });
  } finally {
    client.release();
  }
});
