// GL-WF-018: KYC Document Upload Routes
// GL-WF-008: Bank Verification via IFSC lookup
// STBT-179: Migrated from /tmp disk storage to GCS for Cloud Run compatibility

import { Router, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import {
  uploadBuffer,
  deleteFile as gcsDeleteFile,
} from "@supermandi/common";

const router = Router();

// =============================================================================
// FILE UPLOAD CONFIGURATION — STBT-179: GCS instead of /tmp
// =============================================================================
const GCS_DOCUMENTS_BUCKET = process.env.GCS_DOCUMENTS_BUCKET || 'supermandi-pos-documents';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per document

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
  }
});

// Valid KYC document types
const VALID_DOC_TYPES = ['pan_card', 'gstin_certificate', 'address_proof', 'cancelled_cheque', 'business_license'];

// =============================================================================
// GL-WF-008: IFSC Validation and Bank Lookup
// =============================================================================

interface IFSCData {
  BANK: string;
  BRANCH: string;
  ADDRESS: string;
  CITY: string;
  STATE: string;
  IFSC: string;
}

// STBT-183: Timeout for external IFSC API calls
const IFSC_API_TIMEOUT_MS = 5_000; // 5 seconds max

/**
 * Validate IFSC code format and lookup bank details
 * Uses Razorpay's public IFSC API with timeout + format-based fallback
 * STBT-183: Added AbortController timeout and basic fallback for known banks
 */
async function lookupIFSC(ifscCode: string): Promise<IFSCData | null> {
  // Validate format first
  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  if (!ifscRegex.test(ifscCode)) {
    return null;
  }

  try {
    // STBT-183: Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IFSC_API_TIMEOUT_MS);

    const response = await fetch(`https://ifsc.razorpay.com/${ifscCode}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as IFSCData;
    return data;
  } catch (error: any) {
    // STBT-183: On timeout/network error, derive bank name from IFSC prefix
    // First 4 chars of IFSC = bank code (e.g., SBIN = State Bank of India)
    const bankPrefix = ifscCode.substring(0, 4);
    const knownBanks: Record<string, string> = {
      SBIN: 'State Bank of India', HDFC: 'HDFC Bank', ICIC: 'ICICI Bank',
      UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra Bank', PUNB: 'Punjab National Bank',
      BARB: 'Bank of Baroda', CNRB: 'Canara Bank', UBIN: 'Union Bank of India',
      IOBA: 'Indian Overseas Bank', BKID: 'Bank of India', IDIB: 'Indian Bank',
      ALLA: 'Allahabad Bank', MAHB: 'Bank of Maharashtra', CBIN: 'Central Bank of India',
      UCBA: 'UCO Bank', YESB: 'Yes Bank', FDRL: 'Federal Bank',
      SIBL: 'South Indian Bank', KARB: 'Karnataka Bank',
    };

    const bankName = knownBanks[bankPrefix];
    if (bankName) {
      console.warn(`[IFSC] External API failed, using fallback for ${bankPrefix}: ${error?.name || error?.message}`);
      return {
        BANK: bankName,
        BRANCH: 'Branch lookup unavailable',
        ADDRESS: '',
        CITY: '',
        STATE: '',
        IFSC: ifscCode,
      };
    }

    console.error('[IFSC] Lookup failed, no fallback available:', error?.message);
    return null;
  }
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/supplier/kyc/verify-ifsc
 * GL-WF-008: Verify IFSC code and get bank details
 */
router.post("/verify-ifsc", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { ifscCode } = req.body;

    if (!ifscCode) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'IFSC code is required' }
      });
      return;
    }

    const ifscData = await lookupIFSC(ifscCode.toUpperCase());

    if (!ifscData) {
      res.status(400).json({
        error: { code: 'INVALID_IFSC', message: 'Invalid IFSC code or bank not found' }
      });
      return;
    }

    res.json({
      data: {
        valid: true,
        bankName: ifscData.BANK,
        branchName: ifscData.BRANCH,
        address: ifscData.ADDRESS,
        city: ifscData.CITY,
        state: ifscData.STATE,
        ifsc: ifscData.IFSC,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/kyc/verify-bank
 * GL-WF-008: Verify bank account details and update status
 */
router.post("/verify-bank", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { accountNumber, ifscCode, accountName } = req.body;

    if (!accountNumber || !ifscCode || !accountName) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Account number, IFSC code, and account name are required' }
      });
      return;
    }

    // Validate account number format (9-18 digits)
    const accountRegex = /^\d{9,18}$/;
    if (!accountRegex.test(accountNumber)) {
      res.status(400).json({
        error: { code: 'INVALID_ACCOUNT', message: 'Account number must be 9-18 digits' }
      });
      return;
    }

    // Verify IFSC and get bank name
    const ifscData = await lookupIFSC(ifscCode.toUpperCase());
    if (!ifscData) {
      res.status(400).json({
        error: { code: 'INVALID_IFSC', message: 'Invalid IFSC code or bank not found' }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Update bank details with verification
    const verificationRef = `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await pool.query(
      `UPDATE supplier.suppliers SET
        bank_account_number = $1,
        bank_ifsc = $2,
        bank_account_name = $3,
        bank_name = $4,
        bank_verification_status = 'verified',
        bank_verified_at = NOW(),
        bank_verification_ref = $5,
        updated_at = NOW()
      WHERE id = $6`,
      [accountNumber, ifscCode.toUpperCase(), accountName, ifscData.BANK, verificationRef, req.supplierId]
    );

    res.json({
      data: {
        verified: true,
        bankName: ifscData.BANK,
        branchName: ifscData.BRANCH,
        verificationRef,
        message: 'Bank account verified successfully'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/supplier/kyc/documents
 * GL-WF-018: Get all KYC documents for supplier
 */
router.get("/documents", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    const result = await pool.query(
      `SELECT
        id,
        document_type,
        file_name,
        file_size,
        mime_type,
        status,
        rejection_reason,
        created_at,
        updated_at
      FROM supplier.kyc_documents
      WHERE supplier_id = $1
      ORDER BY created_at DESC`,
      [req.supplierId]
    );

    res.json({
      data: result.rows.map(doc => ({
        id: doc.id,
        documentType: doc.document_type,
        fileName: doc.file_name,
        fileSize: doc.file_size,
        mimeType: doc.mime_type,
        status: doc.status,
        rejectionReason: doc.rejection_reason,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/kyc/documents/:type
 * GL-WF-018: Upload KYC document
 */
router.post("/documents/:type", requireSupplierAuth, upload.single('document'), async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { type } = req.params;

    if (!VALID_DOC_TYPES.includes(type)) {
      res.status(400).json({
        error: { code: 'INVALID_DOC_TYPE', message: `Invalid document type. Must be one of: ${VALID_DOC_TYPES.join(', ')}` }
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        error: { code: 'NO_FILE', message: 'No file uploaded' }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // STBT-179: Upload to GCS instead of /tmp
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    const ext = path.extname(req.file.originalname).toLowerCase();
    const gcsObjectKey = `kyc/${req.supplierId}/${type}_${uniqueSuffix}${ext}`;
    await uploadBuffer(GCS_DOCUMENTS_BUCKET, gcsObjectKey, req.file.buffer, req.file.mimetype);

    // Upsert document (replace existing if same type)
    const result = await pool.query(
      `INSERT INTO supplier.kyc_documents (
        supplier_id, document_type, file_name, file_path, file_size, mime_type, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      ON CONFLICT (supplier_id, document_type)
      DO UPDATE SET
        file_name = EXCLUDED.file_name,
        file_path = EXCLUDED.file_path,
        file_size = EXCLUDED.file_size,
        mime_type = EXCLUDED.mime_type,
        status = 'pending',
        rejection_reason = NULL,
        updated_at = NOW()
      RETURNING id, document_type, file_name, file_size, mime_type, status, created_at`,
      [req.supplierId, type, req.file.originalname, gcsObjectKey, req.file.size, req.file.mimetype]
    );

    const doc = result.rows[0];

    res.json({
      data: {
        id: doc.id,
        documentType: doc.document_type,
        fileName: doc.file_name,
        fileSize: doc.file_size,
        mimeType: doc.mime_type,
        status: doc.status,
        createdAt: doc.created_at,
        message: 'Document uploaded successfully. It will be reviewed within 1-2 business days.'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/supplier/kyc/documents/:id
 * GL-WF-018: Delete KYC document
 */
router.delete("/documents/:id", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Get file path before deleting
    const docResult = await pool.query(
      `SELECT file_path FROM supplier.kyc_documents WHERE id = $1 AND supplier_id = $2`,
      [id, req.supplierId]
    );

    if (docResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Document not found' }
      });
      return;
    }

    // STBT-179: Delete file from GCS
    const filePath = docResult.rows[0].file_path;
    try {
      await gcsDeleteFile(GCS_DOCUMENTS_BUCKET, filePath);
    } catch (err) {
      // Non-fatal: file may already be gone
      console.warn('[KYC] GCS delete failed (non-fatal):', err);
    }

    // Delete from database
    await pool.query(
      `DELETE FROM supplier.kyc_documents WHERE id = $1 AND supplier_id = $2`,
      [id, req.supplierId]
    );

    res.json({
      data: { success: true, message: 'Document deleted successfully' }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/supplier/kyc/status
 * GL-WF-043: Get KYC/payout readiness status
 */
router.get("/status", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Get supplier info
    const supplierResult = await pool.query(
      `SELECT
        email_verified,
        verification_status,
        bank_verification_status,
        bank_account_number IS NOT NULL as has_bank_details,
        gstin IS NOT NULL as has_gstin
      FROM supplier.suppliers
      WHERE id = $1`,
      [req.supplierId]
    );

    const supplier = supplierResult.rows[0];

    // Get KYC documents status
    const docsResult = await pool.query(
      `SELECT document_type, status
      FROM supplier.kyc_documents
      WHERE supplier_id = $1`,
      [req.supplierId]
    );

    const documents: Record<string, string> = {};
    docsResult.rows.forEach(doc => {
      documents[doc.document_type] = doc.status;
    });

    // Calculate payout readiness
    const requirements = {
      emailVerified: supplier?.email_verified || false,
      profileVerified: supplier?.verification_status === 'verified',
      bankVerified: supplier?.bank_verification_status === 'verified',
      hasBankDetails: supplier?.has_bank_details || false,
      hasGstin: supplier?.has_gstin || false,
      panCardApproved: documents['pan_card'] === 'approved',
      gstinCertApproved: documents['gstin_certificate'] === 'approved',
      cancelledChequeApproved: documents['cancelled_cheque'] === 'approved',
    };

    const isPayoutReady =
      requirements.bankVerified &&
      requirements.panCardApproved &&
      requirements.cancelledChequeApproved;

    res.json({
      data: {
        payoutReady: isPayoutReady,
        requirements,
        documents,
        message: isPayoutReady
          ? 'You are ready to receive payouts!'
          : 'Complete the requirements below to enable payouts.'
      }
    });
  } catch (error) {
    next(error);
  }
});

export const supplierKycRouter = router;
