// SM-021: Credit Offers + Application API
// Endpoints for viewing credit offers and applying for loans

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, PosDeviceContext } from "../../../middleware/deviceToken";
import { randomUUID } from "crypto";

export const posCreditRouter = Router();

// POS-CREDIT-001: Gate all credit routes behind feature flag.
// Credit feature has mock KYC (format-only validation, no real UIDAI/MCA/GST API).
// Must remain disabled until real KYC integration is ready.
const CREDIT_ENABLED = process.env.CREDIT_ENABLED === "true";

// BUG-001: Scope gate to /credit/* paths only.
// Previously this was a blanket .use() that blocked ALL POS routes
// mounted after posCreditRouter in index.ts (dues, staff, tokens, translations).
posCreditRouter.use("/credit", (_req: Request, res: Response, next) => {
  if (!CREDIT_ENABLED) {
    return res.status(403).json({
      success: false,
      error: "credit_feature_disabled",
      message: "Credit feature is not available. Contact support for more information.",
    });
  }
  next();
});

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

interface CreditScore {
  score: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
  eligibleAmount: number;
  factors: {
    monthlyGmv: number;
    transactionCount: number;
    bnplRepaymentRate: number;
    accountAge: number;
  };
}

/**
 * Calculate credit score based on store's transaction history
 */
async function calculateCreditScore(pool: any, storeId: string): Promise<CreditScore> {
  // Default score for new stores
  const defaultScore: CreditScore = {
    score: "FAIR",
    eligibleAmount: 5000000, // ₹50,000
    factors: {
      monthlyGmv: 0,
      transactionCount: 0,
      bnplRepaymentRate: 100,
      accountAge: 0,
    },
  };

  try {
    // Get sales data for last 90 days
    const salesResult = await pool.query(`
      SELECT
        COALESCE(SUM(total_minor), 0) as total_gmv,
        COUNT(*) as transaction_count
      FROM public.sales
      WHERE store_id = $1
        AND created_at > NOW() - INTERVAL '90 days'
        AND status = 'completed'
    `, [storeId]);

    // Get BNPL repayment history
    const bnplResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE status IN ('overdue', 'defaulted')) as default_count,
        COUNT(*) as total_count
      FROM payments.bnpl_drawdowns
      WHERE store_id = $1
    `, [storeId]);

    // Get store age
    const storeResult = await pool.query(`
      SELECT created_at FROM platform.stores WHERE id = $1
    `, [storeId]);

    const sales = salesResult.rows[0] || {};
    const bnpl = bnplResult.rows[0] || {};
    const store = storeResult.rows[0] || {};

    // ITER3-P0-004: Safe parseInt with NaN check
    const safeParseInt = (val: unknown, def = 0): number => {
      const num = parseInt(String(val || def), 10);
      return Number.isFinite(num) ? num : def;
    };

    const totalGmv = safeParseInt(sales.total_gmv, 0);
    const txnCount = safeParseInt(sales.transaction_count, 0);
    const bnplPaid = safeParseInt(bnpl.paid_count, 0);
    const bnplDefault = safeParseInt(bnpl.default_count, 0);
    const bnplTotal = safeParseInt(bnpl.total_count, 0);

    // Calculate monthly GMV (average over 3 months)
    const monthlyGmv = Math.round(totalGmv / 3);

    // Calculate BNPL repayment rate
    const bnplRepaymentRate = bnplTotal > 0
      ? Math.round((bnplPaid / bnplTotal) * 100)
      : 100; // Perfect score if no BNPL history

    // Calculate account age in months
    const accountAge = store.created_at
      ? Math.floor((Date.now() - new Date(store.created_at).getTime()) / (30 * 24 * 60 * 60 * 1000))
      : 0;

    // Score calculation
    let scorePoints = 0;

    // GMV scoring (0-30 points)
    if (monthlyGmv >= 10000000) scorePoints += 30;      // ₹1L+
    else if (monthlyGmv >= 5000000) scorePoints += 25;  // ₹50k+
    else if (monthlyGmv >= 2000000) scorePoints += 20;  // ₹20k+
    else if (monthlyGmv >= 1000000) scorePoints += 15;  // ₹10k+
    else if (monthlyGmv >= 500000) scorePoints += 10;   // ₹5k+
    else scorePoints += 5;

    // Transaction count scoring (0-20 points)
    if (txnCount >= 500) scorePoints += 20;
    else if (txnCount >= 200) scorePoints += 15;
    else if (txnCount >= 100) scorePoints += 10;
    else if (txnCount >= 50) scorePoints += 5;

    // BNPL repayment rate scoring (0-30 points)
    if (bnplRepaymentRate === 100) scorePoints += 30;
    else if (bnplRepaymentRate >= 90) scorePoints += 20;
    else if (bnplRepaymentRate >= 75) scorePoints += 10;
    else if (bnplDefault > 0) scorePoints -= 20; // Penalty for defaults

    // Account age scoring (0-20 points)
    if (accountAge >= 12) scorePoints += 20;
    else if (accountAge >= 6) scorePoints += 15;
    else if (accountAge >= 3) scorePoints += 10;
    else if (accountAge >= 1) scorePoints += 5;

    // Determine score tier and eligible amount
    let score: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
    let eligibleAmount: number;

    if (scorePoints >= 80) {
      score = "EXCELLENT";
      eligibleAmount = 20000000; // ₹2L
    } else if (scorePoints >= 60) {
      score = "GOOD";
      eligibleAmount = 10000000; // ₹1L
    } else if (scorePoints >= 40) {
      score = "FAIR";
      eligibleAmount = 5000000;  // ₹50k
    } else {
      score = "POOR";
      eligibleAmount = 2500000;  // ₹25k
    }

    return {
      score,
      eligibleAmount,
      factors: {
        monthlyGmv,
        transactionCount: txnCount,
        bnplRepaymentRate,
        accountAge,
      },
    };
  } catch (error: any) {
    console.error("[SM-021] Credit scoring error:", error.message);
    return defaultScore;
  }
}

/**
 * Generate credit offers based on score
 */
function generateOffers(storeId: string, creditScore: CreditScore): Array<{
  id: string;
  source: string;
  amountMinor: number;
  tenureMonths: number;
  interestRateAnnual: number;
  emiMinor: number;
  validUntil: string;
}> {
  const offers = [];
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  const validUntilStr = validUntil.toISOString().split('T')[0];

  // Calculate EMI: P * r * (1+r)^n / ((1+r)^n - 1)
  const calculateEmi = (principal: number, rateAnnual: number, months: number): number => {
    const r = rateAnnual / 12 / 100;
    if (r === 0) return Math.round(principal / months);
    const emi = principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
    return Math.round(emi);
  };

  // Offer 1: Primary offer based on eligible amount
  if (creditScore.eligibleAmount >= 5000000) {
    offers.push({
      id: randomUUID(),
      source: "SUPERMANDI",
      amountMinor: creditScore.eligibleAmount,
      tenureMonths: 12,
      interestRateAnnual: creditScore.score === "EXCELLENT" ? 15.0 : creditScore.score === "GOOD" ? 18.0 : 21.0,
      emiMinor: calculateEmi(
        creditScore.eligibleAmount,
        creditScore.score === "EXCELLENT" ? 15.0 : creditScore.score === "GOOD" ? 18.0 : 21.0,
        12
      ),
      validUntil: validUntilStr,
    });
  }

  // Offer 2: Smaller amount, shorter tenure
  if (creditScore.eligibleAmount >= 2500000) {
    const smallerAmount = Math.round(creditScore.eligibleAmount * 0.5);
    offers.push({
      id: randomUUID(),
      source: "SUPERMANDI",
      amountMinor: smallerAmount,
      tenureMonths: 6,
      interestRateAnnual: creditScore.score === "EXCELLENT" ? 12.0 : creditScore.score === "GOOD" ? 15.0 : 18.0,
      emiMinor: calculateEmi(
        smallerAmount,
        creditScore.score === "EXCELLENT" ? 12.0 : creditScore.score === "GOOD" ? 15.0 : 18.0,
        6
      ),
      validUntil: validUntilStr,
    });
  }

  // Offer 3: BNPL extension (interest-free short term)
  if (creditScore.score !== "POOR") {
    const bnplAmount = 2500000; // ₹25k interest-free BNPL extension
    offers.push({
      id: randomUUID(),
      source: "SUPERMANDI_BNPL",
      amountMinor: bnplAmount,
      tenureMonths: 3,
      interestRateAnnual: 0,
      emiMinor: Math.round(bnplAmount / 3),
      validUntil: validUntilStr,
    });
  }

  return offers;
}

/**
 * GET /api/v1/pos/credit/offers
 * SM-021: Get available credit offers for the store
 */
posCreditRouter.get("/credit/offers", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;

  try {
    // Calculate credit score
    const creditScore = await calculateCreditScore(pool, storeId);

    // Check for existing offers in database
    const existingOffers = await pool.query(`
      SELECT
        id,
        offer_source as source,
        amount_minor as "amountMinor",
        tenure_months as "tenureMonths",
        interest_rate_annual as "interestRateAnnual",
        emi_minor as "emiMinor",
        valid_until as "validUntil",
        status
      FROM payments.credit_offers
      WHERE store_id = $1
        AND status = 'available'
        AND (valid_until IS NULL OR valid_until > NOW())
      ORDER BY amount_minor DESC
    `, [storeId]);

    let offers;
    if (existingOffers.rows.length > 0) {
      // Use existing offers
      offers = existingOffers.rows.map(o => ({
        ...o,
        validUntil: o.validUntil ? new Date(o.validUntil).toISOString().split('T')[0] : null,
      }));
    } else {
      // Generate new offers and save to database
      offers = generateOffers(storeId, creditScore);

      // Save offers to database
      for (const offer of offers) {
        await pool.query(`
          INSERT INTO payments.credit_offers (
            id, store_id, offer_source, amount_minor, tenure_months,
            interest_rate_annual, emi_minor, valid_until, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'available')
        `, [
          offer.id,
          storeId,
          offer.source,
          offer.amountMinor,
          offer.tenureMonths,
          offer.interestRateAnnual,
          offer.emiMinor,
          offer.validUntil,
        ]);
      }
    }

    // Check for active applications
    const activeApps = await pool.query(`
      SELECT id, status, kyc_status, requested_amount_minor
      FROM payments.credit_applications
      WHERE store_id = $1 AND status NOT IN ('rejected', 'disbursed')
      ORDER BY created_at DESC LIMIT 1
    `, [storeId]);

    console.log(`[SM-021] Credit offers: storeId=${storeId}, score=${creditScore.score}, offers=${offers.length}`);

    return res.json({
      success: true,
      offers,
      creditScore: creditScore.score,
      eligibleAmount: creditScore.eligibleAmount,
      scoringFactors: creditScore.factors,
      activeApplication: activeApps.rows[0] || null,
    });

  } catch (error: any) {
    console.error("[SM-021] Credit offers error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        offers: [],
        creditScore: "FAIR",
        eligibleAmount: 0,
        scoringFactors: { monthlyGmv: 0, transactionCount: 0, bnplRepaymentRate: 100, accountAge: 0 },
        activeApplication: null,
      });
    }

    return res.status(500).json({ success: false, error: "Failed to load credit offers" });
  }
});

/**
 * POST /api/v1/pos/credit/apply
 * SM-021: Apply for a credit offer
 */
posCreditRouter.post("/credit/apply", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;
  const { offerId, requestedAmountMinor } = req.body as { offerId?: string; requestedAmountMinor?: number };

  if (!offerId) {
    return res.status(400).json({ success: false, error: "offerId is required" });
  }
  if (!requestedAmountMinor || requestedAmountMinor <= 0) {
    return res.status(400).json({ success: false, error: "Valid requestedAmountMinor is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if offer exists and is available
    const offerResult = await client.query(`
      SELECT id, amount_minor, status, valid_until
      FROM payments.credit_offers
      WHERE id = $1 AND store_id = $2
    `, [offerId, storeId]);

    if (offerResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Offer not found" });
    }

    const offer = offerResult.rows[0];

    if (offer.status !== 'available') {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: `Offer is ${offer.status}, not available` });
    }

    if (offer.valid_until && new Date(offer.valid_until) < new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "Offer has expired" });
    }

    if (requestedAmountMinor > offer.amount_minor) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Requested amount exceeds offer limit",
        maxAmount: offer.amount_minor,
      });
    }

    // Check for existing pending application
    const existingApp = await client.query(`
      SELECT id, status FROM payments.credit_applications
      WHERE store_id = $1 AND status IN ('submitted', 'processing')
    `, [storeId]);

    if (existingApp.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        error: "Application already in progress",
        existingApplicationId: existingApp.rows[0].id,
      });
    }

    // Create application
    const applicationId = randomUUID();
    await client.query(`
      INSERT INTO payments.credit_applications (
        id, store_id, offer_id, requested_amount_minor, status, kyc_status
      ) VALUES ($1, $2, $3, $4, 'submitted', 'pending')
    `, [applicationId, storeId, offerId, requestedAmountMinor]);

    // Update offer status
    // DATA-002: Add store_id filter for store isolation
    await client.query(`
      UPDATE payments.credit_offers SET status = 'applied' WHERE id = $1 AND store_id = $2
    `, [offerId, storeId]);

    await client.query("COMMIT");

    console.log(`[SM-021] Credit application created: applicationId=${applicationId}, offerId=${offerId}`);

    return res.json({
      success: true,
      applicationId,
      status: "submitted",
      nextStep: "KYC",
      message: "Application submitted. Please complete KYC verification.",
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[SM-021] Credit apply error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to submit application" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/pos/credit/:applicationId/kyc
 * SM-021: Submit KYC for credit application
 */
posCreditRouter.post("/credit/:applicationId/kyc", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;
  const { applicationId } = req.params;
  const { panNumber, aadhaarLast4 } = req.body as { panNumber?: string; aadhaarLast4?: string };

  // Validate PAN format
  if (!panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
    return res.status(400).json({ success: false, error: "Invalid PAN format (e.g., ABCDE1234F)" });
  }

  // Validate Aadhaar last 4 digits
  if (!aadhaarLast4 || !/^[0-9]{4}$/.test(aadhaarLast4)) {
    return res.status(400).json({ success: false, error: "Invalid Aadhaar last 4 digits" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get application
    const appResult = await client.query(`
      SELECT
        ca.id, ca.status, ca.kyc_status, ca.requested_amount_minor, ca.offer_id,
        co.amount_minor as offer_amount, co.tenure_months, co.interest_rate_annual
      FROM payments.credit_applications ca
      LEFT JOIN payments.credit_offers co ON co.id = ca.offer_id
      WHERE ca.id = $1 AND ca.store_id = $2
    `, [applicationId, storeId]);

    if (appResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Application not found" });
    }

    const app = appResult.rows[0];

    if (app.status === 'rejected' || app.status === 'disbursed') {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: `Application is ${app.status}` });
    }

    if (app.kyc_status === 'verified') {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "KYC already verified" });
    }

    // In production, this would call a KYC verification API
    // For MVP, we simulate verification with a simple check
    const isKycValid = panNumber.length === 10 && aadhaarLast4.length === 4;

    if (!isKycValid) {
      // DATA-002: Add store_id filter for store isolation
      await client.query(`
        UPDATE payments.credit_applications
        SET kyc_status = 'rejected', status = 'rejected'
        WHERE id = $1 AND store_id = $2
      `, [applicationId, storeId]);

      await client.query("COMMIT");

      return res.json({
        success: false,
        kycStatus: "rejected",
        applicationStatus: "rejected",
        message: "KYC verification failed",
      });
    }

    // CL-020: KYC passed — set status to kyc_verified (pending SuperAdmin approval)
    // Previously auto-approved with mock KYC. Now requires admin review via /admin/credit/applications
    await client.query(`
      UPDATE payments.credit_applications
      SET kyc_status = 'verified', status = 'kyc_verified',
          pan_number = $1, aadhaar_last4 = $2
      WHERE id = $3 AND store_id = $4
    `, [panNumber, aadhaarLast4, applicationId, storeId]);

    await client.query("COMMIT");

    console.log(`[SM-021] KYC verified, pending admin approval: applicationId=${applicationId}`);

    return res.json({
      success: true,
      kycStatus: "verified",
      applicationStatus: "kyc_verified",
      message: "KYC verified. Your credit application is under review and will be approved shortly.",
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[SM-021] KYC error:", error.message);

    // Check if columns don't exist
    if (error.message.includes('pan_number') || error.message.includes('aadhaar_last4') || error.message.includes('approved_amount_minor')) {
      return res.status(500).json({
        success: false,
        error: "KYC columns not yet migrated",
        hint: "Run migration 055_credit_kyc_columns.sql",
      });
    }

    return res.status(500).json({ success: false, error: "Failed to verify KYC" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/pos/credit/applications
 * SM-021: Get store's credit applications history
 */
posCreditRouter.get("/credit/applications", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;

  try {
    const result = await pool.query(`
      SELECT
        ca.id,
        ca.offer_id as "offerId",
        ca.requested_amount_minor as "requestedAmountMinor",
        ca.status,
        ca.kyc_status as "kycStatus",
        ca.disbursed_amount_minor as "disbursedAmountMinor",
        ca.disbursed_at as "disbursedAt",
        ca.created_at as "createdAt",
        co.offer_source as "offerSource",
        co.tenure_months as "tenureMonths",
        co.interest_rate_annual as "interestRateAnnual"
      FROM payments.credit_applications ca
      LEFT JOIN payments.credit_offers co ON co.id = ca.offer_id
      WHERE ca.store_id = $1
      ORDER BY ca.created_at DESC
      LIMIT 20
    `, [storeId]);

    return res.json({
      success: true,
      applications: result.rows,
    });

  } catch (error: any) {
    console.error("[SM-021] Credit applications error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to load applications" });
  }
});

export default posCreditRouter;
