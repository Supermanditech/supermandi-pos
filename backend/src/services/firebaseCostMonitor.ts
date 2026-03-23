// GCP-STG-0472: Firebase OTP cost monitoring — track verification count per month
// At 10K users, Firebase phone auth costs ~$18K/month at $0.06/verification
// This monitor logs daily OTP counts and alerts when approaching thresholds

import { getPool } from '../db/client';

const OTP_MONTHLY_FREE_TIER = 10_000;
const OTP_COST_PER_VERIFICATION = 0.06; // USD, India rate
const ALERT_THRESHOLD_PCT = 80; // Alert at 80% of free tier

export interface OtpCostReport {
  count: number;
  estimatedCostUsd: number;
  pctOfFreeTier: number;
  alertThresholdPct: number;
  isOverThreshold: boolean;
}

export async function getOtpVerificationCount(daysBack = 30): Promise<OtpCostReport> {
  const pool = getPool();
  if (!pool) {
    return { count: 0, estimatedCostUsd: 0, pctOfFreeTier: 0, alertThresholdPct: ALERT_THRESHOLD_PCT, isOverThreshold: false };
  }
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM auth.auth_events
       WHERE event_type IN ('otp_sent', 'otp_verified')
       AND created_at > NOW() - make_interval(days => $1)`,
      [daysBack]
    );
    const count: number = result.rows[0]?.cnt ?? 0;
    const estimatedCostUsd = Math.max(0, count - OTP_MONTHLY_FREE_TIER) * OTP_COST_PER_VERIFICATION;
    const pctOfFreeTier = Math.round((count / OTP_MONTHLY_FREE_TIER) * 100);
    const isOverThreshold = pctOfFreeTier >= ALERT_THRESHOLD_PCT;
    return { count, estimatedCostUsd, pctOfFreeTier, alertThresholdPct: ALERT_THRESHOLD_PCT, isOverThreshold };
  } catch {
    return { count: 0, estimatedCostUsd: 0, pctOfFreeTier: 0, alertThresholdPct: ALERT_THRESHOLD_PCT, isOverThreshold: false };
  }
}

// Exported constants for testing
export { OTP_MONTHLY_FREE_TIER, OTP_COST_PER_VERIFICATION, ALERT_THRESHOLD_PCT };
