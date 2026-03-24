// GCP-STG-0662: Debit/Credit note generation for GST compliance
// Real implementation backed by invoicing.credit_notes table

import { getPool } from '../db/client';

export interface CreditNoteItem {
  productId: string;
  productName: string;
  qty: number;
  amountMinor: number;
  gstMinor: number;
  reason: string;
}

export interface CreditNote {
  id: string;
  type: 'DEBIT_NOTE' | 'CREDIT_NOTE';
  referenceInvoiceId?: string;
  storeId: string;
  supplierId?: string;
  items: CreditNoteItem[];
  totalAmountMinor: number;
  gstAmountMinor: number;
  reason?: string;
  issueDate: string;
  status: string;
  createdAt: string;
}

export async function generateCreditNote(params: {
  type: 'DEBIT_NOTE' | 'CREDIT_NOTE';
  referenceInvoiceId?: string;
  storeId: string;
  supplierId?: string;
  items: CreditNoteItem[];
  reason?: string;
  createdBy?: string;
}): Promise<CreditNote> {
  const pool = getPool();
  if (!pool) throw new Error('Database unavailable');

  const totalAmountMinor = params.items.reduce((sum, i) => sum + i.amountMinor, 0);
  const gstAmountMinor = params.items.reduce((sum, i) => sum + i.gstMinor, 0);

  const result = await pool.query(
    `INSERT INTO invoicing.credit_notes
     (type, reference_invoice_id, store_id, supplier_id, items, total_amount_minor, gst_amount_minor, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [params.type, params.referenceInvoiceId || null, params.storeId, params.supplierId || null,
     JSON.stringify(params.items), totalAmountMinor, gstAmountMinor, params.reason || null, params.createdBy || null]
  );

  return mapRow(result.rows[0]);
}

export async function getCreditNote(id: string, storeId: string): Promise<CreditNote | null> {
  const pool = getPool();
  if (!pool) throw new Error('Database unavailable');

  const result = await pool.query(
    'SELECT * FROM invoicing.credit_notes WHERE id = $1 AND store_id = $2',
    [id, storeId]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function listCreditNotes(params: {
  storeId: string;
  type?: string;
  supplierId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}): Promise<{ notes: CreditNote[]; total: number }> {
  const pool = getPool();
  if (!pool) throw new Error('Database unavailable');

  const conditions = ['store_id = $1'];
  const values: any[] = [params.storeId];
  let idx = 2;

  if (params.type) { conditions.push(`type = $${idx++}`); values.push(params.type); }
  if (params.supplierId) { conditions.push(`supplier_id = $${idx++}`); values.push(params.supplierId); }
  if (params.fromDate) { conditions.push(`issue_date >= $${idx++}`); values.push(params.fromDate); }
  if (params.toDate) { conditions.push(`issue_date <= $${idx++}`); values.push(params.toDate); }

  const where = conditions.join(' AND ');
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  const [dataResult, countResult] = await Promise.all([
    pool.query(`SELECT * FROM invoicing.credit_notes WHERE ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]),
    pool.query(`SELECT COUNT(*) FROM invoicing.credit_notes WHERE ${where}`, values),
  ]);

  return {
    notes: dataResult.rows.map(mapRow),
    total: parseInt(countResult.rows[0].count, 10),
  };
}

function mapRow(row: any): CreditNote {
  return {
    id: row.id,
    type: row.type,
    referenceInvoiceId: row.reference_invoice_id,
    storeId: row.store_id,
    supplierId: row.supplier_id,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
    totalAmountMinor: parseInt(row.total_amount_minor, 10),
    gstAmountMinor: parseInt(row.gst_amount_minor, 10),
    reason: row.reason,
    issueDate: row.issue_date,
    status: row.status,
    createdAt: row.created_at,
  };
}
