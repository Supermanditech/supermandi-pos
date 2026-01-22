import { Router } from "express";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import {
  createStoreProductFromDigitisation,
  type CreateStoreProductInput,
  type CreateStoreProductResult
} from "../../../services/storeProductDigitisationService";

export const posStoreProductsRouter = Router();

type SuccessResult = Extract<CreateStoreProductResult, { success: true }>;
type ConflictResult = Extract<CreateStoreProductResult, { success: false; error: "CONFLICT" }>;
type ValidationResult = Extract<CreateStoreProductResult, { success: false; error: "VALIDATION" }>;

function isSuccessResult(result: CreateStoreProductResult): result is SuccessResult {
  return result.success;
}

function isConflictResult(result: CreateStoreProductResult): result is ConflictResult {
  return !result.success && "error" in result && result.error === "CONFLICT";
}

/**
 * POST /api/v1/pos/store-products
 * Create a store product during digitisation flow
 *
 * Request body:
 * {
 *   "barcode": "8901030000000",
 *   "name": "Parle-G",
 *   "sellPrice": 10,       // Minor units (paise) - REQUIRED
 *   "mrp": 10,             // Minor units (paise) - optional
 *   "initialStockQty": 48, // REQUIRED
 *   "unit": "pcs",         // optional
 *   "description": "",     // optional
 *   "brand": ""            // optional
 * }
 *
 * Response (201 Created):
 * {
 *   "storeProduct": {
 *     "storeProductId": "...",
 *     "name": "Parle-G",
 *     "barcode": "8901030000000",
 *     "sellPrice": 10,
 *     "mrp": 10,
 *     "stock": { "isKnown": true, "qty": 48 },
 *     "unit": "pcs",
 *     "brand": "",
 *     "description": "",
 *     "imageUrl": ""
 *   }
 * }
 *
 * Response (409 Conflict) - if barcode already mapped for this store:
 * {
 *   "error": "BARCODE_ALREADY_MAPPED",
 *   "message": "Barcode already exists for this store",
 *   "storeProduct": { ... existing product ... }
 * }
 *
 * Response (422 Validation Error):
 * {
 *   "error": "VALIDATION_ERROR",
 *   "message": "Sell price must be positive"
 * }
 */
posStoreProductsRouter.post("/store-products", requireDeviceToken, async (req, res) => {
  const { storeId } = (req as any).posDevice as { storeId: string };

  const {
    barcode,
    name,
    sellPrice,
    mrp,
    initialStockQty,
    unit,
    description,
    brand
  } = req.body as Partial<CreateStoreProductInput>;

  // Basic validation
  if (typeof barcode !== "string" || barcode.trim().length === 0) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: "Barcode is required"
    });
  }

  if (typeof sellPrice !== "number" || !Number.isFinite(sellPrice) || sellPrice <= 0) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: "Sell price must be a positive number"
    });
  }

  if (typeof initialStockQty !== "number" || !Number.isFinite(initialStockQty) || initialStockQty < 0) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: "Initial stock quantity must be >= 0"
    });
  }

  try {
    const result = await createStoreProductFromDigitisation(storeId, {
      barcode,
      name: name || "",
      sellPrice,
      mrp,
      initialStockQty,
      unit,
      description,
      brand
    });

    if (isSuccessResult(result)) {
      return res.status(201).json({
        storeProduct: result.storeProduct
      });
    } else if (isConflictResult(result)) {
      return res.status(409).json({
        error: "BARCODE_ALREADY_MAPPED",
        message: "Barcode already exists for this store",
        storeProduct: result.existingProduct
      });
    }

    // Validation error
    const validationResult = result as ValidationResult;
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: validationResult.message
    });
  } catch (error) {
    console.error("[storeProducts] Error creating store product:", error);
    return res.status(503).json({
      error: "SERVICE_UNAVAILABLE",
      message: "Database unavailable"
    });
  }
});
