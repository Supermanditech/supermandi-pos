/**
 * T-235: GST Compliance Document Flow
 *
 * Endpoints:
 * - GET  /admin/gst/summary/:storeId       Generate/fetch GST summary for a month
 * - GET  /admin/gst/summary/:storeId/export Export GSTR-1 data as JSON
 * - GET  /admin/gst/stores-overview         Cross-store GST analytics
 * - POST /admin/gst/archive-invoices        Archive invoices to GCS
 */

import { Router, Request, Response } from 'express';
import { requireAdminToken, requirePermission } from '../../../middleware/adminToken';
import { getPool } from '../../../db/client';
import { log } from "../../../lib/logger";

export const adminGstComplianceRouter = Router();

adminGstComplianceRouter.use(requireAdminToken);

// GET /admin/gst/summary/:storeId — Generate/fetch GST monthly summary
adminGstComplianceRouter.get(
  '/gst/summary/:storeId',
  requirePermission('stores', 'read'),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });

    const { storeId } = req.params;
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    if (month < 1 || month > 12 || year < 2024) {
      return res.status(400).json({ error: 'Invalid month/year' });
    }

    try {
      // Check if we have a cached report
      const cached = await pool.query(
        `SELECT * FROM invoicing.gst_summary_reports
         WHERE store_id = $1 AND report_month = $2 AND report_year = $3`,
        [storeId, month, year]
      );

      if (cached.rows.length > 0 && req.query.refresh !== 'true') {
        const r = cached.rows[0];
        return res.json({
          success: true,
          data: formatGstSummary(r),
          cached: true,
        });
      }

      // Generate fresh summary from invoice data
      const invoiceData = await pool.query(`
        SELECT
          COUNT(*)::int AS total_invoices,
          COALESCE(SUM(taxable_amount), 0)::bigint AS total_taxable,
          COALESCE(SUM(cgst_amount), 0)::bigint AS cgst_collected,
          COALESCE(SUM(sgst_amount), 0)::bigint AS sgst_collected,
          COALESCE(SUM(igst_amount), 0)::bigint AS igst_collected,
          COALESCE(SUM(cess_amount), 0)::bigint AS cess_collected,
          COALESCE(SUM(cgst_amount + sgst_amount + igst_amount + COALESCE(cess_amount, 0)), 0)::bigint AS total_tax,
          COALESCE(SUM(total_amount), 0)::bigint AS total_invoice_amount
        FROM invoicing.invoices
        WHERE store_id = $1
          AND EXTRACT(MONTH FROM invoice_date) = $2
          AND EXTRACT(YEAR FROM invoice_date) = $3
          AND status != 'cancelled'
      `, [storeId, month, year]);

      const inv = invoiceData.rows[0];

      // State-wise breakdown
      const stateBreakdown = await pool.query(`
        SELECT
          COALESCE(buyer_state, seller_state, 'Unknown') AS state,
          COUNT(*)::int AS invoices,
          COALESCE(SUM(taxable_amount), 0)::bigint AS taxable,
          COALESCE(SUM(cgst_amount), 0)::bigint AS cgst,
          COALESCE(SUM(sgst_amount), 0)::bigint AS sgst,
          COALESCE(SUM(igst_amount), 0)::bigint AS igst
        FROM invoicing.invoices
        WHERE store_id = $1
          AND EXTRACT(MONTH FROM invoice_date) = $2
          AND EXTRACT(YEAR FROM invoice_date) = $3
          AND status != 'cancelled'
        GROUP BY COALESCE(buyer_state, seller_state, 'Unknown')
        ORDER BY taxable DESC
      `, [storeId, month, year]);

      // Supplier-wise breakdown
      const supplierBreakdown = await pool.query(`
        SELECT
          i.supplier_id,
          COALESCE(sp.business_name, sp.primary_contact_name, 'Unknown') AS supplier_name,
          COUNT(*)::int AS invoices,
          COALESCE(SUM(i.taxable_amount), 0)::bigint AS taxable,
          COALESCE(SUM(i.cgst_amount + i.sgst_amount + i.igst_amount), 0)::bigint AS tax
        FROM invoicing.invoices i
        LEFT JOIN supplier.suppliers sp ON sp.id = i.supplier_id
        WHERE i.store_id = $1
          AND EXTRACT(MONTH FROM i.invoice_date) = $2
          AND EXTRACT(YEAR FROM i.invoice_date) = $3
          AND i.status != 'cancelled'
          AND i.supplier_id IS NOT NULL
        GROUP BY i.supplier_id, sp.business_name, sp.primary_contact_name
        ORDER BY taxable DESC
      `, [storeId, month, year]);

      // Upsert the summary
      const upsertResult = await pool.query(`
        INSERT INTO invoicing.gst_summary_reports
          (store_id, report_month, report_year, total_invoices, total_taxable_amount,
           cgst_collected, sgst_collected, igst_collected, cess_collected,
           total_tax_collected, total_invoice_amount, state_breakdown, supplier_breakdown)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (store_id, report_month, report_year) DO UPDATE SET
          total_invoices = EXCLUDED.total_invoices,
          total_taxable_amount = EXCLUDED.total_taxable_amount,
          cgst_collected = EXCLUDED.cgst_collected,
          sgst_collected = EXCLUDED.sgst_collected,
          igst_collected = EXCLUDED.igst_collected,
          cess_collected = EXCLUDED.cess_collected,
          total_tax_collected = EXCLUDED.total_tax_collected,
          total_invoice_amount = EXCLUDED.total_invoice_amount,
          state_breakdown = EXCLUDED.state_breakdown,
          supplier_breakdown = EXCLUDED.supplier_breakdown,
          generated_at = NOW()
        RETURNING *
      `, [
        storeId, month, year,
        inv.total_invoices, inv.total_taxable,
        inv.cgst_collected, inv.sgst_collected, inv.igst_collected, inv.cess_collected,
        inv.total_tax, inv.total_invoice_amount,
        JSON.stringify(stateBreakdown.rows),
        JSON.stringify(supplierBreakdown.rows),
      ]);

      return res.json({
        success: true,
        data: formatGstSummary(upsertResult.rows[0]),
        cached: false,
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42P01') {
        return res.json({ success: true, data: null, message: 'GST tables not yet created' });
      }
      log.error('[T-235] GST summary error:', err);
      return res.status(500).json({ error: 'Failed to generate GST summary' });
    }
  }
);

// GET /admin/gst/summary/:storeId/export — Export GSTR-1 format
adminGstComplianceRouter.get(
  '/gst/summary/:storeId/export',
  requirePermission('stores', 'read'),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });

    const { storeId } = req.params;
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    try {
      // Get all invoices for the period with full details
      const invoices = await pool.query(`
        SELECT
          i.invoice_number, i.invoice_date, i.invoice_type,
          i.buyer_name, i.buyer_gstin, i.buyer_state,
          i.seller_name, i.seller_gstin, i.seller_state,
          i.taxable_amount, i.cgst_amount, i.sgst_amount, i.igst_amount,
          i.cess_amount, i.total_amount,
          i.hsn_summary
        FROM invoicing.invoices i
        WHERE i.store_id = $1
          AND EXTRACT(MONTH FROM i.invoice_date) = $2
          AND EXTRACT(YEAR FROM i.invoice_date) = $3
          AND i.status != 'cancelled'
        ORDER BY i.invoice_date, i.invoice_number
      `, [storeId, month, year]);

      // GSTR-1 format structure
      const gstr1Export = {
        gstin: process.env.SUPERMANDI_GSTIN || '',
        fp: `${String(month).padStart(2, '0')}${year}`,
        version: 'GST3.0.4',
        hash: 'hash',
        // B2B invoices (to registered dealers)
        b2b: invoices.rows
          .filter((inv) => inv.buyer_gstin)
          .map((inv) => ({
            ctin: inv.buyer_gstin,
            inv: [{
              inum: inv.invoice_number,
              idt: formatDateDDMMYYYY(inv.invoice_date),
              val: (inv.total_amount / 100).toFixed(2),
              pos: getStateCode(inv.buyer_state),
              rchrg: 'N',
              inv_typ: 'R',
              itms: [{
                num: 1,
                itm_det: {
                  txval: (inv.taxable_amount / 100).toFixed(2),
                  camt: (inv.cgst_amount / 100).toFixed(2),
                  samt: (inv.sgst_amount / 100).toFixed(2),
                  iamt: (inv.igst_amount / 100).toFixed(2),
                  csamt: ((inv.cess_amount || 0) / 100).toFixed(2),
                },
              }],
            }],
          })),
        // B2CS (to unregistered consumers, state-wise summary)
        b2cs: invoices.rows
          .filter((inv) => !inv.buyer_gstin)
          .reduce((acc: Array<{ sply_ty: string; pos: string; txval: string; camt: string; samt: string; iamt: string; csamt: string }>, inv) => {
            const state = inv.buyer_state || inv.seller_state || 'Unknown';
            let entry = acc.find((e) => e.pos === getStateCode(state));
            if (!entry) {
              entry = { sply_ty: 'INTRA', pos: getStateCode(state), txval: '0', camt: '0', samt: '0', iamt: '0', csamt: '0' };
              acc.push(entry);
            }
            // LIVE.R4.D9.001: NaN guard on float accumulation
            entry.txval = ((parseFloat(entry.txval) || 0) + (inv.taxable_amount || 0) / 100).toFixed(2);
            entry.camt = ((parseFloat(entry.camt) || 0) + (inv.cgst_amount || 0) / 100).toFixed(2);
            entry.samt = ((parseFloat(entry.samt) || 0) + (inv.sgst_amount || 0) / 100).toFixed(2);
            entry.iamt = ((parseFloat(entry.iamt) || 0) + (inv.igst_amount || 0) / 100).toFixed(2);
            entry.csamt = ((parseFloat(entry.csamt) || 0) + (inv.cess_amount || 0) / 100).toFixed(2);
            return acc;
          }, []),
        // HSN Summary
        hsn: {
          data: invoices.rows
            .flatMap((inv) => {
              try {
                return Array.isArray(inv.hsn_summary) ? inv.hsn_summary : JSON.parse(inv.hsn_summary || '[]');
              } catch { return []; }
            }),
        },
      };

      // Set headers for JSON download
      res.setHeader('Content-Type', 'application/json');
      // LIVE.BE.DOCUMENTS.CONTENT_DISPOSITION_SANITIZATION.001: Quote filename and sanitize
      res.setHeader('Content-Disposition', `attachment; filename="GSTR1_${String(gstr1Export.fp).replace(/[/\\<>"'\r\n\t]/g, '_')}_${storeId.slice(0, 8)}.json"`);

      return res.json(gstr1Export);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42P01') {
        return res.json({ error: 'Invoice tables not yet created' });
      }
      log.error('[T-235] GSTR-1 export error:', err);
      return res.status(500).json({ error: 'Failed to export GSTR-1 data' });
    }
  }
);

// GET /admin/gst/stores-overview — Cross-store GST analytics
adminGstComplianceRouter.get(
  '/gst/stores-overview',
  requirePermission('stores', 'read'),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });

    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    try {
      const result = await pool.query(`
        SELECT
          g.store_id,
          s.name AS store_name,
          s.store_code,
          g.total_invoices,
          g.total_taxable_amount,
          g.cgst_collected,
          g.sgst_collected,
          g.igst_collected,
          g.total_tax_collected,
          g.total_invoice_amount,
          g.generated_at
        FROM invoicing.gst_summary_reports g
        LEFT JOIN platform.stores s ON s.id = g.store_id
        WHERE g.report_month = $1 AND g.report_year = $2
        ORDER BY g.total_tax_collected DESC
      `, [month, year]);

      // Totals
      // LIVE.R4.D10.001: NaN guards on tax amount parseInt
      const toInt = (v: unknown) => parseInt(String(v || '0'), 10) || 0;
      const totals = result.rows.reduce((acc, r) => ({
        totalInvoices: acc.totalInvoices + r.total_invoices,
        totalTaxable: acc.totalTaxable + toInt(r.total_taxable_amount),
        totalCgst: acc.totalCgst + toInt(r.cgst_collected),
        totalSgst: acc.totalSgst + toInt(r.sgst_collected),
        totalIgst: acc.totalIgst + toInt(r.igst_collected),
        totalTax: acc.totalTax + toInt(r.total_tax_collected),
        totalAmount: acc.totalAmount + toInt(r.total_invoice_amount),
      }), { totalInvoices: 0, totalTaxable: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, totalTax: 0, totalAmount: 0 });

      return res.json({
        success: true,
        period: { month, year },
        totals,
        stores: result.rows.map((r) => ({
          storeId: r.store_id,
          storeName: r.store_name,
          storeCode: r.store_code,
          totalInvoices: r.total_invoices,
          totalTaxable: toInt(r.total_taxable_amount),
          cgst: toInt(r.cgst_collected),
          sgst: toInt(r.sgst_collected),
          igst: toInt(r.igst_collected),
          totalTax: toInt(r.total_tax_collected),
          totalAmount: toInt(r.total_invoice_amount),
          generatedAt: r.generated_at,
        })),
        // Compliance calendar
        filingDeadline: new Date(year, month, 11).toISOString().split('T')[0],  // GSTR-1 due by 11th of next month
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42P01') {
        return res.json({ success: true, period: { month, year }, totals: {}, stores: [] });
      }
      log.error('[T-235] GST stores overview error:', err);
      return res.status(500).json({ error: 'Failed to fetch GST overview' });
    }
  }
);

// =============================================================================
// HELPERS
// =============================================================================

function formatGstSummary(r: Record<string, unknown>) {
  const toInt = (v: unknown) => parseInt(String(v || '0'), 10) || 0;
  return {
    storeId: r.store_id,
    month: r.report_month,
    year: r.report_year,
    totalInvoices: r.total_invoices,
    totalTaxable: toInt(r.total_taxable_amount),
    cgst: toInt(r.cgst_collected),
    sgst: toInt(r.sgst_collected),
    igst: toInt(r.igst_collected),
    cess: toInt(r.cess_collected),
    totalTax: toInt(r.total_tax_collected),
    totalAmount: toInt(r.total_invoice_amount),
    stateBreakdown: r.state_breakdown,
    supplierBreakdown: r.supplier_breakdown,
    generatedAt: r.generated_at,
  };
}

function formatDateDDMMYYYY(date: string | Date): string {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

// Indian state code mapping for GSTR-1
const STATE_CODES: Record<string, string> = {
  'Andhra Pradesh': '37', 'Arunachal Pradesh': '12', 'Assam': '18', 'Bihar': '10',
  'Chhattisgarh': '22', 'Goa': '30', 'Gujarat': '24', 'Haryana': '06',
  'Himachal Pradesh': '02', 'Jharkhand': '20', 'Karnataka': '29', 'Kerala': '32',
  'Madhya Pradesh': '23', 'Maharashtra': '27', 'Manipur': '14', 'Meghalaya': '17',
  'Mizoram': '15', 'Nagaland': '13', 'Odisha': '21', 'Punjab': '03',
  'Rajasthan': '08', 'Sikkim': '11', 'Tamil Nadu': '33', 'Telangana': '36',
  'Tripura': '16', 'Uttar Pradesh': '09', 'Uttarakhand': '05', 'West Bengal': '19',
  'Delhi': '07', 'Jammu and Kashmir': '01', 'Ladakh': '38',
  'Andaman and Nicobar': '35', 'Chandigarh': '04', 'Dadra and Nagar Haveli': '26',
  'Daman and Diu': '25', 'Lakshadweep': '31', 'Puducherry': '34',
};

function getStateCode(state: string | null): string {
  if (!state) return '00';
  return STATE_CODES[state] || '00';
}
