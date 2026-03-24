// GCP-STG-0662: Credit/debit note admin CRUD routes
import { Router } from 'express';
import { requireAdminToken } from '../../../middleware/adminToken';
import { generateCreditNote, getCreditNote, listCreditNotes } from '../../../services/creditNoteService';

export const creditNotesRouter = Router();

creditNotesRouter.use(requireAdminToken);

// POST /admin/credit-notes — create a new credit/debit note
creditNotesRouter.post('/credit-notes', async (req, res) => {
  try {
    const { type, referenceInvoiceId, storeId, supplierId, items, reason } = req.body;
    if (!type || !storeId || !items?.length) {
      return res.status(400).json({ error: 'type, storeId, and items required' });
    }
    const note = await generateCreditNote({ type, referenceInvoiceId, storeId, supplierId, items, reason });
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create credit note' });
  }
});

// GET /admin/credit-notes — list with filters
creditNotesRouter.get('/credit-notes', async (req, res) => {
  try {
    const { storeId, type, supplierId, fromDate, toDate, limit, offset } = req.query;
    if (!storeId) return res.status(400).json({ error: 'storeId required' });
    const result = await listCreditNotes({
      storeId: storeId as string,
      type: type as string,
      supplierId: supplierId as string,
      fromDate: fromDate as string,
      toDate: toDate as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list credit notes' });
  }
});

// GET /admin/credit-notes/:id — get single note
creditNotesRouter.get('/credit-notes/:id', async (req, res) => {
  try {
    const storeId = req.query.storeId as string;
    if (!storeId) return res.status(400).json({ error: 'storeId required' });
    const note = await getCreditNote(req.params.id, storeId);
    if (!note) return res.status(404).json({ error: 'Credit note not found' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get credit note' });
  }
});
