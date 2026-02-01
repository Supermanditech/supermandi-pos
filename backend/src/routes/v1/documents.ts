// DOCS-001: Unified Document Storage Routes
// Provides upload, download, and management for all entity types

import { Router, Request, Response, NextFunction } from "express";
import { getPool } from "../../db/client";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// DOCS-001: Import admin token validation
// Load admin token from secret file or env (same as adminToken middleware)
function loadAdminTokenForValidation(): string | undefined {
  const tokenFilePath = process.env.ADMIN_TOKEN_FILE;
  if (tokenFilePath) {
    try {
      const token = fs.readFileSync(tokenFilePath, 'utf8').trim();
      if (token) return token;
    } catch { /* fall through */ }
  }
  return process.env.ADMIN_TOKEN?.trim();
}
const ADMIN_TOKEN_CACHED = loadAdminTokenForValidation();

// DOCS-001: Check if request has valid admin token
function isValidAdminRequest(req: Request): boolean {
  const token = req.headers['x-admin-token'] as string | undefined;
  if (!token || !ADMIN_TOKEN_CACHED) return false;
  // Use timing-safe comparison
  if (token.length !== ADMIN_TOKEN_CACHED.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ADMIN_TOKEN_CACHED));
}

const router = Router();

// =============================================================================
// CONFIGURATION
// =============================================================================

// Document storage directory - should be mounted as persistent volume
const DOCUMENT_STORAGE_DIR = process.env.DOCUMENT_STORAGE_DIR || '/var/supermandi/documents';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per document

// Valid document types by entity
const VALID_STORE_DOC_TYPES = [
  'aadhaar',
  'pan',
  'gstin',
  'fssai',
  'shop_license',
  'owner_photo',
  'store_photo',
  'cancelled_cheque',
  'address_proof',
];

const VALID_SUPPLIER_DOC_TYPES = [
  'pan_card',
  'gstin_certificate',
  'address_proof',
  'cancelled_cheque',
  'business_license',
];

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
];

// Ensure storage directory exists
if (!fs.existsSync(DOCUMENT_STORAGE_DIR)) {
  fs.mkdirSync(DOCUMENT_STORAGE_DIR, { recursive: true });
}

// =============================================================================
// MULTER CONFIGURATION
// =============================================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const entityType = req.body.entity_type || 'unknown';
    const entityId = req.body.entity_id || 'unknown';
    const entityDir = path.join(DOCUMENT_STORAGE_DIR, entityType, entityId);

    if (!fs.existsSync(entityDir)) {
      fs.mkdirSync(entityDir, { recursive: true });
    }
    cb(null, entityDir);
  },
  filename: (req, file, cb) => {
    const documentType = req.body.document_type || 'document';
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${documentType}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, PDF`));
    }
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get document types for an entity type
 */
function getValidDocTypes(entityType: string): string[] {
  if (entityType === 'store') return VALID_STORE_DOC_TYPES;
  if (entityType === 'supplier') return VALID_SUPPLIER_DOC_TYPES;
  return [];
}

/**
 * Build relative file path from absolute path
 */
function getRelativePath(absolutePath: string): string {
  return path.relative(DOCUMENT_STORAGE_DIR, absolutePath);
}

/**
 * Build absolute file path from relative path
 */
function getAbsolutePath(relativePath: string): string {
  return path.join(DOCUMENT_STORAGE_DIR, relativePath);
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/documents/upload
 * DOCS-001: Upload a document
 *
 * Body (multipart/form-data):
 * - file: The document file
 * - entity_type: 'store' or 'supplier'
 * - entity_id: UUID of the entity
 * - document_type: Type of document (aadhaar, pan, gstin, etc.)
 */
router.post("/upload", upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entity_type, entity_id, document_type } = req.body;

    // Validate required fields
    if (!entity_type || !entity_id || !document_type) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'entity_type, entity_id, and document_type are required',
      });
      return;
    }

    // Validate entity type
    if (!['store', 'supplier'].includes(entity_type)) {
      res.status(400).json({
        error: 'INVALID_ENTITY_TYPE',
        message: 'entity_type must be "store" or "supplier"',
      });
      return;
    }

    // Validate document type
    const validTypes = getValidDocTypes(entity_type);
    if (!validTypes.includes(document_type)) {
      res.status(400).json({
        error: 'INVALID_DOC_TYPE',
        message: `Invalid document type for ${entity_type}. Valid types: ${validTypes.join(', ')}`,
      });
      return;
    }

    // Check file was uploaded
    if (!req.file) {
      res.status(400).json({
        error: 'NO_FILE',
        message: 'No file uploaded',
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    // Verify entity exists
    let entityExists = false;
    if (entity_type === 'store') {
      const storeResult = await pool.query(
        'SELECT id FROM platform.stores WHERE id = $1::uuid AND deleted_at IS NULL',
        [entity_id]
      );
      entityExists = storeResult.rows.length > 0;
    } else if (entity_type === 'supplier') {
      const supplierResult = await pool.query(
        'SELECT id FROM supplier.suppliers WHERE id = $1::uuid',
        [entity_id]
      );
      entityExists = supplierResult.rows.length > 0;
    }

    if (!entityExists) {
      // Clean up uploaded file
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(404).json({
        error: 'ENTITY_NOT_FOUND',
        message: `${entity_type} not found`,
      });
      return;
    }

    // Get relative path for storage
    const relativePath = getRelativePath(req.file.path);

    // Get uploaded_by from auth context
    const uploadedBy = (req as any).userId || (req as any).storeId || (req as any).supplierId || null;

    // Upsert document (replace existing if same type)
    const result = await pool.query(
      `INSERT INTO platform.documents (
        entity_type,
        entity_id,
        document_type,
        file_path,
        file_name,
        file_size,
        content_type,
        status,
        uploaded_by,
        uploaded_at
      ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, 'pending', $8::uuid, NOW())
      ON CONFLICT (entity_type, entity_id, document_type) WHERE deleted_at IS NULL
      DO UPDATE SET
        file_path = EXCLUDED.file_path,
        file_name = EXCLUDED.file_name,
        file_size = EXCLUDED.file_size,
        content_type = EXCLUDED.content_type,
        status = 'pending',
        rejection_reason = NULL,
        verified_by = NULL,
        verified_at = NULL,
        uploaded_by = EXCLUDED.uploaded_by,
        uploaded_at = NOW(),
        updated_at = NOW()
      RETURNING id, entity_type, entity_id, document_type, file_name, file_size, content_type, status, created_at`,
      [
        entity_type,
        entity_id,
        document_type,
        relativePath,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        uploadedBy
      ]
    );

    const doc = result.rows[0];

    // Log the upload action
    await pool.query(
      `INSERT INTO platform.document_audit (document_id, action, new_status, actor_id, actor_type)
       VALUES ($1, 'uploaded', 'pending', $2::uuid, 'user')`,
      [doc.id, uploadedBy]
    );

    res.status(201).json({
      document_id: doc.id,
      entity_type: doc.entity_type,
      entity_id: doc.entity_id,
      document_type: doc.document_type,
      file_name: doc.file_name,
      file_size: doc.file_size,
      content_type: doc.content_type,
      status: doc.status,
      created_at: doc.created_at,
      file_url: `/api/v1/documents/${doc.id}`,
      message: 'Document uploaded successfully. It will be reviewed within 1-2 business days.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/documents/:id
 * DOCS-001: Download/view a document
 *
 * Requires auth - only owner or admin can access
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    // Get document metadata
    const result = await pool.query(
      `SELECT
        id, entity_type, entity_id, document_type, file_path, file_name,
        file_size, content_type, status, deleted_at
      FROM platform.documents
      WHERE id = $1::uuid`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Document not found',
      });
      return;
    }

    const doc = result.rows[0];

    // Check if deleted
    if (doc.deleted_at) {
      res.status(404).json({
        error: 'DELETED',
        message: 'Document has been deleted',
      });
      return;
    }

    // Authorization check - allow owner or admin
    // DOCS-001: Validate admin token properly (timing-safe comparison)
    const isAdmin = isValidAdminRequest(req) || (req as any).actorType === 'ADMIN' || (req as any).isAdmin;
    const requesterId = (req as any).storeId || (req as any).supplierId || (req as any).userId;
    const isOwner = requesterId === doc.entity_id;

    if (!isAdmin && !isOwner) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have access to this document',
      });
      return;
    }

    // Build absolute file path
    const absolutePath = getAbsolutePath(doc.file_path);

    // Check file exists
    if (!fs.existsSync(absolutePath)) {
      res.status(404).json({
        error: 'FILE_NOT_FOUND',
        message: 'Document file not found on storage',
      });
      return;
    }

    // Set headers and stream file
    res.setHeader('Content-Type', doc.content_type);
    res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
    res.setHeader('Content-Length', doc.file_size);

    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/documents/:id/metadata
 * DOCS-001: Get document metadata without downloading
 */
router.get("/:id/metadata", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    const result = await pool.query(
      `SELECT
        id, entity_type, entity_id, document_type, file_name,
        file_size, content_type, status, rejection_reason,
        verified_by, verified_at, uploaded_by, uploaded_at,
        created_at, updated_at, deleted_at
      FROM platform.documents
      WHERE id = $1::uuid`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Document not found',
      });
      return;
    }

    const doc = result.rows[0];

    // Authorization check
    const isAdmin = (req as any).actorType === 'ADMIN' || (req as any).isAdmin;
    const requesterId = (req as any).storeId || (req as any).supplierId || (req as any).userId;
    const isOwner = requesterId === doc.entity_id;

    if (!isAdmin && !isOwner) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have access to this document',
      });
      return;
    }

    res.json({
      id: doc.id,
      entity_type: doc.entity_type,
      entity_id: doc.entity_id,
      document_type: doc.document_type,
      file_name: doc.file_name,
      file_size: doc.file_size,
      content_type: doc.content_type,
      status: doc.status,
      rejection_reason: doc.rejection_reason,
      verified_at: doc.verified_at,
      uploaded_at: doc.uploaded_at,
      created_at: doc.created_at,
      is_deleted: !!doc.deleted_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/documents/:id
 * DOCS-001: Soft delete a document (admin only)
 */
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Admin check
    const isAdmin = (req as any).actorType === 'ADMIN' || (req as any).isAdmin;
    if (!isAdmin) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only administrators can delete documents',
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    const adminId = (req as any).userId || (req as any).adminId;

    // Soft delete
    const result = await pool.query(
      `UPDATE platform.documents
       SET deleted_at = NOW(), deleted_by = $2::uuid, updated_at = NOW()
       WHERE id = $1::uuid AND deleted_at IS NULL
       RETURNING id`,
      [id, adminId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Document not found or already deleted',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/documents/entity/:entityType/:entityId
 * DOCS-001: Get all documents for an entity
 */
router.get("/entity/:entityType/:entityId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entityType, entityId } = req.params;

    if (!['store', 'supplier'].includes(entityType)) {
      res.status(400).json({
        error: 'INVALID_ENTITY_TYPE',
        message: 'entityType must be "store" or "supplier"',
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    // Authorization check
    const isAdmin = (req as any).actorType === 'ADMIN' || (req as any).isAdmin;
    const requesterId = (req as any).storeId || (req as any).supplierId || (req as any).userId;
    const isOwner = requesterId === entityId;

    if (!isAdmin && !isOwner) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have access to these documents',
      });
      return;
    }

    const result = await pool.query(
      `SELECT
        id, document_type, file_name, file_size, content_type,
        status, rejection_reason, uploaded_at, verified_at
      FROM platform.documents
      WHERE entity_type = $1 AND entity_id = $2::uuid AND deleted_at IS NULL
      ORDER BY document_type, uploaded_at DESC`,
      [entityType, entityId]
    );

    res.json({
      entity_type: entityType,
      entity_id: entityId,
      documents: result.rows.map(doc => ({
        id: doc.id,
        document_type: doc.document_type,
        file_name: doc.file_name,
        file_size: doc.file_size,
        content_type: doc.content_type,
        status: doc.status,
        rejection_reason: doc.rejection_reason,
        uploaded_at: doc.uploaded_at,
        verified_at: doc.verified_at,
        file_url: `/api/v1/documents/${doc.id}`,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export const documentsRouter = router;
