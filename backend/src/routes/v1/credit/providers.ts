// T-263: Credit Provider API routes
// T-274: Aggregated offers endpoint (for POS provider selection)
// T-275: Repayment schedule endpoints
// T-276: KYC document endpoints
// T-278: Settlement reconciliation endpoints

import { Router, Request, Response } from 'express';
import { getPool } from '../../../db/client';
import { getStoreId, requireStoreContext } from '../../../middleware/retailerStoreContext';
import { creditRegistry } from '../../../services/credit/CreditProviderRegistry';
import {
  upsertKycDocument,
  getStoreKycDocuments,
  checkKycReadiness,
  validatePan,
  validateGstin,
  type KycDocumentType,
} from '../../../services/credit/kycRouter';

export const creditProvidersRouter = Router();
creditProvidersRouter.use(requireStoreContext);

/**
 * T-274: GET /api/v1/credit/offers
 * Aggregated credit offers from ALL active providers for the current store
 * Sorted by total cost (cheapest first)
 */
creditProvidersRouter.get('/offers', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const storeId = getStoreId(req);
  if (!storeId) { res.status(400).json({ error: { code: 'NO_STORE' } }); return; }

  try {
    const offers = await creditRegistry.getAllOffers(storeId);
    const balance = await creditRegistry.getAggregatedBalance(storeId);

    res.json({
      success: true,
      offers,
      balance: {
        totalCreditLimitMinor: balance.totalCreditLimitMinor,
        usedMinor: balance.usedMinor,
        availableMinor: balance.availableMinor,
        activeDrawdowns: balance.activeDrawdowns,
        overdueDrawdowns: balance.overdueDrawdowns,
      },
      providerCount: offers.length > 0 ? new Set(offers.map(o => o.providerId)).size : 0,
    });
  } catch (err: any) {
    console.error('[T-274] Error fetching offers:', err.message);
    res.status(500).json({ error: { code: 'QUERY_ERROR', message: 'Failed to load credit offers' } });
  }
});

/**
 * T-263: GET /api/v1/credit/eligibility
 * Check eligibility across all providers
 */
creditProvidersRouter.get('/eligibility', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const storeId = getStoreId(req);
  if (!storeId) { res.status(400).json({ error: { code: 'NO_STORE' } }); return; }

  try {
    const results = await creditRegistry.checkAllEligibility(storeId);
    res.json({ success: true, providers: results });
  } catch (err: any) {
    console.error('[T-263] Eligibility check error:', err.message);
    res.status(500).json({ error: { code: 'QUERY_ERROR', message: 'Failed to check eligibility' } });
  }
});

/**
 * T-263: POST /api/v1/credit/drawdown
 * Create a drawdown from a specific provider
 */
creditProvidersRouter.post('/drawdown', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const storeId = getStoreId(req);
  if (!storeId) { res.status(400).json({ error: { code: 'NO_STORE' } }); return; }

  const { providerId, amountMinor, tenureDays, supplierId, purchaseOrderId, offerId } = req.body;
  if (!providerId || !amountMinor || !tenureDays) {
    res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'providerId, amountMinor, tenureDays required' } });
    return;
  }

  const provider = creditRegistry.get(providerId);
  if (!provider) {
    res.status(404).json({ error: { code: 'PROVIDER_NOT_FOUND', message: `Provider ${providerId} not registered` } });
    return;
  }

  try {
    const result = await provider.createDrawdown({
      storeId,
      supplierId,
      purchaseOrderId,
      offerId,
      amountMinor: parseInt(amountMinor, 10),
      tenureDays: parseInt(tenureDays, 10),
    });

    if (!result.success) {
      res.status(422).json({ error: { code: 'DRAWDOWN_REJECTED', message: result.message } });
      return;
    }

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[T-263] Drawdown error:', err.message);
    res.status(500).json({ error: { code: 'DRAWDOWN_ERROR', message: 'Failed to create drawdown' } });
  }
});

/**
 * T-275: GET /api/v1/credit/repayment-schedule/:drawdownId
 * Get repayment schedule for a drawdown
 */
creditProvidersRouter.get('/repayment-schedule/:drawdownId', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const storeId = getStoreId(req);
  if (!storeId) { res.status(400).json({ error: { code: 'NO_STORE' } }); return; }

  const { drawdownId } = req.params;

  try {
    // Get provider_id from drawdown
    const ddResult = await pool.query(
      `SELECT provider_id FROM payments.bnpl_drawdowns WHERE id = $1 AND store_id = $2`,
      [drawdownId, storeId]
    );
    if (ddResult.rows.length === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return;
    }

    const providerId = ddResult.rows[0].provider_id || 'supermandi_internal';
    const provider = creditRegistry.get(providerId);
    if (!provider) {
      res.status(404).json({ error: { code: 'PROVIDER_NOT_FOUND' } });
      return;
    }

    const schedule = await provider.getRepaymentSchedule(drawdownId);
    res.json({ success: true, schedule });
  } catch (err: any) {
    console.error('[T-275] Repayment schedule error:', err.message);
    res.status(500).json({ error: { code: 'QUERY_ERROR', message: 'Failed to load repayment schedule' } });
  }
});

/**
 * T-275: GET /api/v1/credit/balance
 * Aggregated balance across all providers
 */
creditProvidersRouter.get('/balance', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const storeId = getStoreId(req);
  if (!storeId) { res.status(400).json({ error: { code: 'NO_STORE' } }); return; }

  try {
    const balance = await creditRegistry.getAggregatedBalance(storeId);
    res.json({ success: true, ...balance });
  } catch (err: any) {
    console.error('[T-275] Balance error:', err.message);
    res.status(500).json({ error: { code: 'QUERY_ERROR', message: 'Failed to load balance' } });
  }
});

/**
 * T-276: GET /api/v1/credit/kyc
 * Get all KYC documents for the current store
 */
creditProvidersRouter.get('/kyc', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const storeId = getStoreId(req);
  if (!storeId) { res.status(400).json({ error: { code: 'NO_STORE' } }); return; }

  try {
    const docs = await getStoreKycDocuments(pool, storeId);

    // Check readiness for each active provider
    const activeProviders = await creditRegistry.getActiveProviders();
    const providerReadiness: { providerId: string; ready: boolean; missing: string[] }[] = [];

    for (const config of activeProviders) {
      // Get required KYC from provider config
      const configResult = await pool.query(
        `SELECT kyc_fields FROM payments.credit_provider_configs WHERE provider_id = $1`,
        [config.providerId]
      );
      const kycFields = (configResult.rows[0]?.kyc_fields || ['pan']) as KycDocumentType[];
      const readiness = await checkKycReadiness(pool, storeId, kycFields);
      providerReadiness.push({ providerId: config.providerId, ready: readiness.ready, missing: readiness.missing });
    }

    res.json({ success: true, documents: docs, providerReadiness });
  } catch (err: any) {
    console.error('[T-276] KYC fetch error:', err.message);
    res.status(500).json({ error: { code: 'QUERY_ERROR', message: 'Failed to load KYC documents' } });
  }
});

/**
 * T-276: POST /api/v1/credit/kyc
 * Submit a KYC document
 */
creditProvidersRouter.post('/kyc', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const storeId = getStoreId(req);
  if (!storeId) { res.status(400).json({ error: { code: 'NO_STORE' } }); return; }

  const { documentType, documentNumber } = req.body;
  const validTypes: KycDocumentType[] = ['pan', 'aadhaar', 'gstin', 'bank_statement', 'gst_returns', 'itr', 'business_proof'];
  if (!documentType || !validTypes.includes(documentType)) {
    res.status(400).json({ error: { code: 'INVALID_TYPE', message: `documentType must be one of: ${validTypes.join(', ')}` } });
    return;
  }

  // Validate document number format
  if (documentType === 'pan' && documentNumber && !validatePan(documentNumber)) {
    res.status(400).json({ error: { code: 'INVALID_PAN', message: 'PAN must be format ABCDE1234F' } });
    return;
  }
  if (documentType === 'gstin' && documentNumber && !validateGstin(documentNumber)) {
    res.status(400).json({ error: { code: 'INVALID_GSTIN', message: 'Invalid GSTIN format' } });
    return;
  }

  try {
    const doc = await upsertKycDocument(pool, storeId, documentType, documentNumber || null);
    res.json({ success: true, document: doc });
  } catch (err: any) {
    console.error('[T-276] KYC submit error:', err.message);
    res.status(500).json({ error: { code: 'SUBMIT_ERROR', message: 'Failed to submit KYC document' } });
  }
});

/**
 * T-278: GET /api/v1/credit/settlements
 * Get settlement reconciliation for the store
 */
creditProvidersRouter.get('/settlements', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const storeId = getStoreId(req);
  if (!storeId) { res.status(400).json({ error: { code: 'NO_STORE' } }); return; }

  const providerId = typeof req.query.provider === 'string' ? req.query.provider : null;
  const limit = Math.min(parseInt(String(req.query.limit || '50'), 10), 100);
  const offset = parseInt(String(req.query.offset || '0'), 10);

  try {
    const params: (string | number)[] = [storeId, limit, offset];
    let providerFilter = '';
    if (providerId) {
      providerFilter = 'AND cs.provider_id = $4';
      params.push(providerId);
    }

    const result = await pool.query(
      `SELECT cs.*, d.principal_minor AS drawdown_amount_minor
       FROM payments.credit_settlements cs
       LEFT JOIN payments.bnpl_drawdowns d ON d.id = cs.drawdown_id
       WHERE cs.store_id = $1 ${providerFilter}
       ORDER BY cs.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM payments.credit_settlements WHERE store_id = $1 ${providerId ? 'AND provider_id = $2' : ''}`,
      providerId ? [storeId, providerId] : [storeId]
    );

    res.json({
      success: true,
      settlements: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (err: any) {
    console.error('[T-278] Settlements error:', err.message);
    res.status(500).json({ error: { code: 'QUERY_ERROR', message: 'Failed to load settlements' } });
  }
});
