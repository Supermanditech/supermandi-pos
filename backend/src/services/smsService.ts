/**
 * GCP-STG-0467: SMS fallback service for OTP delivery
 *
 * Supports MSG91 and Twilio providers via SMS_PROVIDER env var.
 * Default: 'disabled' — logs to console, returns false.
 * Never throws — always returns boolean (true = sent, false = failed/disabled).
 */

import { log } from '../lib/logger';

type SmsProvider = 'msg91' | 'twilio' | 'disabled';

function getProvider(): SmsProvider {
  const raw = (process.env.SMS_PROVIDER || 'disabled').toLowerCase();
  if (raw === 'msg91' || raw === 'twilio') return raw;
  return 'disabled';
}

/**
 * Send an SMS message. Returns true on success, false on failure.
 * Never throws — all errors are caught and logged.
 */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const provider = getProvider();

  if (provider === 'disabled') {
    log.info(`[SMS] Provider disabled — would send to ${to.slice(0, 5)}***: ${body.slice(0, 30)}...`);
    return false;
  }

  try {
    if (provider === 'msg91') {
      return await sendViaMsg91(to, body);
    }
    if (provider === 'twilio') {
      return await sendViaTwilio(to, body);
    }
    return false;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error(`[SMS] ${provider} send failed: ${message}`);
    return false;
  }
}

async function sendViaMsg91(to: string, body: string): Promise<boolean> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !templateId) {
    log.error('[SMS] MSG91 not configured — missing MSG91_AUTH_KEY or MSG91_TEMPLATE_ID');
    return false;
  }

  // Extract OTP from body (6-digit number)
  const otpMatch = body.match(/\b(\d{6})\b/);
  const otp = otpMatch ? otpMatch[1] : '';

  const response = await fetch('https://api.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: authKey,
    },
    body: JSON.stringify({
      template_id: templateId,
      short_url: '0',
      recipients: [
        {
          mobiles: to,
          otp,
        },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    log.error(`[SMS] MSG91 HTTP ${response.status}: ${text.slice(0, 200)}`);
    return false;
  }

  log.info(`[SMS] MSG91 sent to ${to.slice(0, 5)}***`);
  return true;
}

async function sendViaTwilio(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (!sid || !authToken || !from) {
    log.error('[SMS] Twilio not configured — missing TWILIO_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM');
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const credentials = Buffer.from(`${sid}:${authToken}`).toString('base64');

  const params = new URLSearchParams();
  params.append('To', to.startsWith('+') ? to : `+${to}`);
  params.append('From', from);
  params.append('Body', body);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: params.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    log.error(`[SMS] Twilio HTTP ${response.status}: ${text.slice(0, 200)}`);
    return false;
  }

  log.info(`[SMS] Twilio sent to ${to.slice(0, 5)}***`);
  return true;
}
