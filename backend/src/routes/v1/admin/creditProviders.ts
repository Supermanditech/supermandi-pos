// T-281: Provider Health Monitoring (SuperAdmin)
// T-290: Provider Management (enable/disable, config)
// T-277: Credit summary endpoint for retailer dashboard (reused by admin)

import { Router, Request, Response } from 'express';
import { getPool } from '../../../db/client';
import { creditRegistry } from '../../../services/credit/CreditProviderRegistry';

export const adminCreditProvidersRouter = Router();

/**
 * T-281: GET /api/v1/admin/credit-providers/health
 * Health check all registered providers
 */
adminCreditProvidersRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await creditRegistry.healthCheckAll();
    res.json({ success: true, providers: health });
  } catch (err: any) {
    console.error('[T-281] Health check error:', err.message);
    res.status(500).json({ error: { code: 'HEALTH_ERROR', message: 'Failed to check provider health' } });
  }
});

/**
 * T-290: GET /api/v1/admin/credit-providers
 * List all provider configurations
 */
adminCreditProvidersRouter.get('/', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  try {
    const result = await pool.query(
      `SELECT * FROM payments.credit_provider_configs ORDER BY priority ASC`
    );
    res.json({ success: true, providers: result.rows });
  } catch (err: any) {
    console.error('[T-290] List providers error:', err.message);
    res.status(500).json({ error: { code: 'QUERY_ERROR' } });
  }
});

/**
 * T-290: PATCH /api/v1/admin/credit-providers/:providerId
 * Update provider config (enable/disable, priority, limits)
 */
adminCreditProvidersRouter.patch('/:providerId', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const { providerId } = req.params;
  const { is_active, priority, min_amount_minor, max_amount_minor, config } = req.body;

  try {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (typeof is_active === 'boolean') {
      setClauses.push(`is_active = $${idx++}`);
      params.push(is_active);
    }
    if (typeof priority === 'number') {
      setClauses.push(`priority = $${idx++}`);
      params.push(priority);
    }
    if (typeof min_amount_minor === 'number') {
      setClauses.push(`min_amount_minor = $${idx++}`);
      params.push(min_amount_minor);
    }
    if (typeof max_amount_minor === 'number') {
      setClauses.push(`max_amount_minor = $${idx++}`);
      params.push(max_amount_minor);
    }
    if (config && typeof config === 'object') {
      setClauses.push(`config = config || $${idx++}::jsonb`);
      params.push(JSON.stringify(config));
    }

    if (params.length === 0) {
      res.status(400).json({ error: { code: 'NO_FIELDS', message: 'No fields to update' } });
      return;
    }

    params.push(providerId);
    const result = await pool.query(
      `UPDATE payments.credit_provider_configs SET ${setClauses.join(', ')} WHERE provider_id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found' } });
      return;
    }

    res.json({ success: true, provider: result.rows[0] });
  } catch (err: any) {
    console.error('[T-290] Update provider error:', err.message);
    res.status(500).json({ error: { code: 'UPDATE_ERROR' } });
  }
});

/**
 * T-290: POST /api/v1/admin/credit-providers
 * Register a new provider config
 */
adminCreditProvidersRouter.post('/', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const { provider_id, provider_name, mode, is_active, priority, config, kyc_fields, min_amount_minor, max_amount_minor } = req.body;

  if (!provider_id || !provider_name || !mode) {
    res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'provider_id, provider_name, mode required' } });
    return;
  }

  const validModes = ['trade_credit', 'credit_line', 'invoice_discounting', 'laas'];
  if (!validModes.includes(mode)) {
    res.status(400).json({ error: { code: 'INVALID_MODE', message: `mode must be one of: ${validModes.join(', ')}` } });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO payments.credit_provider_configs
        (provider_id, provider_name, mode, is_active, priority, config, kyc_fields, min_amount_minor, max_amount_minor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (provider_id) DO UPDATE SET
         provider_name = EXCLUDED.provider_name,
         mode = EXCLUDED.mode,
         is_active = EXCLUDED.is_active,
         priority = EXCLUDED.priority,
         config = EXCLUDED.config,
         kyc_fields = EXCLUDED.kyc_fields,
         updated_at = NOW()
       RETURNING *`,
      [
        provider_id,
        provider_name,
        mode,
        is_active ?? false,
        priority ?? 100,
        JSON.stringify(config || {}),
        kyc_fields || ['pan'],
        min_amount_minor ?? 100000,
        max_amount_minor ?? 50000000,
      ]
    );

    res.json({ success: true, provider: result.rows[0] });
  } catch (err: any) {
    console.error('[T-290] Register provider error:', err.message);
    res.status(500).json({ error: { code: 'INSERT_ERROR' } });
  }
});

/**
 * T-289: GET /api/v1/admin/credit-providers/dashboard
 * Finance monitoring dashboard — aggregate stats across all providers
 */
adminCreditProvidersRouter.get('/dashboard', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  try {
    // Aggregate stats from drawdowns
    const statsResult = await pool.query(
      `SELECT
         COALESCE(provider_id, 'supermandi_internal') AS provider_id,
         COUNT(*) AS total_drawdowns,
         COUNT(CASE WHEN status = 'active' THEN 1 END) AS active,
         COUNT(CASE WHEN status = 'overdue' THEN 1 END) AS overdue,
         COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid,
         COUNT(CASE WHEN status = 'defaulted' THEN 1 END) AS defaulted,
         COALESCE(SUM(principal_minor), 0) AS total_disbursed_minor,
         COALESCE(SUM(CASE WHEN status IN ('active','overdue','partial') THEN principal_minor - COALESCE(paid_amount_minor,0) ELSE 0 END), 0) AS outstanding_minor,
         COALESCE(SUM(COALESCE(paid_amount_minor, 0)), 0) AS total_repaid_minor
       FROM payments.bnpl_drawdowns
       GROUP BY provider_id`
    );

    // Credit applications by status
    const appStats = await pool.query(
      `SELECT status, COUNT(*) AS count
       FROM payments.credit_applications
       GROUP BY status`
    );

    // KYC stats
    const kycStats = await pool.query(
      `SELECT verification_status, COUNT(*) AS count
       FROM payments.kyc_documents
       GROUP BY verification_status`
    );

    res.json({
      success: true,
      providerStats: statsResult.rows,
      applicationStats: appStats.rows,
      kycStats: kycStats.rows,
    });
  } catch (err: any) {
    console.error('[T-289] Dashboard error:', err.message);
    res.status(500).json({ error: { code: 'QUERY_ERROR' } });
  }
});
