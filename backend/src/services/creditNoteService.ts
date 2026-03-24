// GCP-STG-0662: Debit/Credit note generation for GST compliance
// Debit note: issued by buyer (retailer) to supplier when returning goods
// Credit note: issued by supplier to buyer acknowledging the return
//
// GST compliance requires proper debit/credit notes for goods returns.
// This service provides the interface and stub implementation.
// Full implementation requires the goods return flow (GCP-STG-0664).

export interface CreditNoteItem {
  productId: string;
  qty: number;
  amount: number;
  reason: string;
}

export interface CreditNote {
  id: string;
  type: 'DEBIT_NOTE' | 'CREDIT_NOTE';
  referenceInvoiceId: string;
  storeId: string;
  supplierId: string;
  items: CreditNoteItem[];
  totalAmount: number;
  gstAmount: number;
  issueDate: Date;
  status: 'DRAFT' | 'ISSUED' | 'ACKNOWLEDGED';
}

export type CreditNoteCreateParams = Omit<CreditNote, 'id' | 'status' | 'issueDate'>;

/**
 * Generate a debit or credit note for a goods return.
 *
 * @param params - Note details (type, reference invoice, items, amounts)
 * @returns The created CreditNote with generated id, status=DRAFT, and issueDate=now
 * @throws Error — not yet implemented, requires goods return flow (GCP-STG-0664)
 */
export async function generateCreditNote(params: CreditNoteCreateParams): Promise<CreditNote> {
  // GCP-STG-0662: Implementation pending — requires goods return flow (GCP-STG-0664)
  // When implementing:
  // 1. Validate referenceInvoiceId exists and belongs to storeId
  // 2. Validate supplierId matches the invoice supplier
  // 3. Validate items are a subset of original invoice items
  // 4. Calculate GST based on item HSN codes
  // 5. Insert into credit_notes table (migration pending)
  // 6. Return the created note with status=DRAFT
  throw new Error('Credit note generation not yet implemented — requires goods return flow');
}

/**
 * Get a credit/debit note by ID.
 *
 * @param noteId - The note UUID
 * @param storeId - Store ID for isolation
 * @throws Error — not yet implemented
 */
export async function getCreditNote(_noteId: string, _storeId: string): Promise<CreditNote | null> {
  // GCP-STG-0662: Stub — implementation pending
  throw new Error('Credit note retrieval not yet implemented');
}

/**
 * List credit/debit notes for a store.
 *
 * @param storeId - Store ID for isolation
 * @param filters - Optional filters (type, supplierId, date range)
 * @throws Error — not yet implemented
 */
export async function listCreditNotes(
  _storeId: string,
  _filters?: { type?: 'DEBIT_NOTE' | 'CREDIT_NOTE'; supplierId?: string; from?: Date; to?: Date }
): Promise<CreditNote[]> {
  // GCP-STG-0662: Stub — implementation pending
  throw new Error('Credit note listing not yet implemented');
}
