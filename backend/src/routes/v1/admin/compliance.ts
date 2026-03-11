/**
 * SA-P2-004: Compliance Status Aggregation
 *
 * Endpoints:
 * - GET /admin/compliance/overview  Aggregated compliance status across all stores
 */

import { Router, Request, Response } from 'express';
import { requireAdminToken, requirePermission } from '../../../middleware/adminToken';
import { getPool } from '../../../db/client';
import { log } from "../../../lib/logger";

export const adminComplianceRouter = Router();

adminComplianceRouter.use(requireAdminToken);

/**
 * GET /admin/compliance/overview
 * SA-P2-004: Aggregated compliance status across all stores
 *
 * A store is "compliant" when:
 *   - kyc_complete = true
 *   - admin_approved = true
 *
 * A store is "pending" when:
 *   - Not compliant AND not explicitly non-compliant
 *   - e.g. kyc_complete is false but no documents have been rejected
 *
 * A store is "non-compliant" when:
 *   - kyc_status indicates rejection, or status = NEEDS_FIX / SUSPENDED
 */
adminComplianceRouter.get(
  '/compliance/overview',
  requirePermission('stores', 'read'),
  async (_req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });

    try {
      // Aggregate compliance counts
      const statsResult = await pool.query(`
        SELECT
          COUNT(*)::int AS total_stores,
          COUNT(*) FILTER (
            WHERE kyc_complete = true AND admin_approved = true
          )::int AS compliant_count,
          COUNT(*) FILTER (
            WHERE status IN ('NEEDS_FIX', 'SUSPENDED')
              OR (kyc_complete = false AND admin_approved = false AND status NOT IN ('DRAFT'))
          )::int AS non_compliant_count,
          COUNT(*) FILTER (
            WHERE NOT (kyc_complete = true AND admin_approved = true)
              AND status NOT IN ('NEEDS_FIX', 'SUSPENDED')
              AND NOT (kyc_complete = false AND admin_approved = false AND status NOT IN ('DRAFT'))
          )::int AS pending_count
        FROM platform.stores
        WHERE status != 'deleted'
      `);

      const stats = statsResult.rows[0];

      // Per-store breakdown
      const storesResult = await pool.query(`
        SELECT
          s.id::TEXT AS id,
          s.name,
          s.code,
          s.store_code,
          s.status,
          COALESCE(s.kyc_status, 'none') AS kyc_status,
          COALESCE(s.kyc_complete, false) AS kyc_complete,
          COALESCE(s.admin_approved, false) AS admin_approved,
          COALESCE(s.device_bound, false) AS device_bound,
          COALESCE(s.upi_complete, false) AS upi_complete,
          s.created_at,
          s.updated_at,
          -- Document stats per store
          COALESCE(doc_stats.total_docs, 0)::int AS total_documents,
          COALESCE(doc_stats.approved_docs, 0)::int AS approved_documents,
          COALESCE(doc_stats.pending_docs, 0)::int AS pending_documents,
          COALESCE(doc_stats.rejected_docs, 0)::int AS rejected_documents
        FROM platform.stores s
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) AS total_docs,
            COUNT(*) FILTER (WHERE d.status = 'approved') AS approved_docs,
            COUNT(*) FILTER (WHERE d.status = 'pending') AS pending_docs,
            COUNT(*) FILTER (WHERE d.status = 'rejected') AS rejected_docs
          FROM platform.documents d
          WHERE d.entity_type = 'store' AND d.entity_id = s.id AND d.deleted_at IS NULL
        ) doc_stats ON true
        WHERE s.status != 'deleted'
        ORDER BY s.created_at DESC
      `);

      const stores = storesResult.rows.map((row) => {
        // Derive compliance status per store
        let complianceStatus: 'compliant' | 'non_compliant' | 'pending';
        if (row.kyc_complete && row.admin_approved) {
          complianceStatus = 'compliant';
        } else if (
          row.status === 'NEEDS_FIX' ||
          row.status === 'SUSPENDED' ||
          (row.kyc_complete === false && row.admin_approved === false && row.status !== 'DRAFT')
        ) {
          complianceStatus = 'non_compliant';
        } else {
          complianceStatus = 'pending';
        }

        return {
          id: row.id,
          name: row.name,
          code: row.store_code || row.code,
          status: row.status,
          kycStatus: row.kyc_status,
          kycComplete: row.kyc_complete,
          adminApproved: row.admin_approved,
          deviceBound: row.device_bound,
          upiComplete: row.upi_complete,
          complianceStatus,
          documents: {
            total: row.total_documents,
            approved: row.approved_documents,
            pending: row.pending_documents,
            rejected: row.rejected_documents,
          },
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });

      return res.json({
        summary: {
          totalStores: stats.total_stores,
          compliantCount: stats.compliant_count,
          nonCompliantCount: stats.non_compliant_count,
          pendingCount: stats.pending_count,
        },
        stores,
      });
    } catch (err: any) {
      // Fallback: if document stats fail (table may not exist), return without them
      log.error('[SA-P2-004] Compliance overview error:', err?.message);
      try {
        const fallbackStats = await pool.query(`
          SELECT
            COUNT(*)::int AS total_stores,
            COUNT(*) FILTER (WHERE kyc_complete = true AND admin_approved = true)::int AS compliant_count,
            COUNT(*) FILTER (WHERE status IN ('NEEDS_FIX', 'SUSPENDED'))::int AS non_compliant_count
          FROM platform.stores
          WHERE status != 'deleted'
        `);
        const s = fallbackStats.rows[0];
        const fallbackStores = await pool.query(`
          SELECT id::TEXT AS id, name, code, store_code, status,
            COALESCE(kyc_status, 'none') AS kyc_status,
            COALESCE(kyc_complete, false) AS kyc_complete,
            COALESCE(admin_approved, false) AS admin_approved,
            created_at, updated_at
          FROM platform.stores WHERE status != 'deleted'
          ORDER BY created_at DESC
        `);

        return res.json({
          summary: {
            totalStores: s.total_stores,
            compliantCount: s.compliant_count,
            nonCompliantCount: s.non_compliant_count,
            pendingCount: s.total_stores - s.compliant_count - s.non_compliant_count,
          },
          stores: fallbackStores.rows.map((row) => {
            let complianceStatus: 'compliant' | 'non_compliant' | 'pending' = 'pending';
            if (row.kyc_complete && row.admin_approved) complianceStatus = 'compliant';
            else if (row.status === 'NEEDS_FIX' || row.status === 'SUSPENDED') complianceStatus = 'non_compliant';
            return {
              id: row.id,
              name: row.name,
              code: row.store_code || row.code,
              status: row.status,
              kycStatus: row.kyc_status,
              kycComplete: row.kyc_complete,
              adminApproved: row.admin_approved,
              deviceBound: false,
              upiComplete: false,
              complianceStatus,
              documents: { total: 0, approved: 0, pending: 0, rejected: 0 },
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            };
          }),
        });
      } catch (fallbackErr: any) {
        log.error('[SA-P2-004] Compliance overview fallback error:', fallbackErr?.message);
        return res.status(500).json({ error: 'Failed to fetch compliance overview' });
      }
    }
  }
);
