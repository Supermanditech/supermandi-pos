// T-190: POS Compliance/KYC Document Upload
// Endpoints for uploading compliance documents from POS mobile app

import { Router, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";

export const posComplianceRouter = Router();

// =============================================================================
// CONFIGURATION
// =============================================================================

const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_DOC_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const VALID_DOC_TYPES = [
  "pan",
  "aadhaar",
  "gstin_certificate",
  "fssai",
  "shop_license",
  "trade_license",
  "cancelled_cheque",
  "store_photo",
  "owner_photo",
] as const;

type DocType = typeof VALID_DOC_TYPES[number];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOC_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOC_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, PDF`));
    }
  },
});

// =============================================================================
// GET /api/v1/pos/compliance/status
// T-190: Get compliance document status for the store
// =============================================================================

posComplianceRouter.get("/compliance/status", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    const result = await pool.query(
      `SELECT
         document_type as "documentType",
         file_name as "fileName",
         status,
         uploaded_at as "uploadedAt",
         reviewed_at as "reviewedAt",
         rejection_reason as "rejectionReason"
       FROM platform.store_documents
       WHERE store_id = $1
       ORDER BY document_type ASC`,
      [storeId]
    );

    // Build status map: docType -> status
    const uploaded = new Map<string, any>();
    for (const row of result.rows) {
      uploaded.set(row.documentType, row);
    }

    const documents = VALID_DOC_TYPES.map(docType => ({
      documentType: docType,
      label: docType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      required: docType === 'pan' || docType === 'shop_license',
      status: uploaded.get(docType)?.status || 'not_uploaded',
      fileName: uploaded.get(docType)?.fileName || null,
      uploadedAt: uploaded.get(docType)?.uploadedAt || null,
      rejectionReason: uploaded.get(docType)?.rejectionReason || null,
    }));

    const verifiedCount = documents.filter(d => d.status === 'verified').length;
    const pendingCount = documents.filter(d => d.status === 'pending').length;
    const requiredMissing = documents.filter(d => d.required && d.status === 'not_uploaded').length;

    return res.json({
      success: true,
      documents,
      summary: {
        total: documents.length,
        verified: verifiedCount,
        pending: pendingCount,
        requiredMissing,
        isComplete: requiredMissing === 0 && pendingCount === 0,
      },
    });
  } catch (error: any) {
    // Table might not exist yet
    if (error.code === "42P01") {
      return res.json({
        success: true,
        documents: VALID_DOC_TYPES.map(docType => ({
          documentType: docType,
          label: docType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          required: docType === 'pan' || docType === 'shop_license',
          status: 'not_uploaded',
          fileName: null,
          uploadedAt: null,
          rejectionReason: null,
        })),
        summary: { total: VALID_DOC_TYPES.length, verified: 0, pending: 0, requiredMissing: 2, isComplete: false },
      });
    }
    console.error("[T-190] Compliance status error:", error.message);
    return res.status(500).json({ error: "Failed to fetch compliance status" });
  }
});

// =============================================================================
// POST /api/v1/pos/compliance/upload
// T-190: Upload a compliance document from POS
// =============================================================================

posComplianceRouter.post("/compliance/upload", requireDeviceToken, (req: Request, res: Response) => {
  upload.single("document")(req, res, async (multerErr: any) => {
    if (multerErr) {
      if (multerErr.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: `Document exceeds maximum size of ${MAX_DOC_SIZE / (1024 * 1024)}MB`,
        });
      }
      return res.status(400).json({ error: multerErr.message || "Invalid file upload" });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No document file provided. Use form field name "document".' });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { storeId } = (req as any).posDevice as { storeId: string };
    const documentType = req.body.documentType as string;

    if (!documentType || !VALID_DOC_TYPES.includes(documentType as DocType)) {
      return res.status(400).json({
        error: `Invalid documentType. Must be one of: ${VALID_DOC_TYPES.join(', ')}`,
      });
    }

    try {
      const hash = crypto.randomBytes(16).toString("hex");
      const ext = file.mimetype === "application/pdf" ? ".pdf"
        : file.mimetype === "image/png" ? ".png"
        : file.mimetype === "image/webp" ? ".webp"
        : ".jpg";
      const fileName = `${storeId}_${documentType}_${Date.now()}_${hash}${ext}`;

      // Try GCS upload, fall back to local storage
      let fileUrl: string;
      try {
        const { uploadBuffer } = await import("@supermandi/common");
        const objectKey = `compliance/${storeId}/${fileName}`;
        await uploadBuffer(
          process.env.GCS_DOCUMENTS_BUCKET || 'supermandi-pos-documents',
          objectKey,
          file.buffer,
          file.mimetype
        );
        fileUrl = `gcs://${process.env.GCS_DOCUMENTS_BUCKET || 'supermandi-pos-documents'}/${objectKey}`;
      } catch {
        // Local fallback
        const fs = await import("fs");
        const path = await import("path");
        const uploadsDir = path.resolve(__dirname, "../../../../uploads/compliance");
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        fs.writeFileSync(path.join(uploadsDir, fileName), file.buffer);
        fileUrl = `/uploads/compliance/${fileName}`;
      }

      // Upsert document record
      await pool.query(
        `INSERT INTO platform.store_documents (store_id, document_type, file_name, file_url, file_size, mime_type, status, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
         ON CONFLICT (store_id, document_type) DO UPDATE SET
           file_name = $3, file_url = $4, file_size = $5, mime_type = $6,
           status = 'pending', uploaded_at = NOW(), rejection_reason = NULL`,
        [storeId, documentType, fileName, fileUrl, file.size, file.mimetype]
      );

      return res.json({
        success: true,
        documentType,
        fileName,
        status: 'pending',
      });
    } catch (error: any) {
      console.error("[T-190] Document upload error:", error.message);
      return res.status(500).json({ error: "Failed to upload document" });
    }
  });
});
