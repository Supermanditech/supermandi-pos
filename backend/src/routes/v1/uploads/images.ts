// T-160: Image upload endpoint with GCS / local storage
// T-164: Image optimization/resizing pipeline (3 sizes via sharp)
// POST /api/v1/uploads/image — multipart form data (field: "image")
// Auth required via requireDeviceToken OR admin token
// Max 5MB, JPEG/PNG/WebP only

import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { log } from "../../../lib/logger";

export const uploadsRouter = Router();

// =============================================================================
// CONFIGURATION
// =============================================================================

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// GCS bucket for product images (if available)
// AUD-008: Warn at startup if env var missing — falls back to hardcoded name which
// will silently fail in production if the bucket name differs.
const GCS_IMAGES_BUCKET = process.env.GCS_IMAGES_BUCKET || "supermandi-pos-images";
if (!process.env.GCS_IMAGES_BUCKET) {
  log.warn("[uploads/images] GCS_IMAGES_BUCKET env var not set — using fallback 'supermandi-pos-images'. Image uploads may fail if bucket name differs.");
}

// Local uploads directory (for dev / no-GCS fallback)
const LOCAL_UPLOADS_DIR = path.resolve(__dirname, "../../../../uploads");

// Public base URL for serving uploaded images
// In production this would be a CDN or GCS public URL
const PUBLIC_BASE_URL = process.env.IMAGE_PUBLIC_BASE_URL || "/uploads";

// =============================================================================
// MULTER SETUP
// =============================================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP`));
    }
  },
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a unique filename for the uploaded image
 */
function generateFileName(originalName: string, mimeType: string): string {
  const ext = mimeType === "image/png" ? ".png"
    : mimeType === "image/webp" ? ".webp"
    : ".jpg";
  const hash = crypto.randomBytes(16).toString("hex");
  const timestamp = Date.now();
  return `${timestamp}_${hash}${ext}`;
}

/**
 * Try to upload to GCS. Returns URL or null if GCS is not available.
 */
async function tryUploadToGcs(
  buffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string | null> {
  try {
    // Dynamic import to avoid hard dependency on @google-cloud/storage
    const { uploadBuffer } = await import("@supermandi/common");
    if (typeof uploadBuffer !== "function") return null;

    const objectKey = `images/${fileName}`;
    await uploadBuffer(GCS_IMAGES_BUCKET, objectKey, buffer, contentType);

    // Return the GCS public URL or signed URL path
    return `https://storage.googleapis.com/${GCS_IMAGES_BUCKET}/${objectKey}`;
  } catch {
    // GCS not configured or not available — fall back to local storage
    return null;
  }
}

/**
 * Save file to local disk (development fallback)
 */
function saveToLocal(buffer: Buffer, fileName: string): string {
  // Ensure the uploads directory exists
  if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
    fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
  }

  const filePath = path.join(LOCAL_UPLOADS_DIR, fileName);
  fs.writeFileSync(filePath, buffer);

  return `${PUBLIC_BASE_URL}/${fileName}`;
}

// =============================================================================
// T-164: IMAGE OPTIMIZATION / RESIZING PIPELINE
// =============================================================================

/**
 * T-164: Image size variants
 * thumb  - 64x64   - POS list view thumbnails
 * medium - 256x256 - POS detail view, catalog cards
 * large  - 800x800 - Full product image, web portals
 */
interface ImageVariant {
  suffix: string;
  width: number;
  height: number;
}

const IMAGE_VARIANTS: ImageVariant[] = [
  { suffix: "_thumb", width: 64, height: 64 },
  { suffix: "_medium", width: 256, height: 256 },
  { suffix: "_large", width: 800, height: 800 },
];

/**
 * T-164: Try to load sharp for image resizing
 * Graceful degradation: if sharp is not installed, skip resizing
 */
let sharpModule: any = null;
try {
  sharpModule = require("sharp");
} catch {
  log.warn("[T-164] sharp not available — image resizing disabled (fallback to original)");
}

/**
 * T-164: Resize and optimize an image buffer
 * Returns map of suffix -> optimized buffer
 * If sharp is unavailable, returns empty map (graceful degradation)
 */
async function generateImageVariants(
  buffer: Buffer,
  mimeType: string
): Promise<Map<string, Buffer>> {
  const variants = new Map<string, Buffer>();

  if (!sharpModule) return variants;

  const outputFormat = mimeType === "image/png" ? "png" : "jpeg";

  for (const variant of IMAGE_VARIANTS) {
    try {
      let pipeline = sharpModule(buffer).resize(variant.width, variant.height, {
        fit: "inside",
        withoutEnlargement: true,
      });

      if (outputFormat === "png") {
        pipeline = pipeline.png({ quality: 80, compressionLevel: 8 });
      } else {
        pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
      }

      const resized = await pipeline.toBuffer();
      variants.set(variant.suffix, resized);
    } catch (err) {
      log.warn(`[T-164] Failed to generate ${variant.suffix} variant:`, err);
      // Continue with other variants
    }
  }

  return variants;
}

/**
 * T-164: Save all image variants to local storage
 */
function saveVariantsToLocal(
  variants: Map<string, Buffer>,
  baseName: string,
  ext: string
): Record<string, string> {
  const urls: Record<string, string> = {};

  if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
    fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
  }

  for (const [suffix, buf] of variants.entries()) {
    const variantFileName = `${baseName}${suffix}${ext}`;
    const filePath = path.join(LOCAL_UPLOADS_DIR, variantFileName);
    fs.writeFileSync(filePath, buf);
    urls[suffix.replace("_", "")] = `${PUBLIC_BASE_URL}/${variantFileName}`;
  }

  return urls;
}

/**
 * T-164: Upload all image variants to GCS
 */
async function uploadVariantsToGcs(
  variants: Map<string, Buffer>,
  baseName: string,
  ext: string,
  contentType: string
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};

  try {
    const { uploadBuffer } = await import("@supermandi/common");
    if (typeof uploadBuffer !== "function") return urls;

    for (const [suffix, buf] of variants.entries()) {
      const objectKey = `images/${baseName}${suffix}${ext}`;
      await uploadBuffer(GCS_IMAGES_BUCKET, objectKey, buf, contentType);
      urls[suffix.replace("_", "")] = `https://storage.googleapis.com/${GCS_IMAGES_BUCKET}/${objectKey}`;
    }
  } catch {
    // GCS not available — caller should fall back to local
  }

  return urls;
}

// =============================================================================
// ROUTE: POST /api/v1/uploads/image
// =============================================================================

/**
 * POST /api/v1/uploads/image
 * Upload a product image (multipart form data, field name: "image")
 *
 * Auth: requireDeviceToken (POS device) — store isolation via JWT
 *
 * Returns:
 *   { success: true, data: { imageUrl: string } }
 *
 * Errors:
 *   400 — No file provided or invalid file type
 *   413 — File too large (>5MB)
 *   503 — Storage unavailable
 */
uploadsRouter.post("/image", requireDeviceToken, (req: Request, res: Response) => {
  upload.single("image")(req, res, async (multerErr: any) => {
    // Handle multer errors (file too large, invalid type)
    if (multerErr) {
      if (multerErr.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          error: {
            code: "FILE_TOO_LARGE",
            message: `Image exceeds maximum size of ${MAX_IMAGE_SIZE / (1024 * 1024)}MB`,
          },
        });
      }
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: multerErr.message || "Invalid file upload",
        },
      });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: 'No image file provided. Use form field name "image".',
        },
      });
    }

    // Additional mime type validation (defense in depth)
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP`,
        },
      });
    }

    try {
      const fileName = generateFileName(file.originalname, file.mimetype);
      const ext = path.extname(fileName);
      const baseName = fileName.replace(ext, "");

      // T1-005: GCS is required on Cloud Run (ephemeral filesystem loses files on restart)
      let imageUrl = await tryUploadToGcs(file.buffer, fileName, file.mimetype);
      if (!imageUrl) {
        // T1-005: In development, allow local fallback; in production/staging, return 503
        if (process.env.NODE_ENV === 'development') {
          imageUrl = saveToLocal(file.buffer, fileName);
        } else {
          log.error('[T1-005] GCS upload failed and local fallback disabled in production');
          return res.status(503).json({
            success: false,
            error: { code: 'STORAGE_UNAVAILABLE', message: 'Image storage is temporarily unavailable' },
          });
        }
      }

      // T-164: Generate optimized variants (thumb, medium, large)
      let variantUrls: Record<string, string> = {};
      try {
        const variants = await generateImageVariants(file.buffer, file.mimetype);
        if (variants.size > 0) {
          // Try GCS variants first
          variantUrls = await uploadVariantsToGcs(variants, baseName, ext, file.mimetype);
          if (Object.keys(variantUrls).length === 0 && process.env.NODE_ENV === 'development') {
            // T1-005: Local variant fallback only in development
            variantUrls = saveVariantsToLocal(variants, baseName, ext);
          }
        }
      } catch (variantErr) {
        log.warn("[T-164] Variant generation failed (non-fatal):", variantErr);
        // Non-fatal: original image is still saved
      }

      return res.json({
        success: true,
        data: {
          imageUrl,
          // T-164: Include variant URLs if available
          ...(Object.keys(variantUrls).length > 0 && { variants: variantUrls }),
        },
      });
    } catch (error) {
      log.error("[T-160] Image upload error:", error);
      return res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Failed to store image",
        },
      });
    }
  });
});
