import { Router } from "express";
import { redisRateLimit } from "../../../middleware/rateLimit";
import {
  lookupProductByBarcode,
  resolveScan,
  updateProductPrice,
  type ScanMode
} from "../../../services/posScanStore";
import { resolveScanForDigitisation } from "../../../services/storeProductDigitisationService";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { requirePosStaff } from "../../../middleware/posStaff";
import { log } from "../../../lib/logger";

export const posScanRouter = Router();

// GO-LIVE-040: Rate limiting for scan endpoints
// 120 scans per minute per device (2 per second average)
// SA-P2-011: Redis-backed rate limiting for scan endpoints
const scanRateLimiter = redisRateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => {
    // Rate limit per device
    const posDevice = (req as any).posDevice as { deviceId?: string } | undefined;
    return posDevice?.deviceId || req.ip || 'unknown';
  },
});

// GO-LIVE-041: Barcode format validation
// Supports EAN-13, EAN-8, UPC-A, UPC-E, and internal SM-xxx barcodes
const BARCODE_PATTERNS = {
  EAN13: /^\d{13}$/,
  EAN8: /^\d{8}$/,
  UPC_A: /^\d{12}$/,
  UPC_E: /^\d{6,8}$/,
  INTERNAL: /^SM-[A-Z0-9]{3,20}$/i,
  // Allow numeric barcodes 6-14 digits (covers most standard formats)
  GENERIC_NUMERIC: /^\d{6,14}$/,
};

function validateBarcodeFormat(barcode: string): { valid: boolean; error?: string } {
  if (!barcode || typeof barcode !== 'string') {
    return { valid: false, error: 'Barcode is required' };
  }

  const trimmed = barcode.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Barcode cannot be empty' };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: 'Barcode too long (max 50 characters)' };
  }

  // Check for valid characters (alphanumeric and hyphens only)
  if (!/^[A-Za-z0-9-]+$/.test(trimmed)) {
    return { valid: false, error: 'Invalid barcode characters' };
  }

  // Check if matches any known format
  const matchesKnownFormat =
    BARCODE_PATTERNS.EAN13.test(trimmed) ||
    BARCODE_PATTERNS.EAN8.test(trimmed) ||
    BARCODE_PATTERNS.UPC_A.test(trimmed) ||
    BARCODE_PATTERNS.UPC_E.test(trimmed) ||
    BARCODE_PATTERNS.INTERNAL.test(trimmed) ||
    BARCODE_PATTERNS.GENERIC_NUMERIC.test(trimmed);

  if (!matchesKnownFormat) {
    return { valid: false, error: 'Invalid barcode format' };
  }

  return { valid: true };
}

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
 *
 * GO-LIVE-040: Rate limited to 120 requests per minute per device
 * GO-LIVE-041: Barcode format validation applied
 */
// BUG-002: Added requirePosStaff to validate x-staff-id header against platform.store_staff
// BUG-003: Added requireActiveStore to enforce store suspension
posScanRouter.post("/scan/resolve", requireDeviceToken, requireActiveStore, requirePosStaff, scanRateLimiter, async (req, res) => {
  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };

  // Detect request format
  const { barcode, scanValue, mode } = req.body as {
    barcode?: string;
    scanValue?: string;
    mode?: ScanMode;
  };

  // NEW FORMAT: { barcode } - SD-ONBOARD-001B digitisation contract
  if (typeof barcode === "string") {
    // GO-LIVE-041: Validate barcode format
    const validation = validateBarcodeFormat(barcode);
    if (!validation.valid) {
      return res.status(422).json({
        error: "VALIDATION_ERROR",
        message: validation.error || "Invalid barcode format"
      });
    }

    const trimmedBarcode = barcode.trim();

    try {
      const result = await resolveScanForDigitisation(storeId, trimmedBarcode);
      return res.json(result);
    } catch (error) {
      log.error("[scan/resolve] Error resolving barcode:", error);
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

  // GO-LIVE-041: Validate scanValue format for legacy mode
  const scanValidation = validateBarcodeFormat(scanValue);
  if (!scanValidation.valid) {
    return res.status(400).json({ error: scanValidation.error || "Invalid barcode format" });
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
// GO-LIVE-040: Rate limited
// BUG-003: Added requireActiveStore to enforce store suspension
posScanRouter.post("/products/price", requireDeviceToken, requireActiveStore, scanRateLimiter, async (req, res) => {
  const { productId, priceMinor } = req.body as {
    productId?: string;
    priceMinor?: number;
  };

  if (typeof productId !== "string" || productId.trim().length === 0) {
    return res.status(400).json({ error: "productId is required" });
  }

  // AUD-059-A FIX: Add price bounds validation (max 10M INR = 1B paise)
  const MAX_PRICE_MINOR = 1000000000;
  if (typeof priceMinor !== "number" || !Number.isFinite(priceMinor) || priceMinor <= 0) {
    return res.status(400).json({ error: "priceMinor must be a positive number" });
  }
  if (priceMinor > MAX_PRICE_MINOR) {
    return res.status(400).json({ error: "priceMinor exceeds maximum allowed value" });
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
// GO-LIVE-040: Rate limited
// GO-LIVE-041: Barcode format validation
posScanRouter.get("/products/lookup", requireDeviceToken, scanRateLimiter, async (req, res) => {
  const barcode = typeof req.query.barcode === "string" ? req.query.barcode : "";

  if (!barcode.trim()) {
    return res.status(400).json({ error: "barcode is required" });
  }

  // GO-LIVE-041: Validate barcode format
  const validation = validateBarcodeFormat(barcode);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error || "Invalid barcode format" });
  }

  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    const product = await lookupProductByBarcode(barcode.trim(), storeId);
    if (!product) {
      return res.status(404).json({ error: "product_not_found" });
    }
    return res.json({ product });
  } catch (error) {
    return res.status(503).json({ error: "database unavailable" });
  }
});
