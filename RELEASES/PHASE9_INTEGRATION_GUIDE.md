# Phase 9: Integration R&D Guide — Per-Ticket Technical Reference

> **Purpose**: This document provides VS Code Claude with all R&D findings needed to execute Phase 9 tickets immediately — SDK packages, API endpoints, sandbox setup, code patterns, and integration readiness per ticket.
>
> **Last updated**: 2026-02-16
> **Research sources**: Codebase audit, Razorpay API docs, Rupifi developer portal, Cashfree docs, Meta WhatsApp SDK, Socket.io docs, expo-speech API, OpenAI API, existing codebase patterns.

---

## READINESS LEGEND

| Symbol | Meaning |
|--------|---------|
| ✅ CAN CODE NOW | No external dependency — SDK available, codebase ready, start immediately |
| ⚠️ NEEDS API KEYS | Code can be written but needs operator to provide API keys/credentials |
| 🔑 NEEDS PARTNERSHIP | Requires operator to sign partnership agreement with provider |
| 🔧 EXISTING CODE | Feature partially exists — wire/fix existing code |

---

## AREA 1: UPI PAYMENT GATEWAY — RAZORPAY (T-253 → T-262)

### Existing Codebase Audit

| Component | File | Status |
|-----------|------|--------|
| Razorpay SDK | `backend/services/payment-service/package.json` | `razorpay@^2.9.4` installed |
| Client init | `payment-service/src/services/razorpayClient.ts` | Working but has bugs (see below) |
| Webhook handler | `backend/src/routes/v1/webhooks.ts` | Handles `payment.captured/failed`, `payout.*` |
| Refund webhook | `backend/src/routes/v1/webhooks/refundWebhook.ts` | Handles `refund.created/processed/failed` |
| Payout service | `backend/src/services/supplierPayoutService.ts` | Complete but `SUPPLIER_PAYOUTS_ENABLED=false` |
| Payment schema | `backend/migrations/049_payments_schema.sql` | 6 tables: sell_payments, buy_payments, bnpl_drawdowns, bnpl_settings, credit_offers, credit_applications, customer_dues |
| Refund schema | `backend/migrations/152_phase8_notifications_and_compliance.sql` | `orders.refund_requests` table exists |
| Admin refunds | `backend/src/routes/v1/admin/refunds.ts` | Approve/reject flow — but NO Razorpay API call |

### Known Bugs to Fix

1. **`razorpayClient.ts` lines 243/214/151**: Uses `(razorpay as any).contacts?.create()` — these methods DON'T EXIST on SDK. Will silently return `undefined`. Fix: use raw `fetch()` like `supplierPayoutService.ts` does.
2. **`razorpayClient.ts` line 119-124**: Signature verification does NOT use `crypto.timingSafeEqual()` — timing attack vulnerability. Fix: match `supplierPayoutService.ts` line 381 pattern.
3. **No Razorpay refund initiation**: Admin refunds route approves in DB but never calls `razorpay.payments.refund()`.
4. **UPI QR is plain intent string**: `upi://pay?pa=...` — Razorpay has no knowledge of these payments.

### Environment Variables Required

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxx          # Test: rzp_test_*, Live: rzp_live_*
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxx         # Separate from key_secret
RAZORPAY_ACCOUNT_NUMBER=2323230012345678   # RazorpayX linked current account
SUPPLIER_PAYOUTS_ENABLED=true
```

### API Reference

| Operation | Method | Endpoint | SDK Method |
|-----------|--------|----------|------------|
| Create Order | POST | `/v1/orders` | `razorpay.orders.create()` |
| Fetch Order | GET | `/v1/orders/:id` | `razorpay.orders.fetch()` |
| Fetch Payment | GET | `/v1/payments/:id` | `razorpay.payments.fetch()` |
| Create Refund | POST | `/v1/payments/:id/refund` | `razorpay.payments.refund()` |
| Fetch Refund | GET | `/v1/refunds/:id` | `razorpay.refunds.fetch()` |
| Create QR Code | POST | `/v1/payments/qr_codes` | Raw fetch (not in SDK) |
| Create Contact | POST | `/v1/contacts` | Raw fetch (NOT in SDK) |
| Create Fund Account | POST | `/v1/fund_accounts` | Raw fetch (NOT in SDK) |
| Create Payout | POST | `/v1/payouts` | Raw fetch (NOT in SDK) |

**Base URL**: `https://api.razorpay.com/v1` (same for test and live — key determines environment)

### Test Sandbox

| Item | Value |
|------|-------|
| Dashboard | `https://dashboard.razorpay.com` (toggle Test/Live mode) |
| RazorpayX | `https://x.razorpay.com` |
| Test UPI (success) | `success@razorpay` |
| Test UPI (failure) | `failure@razorpay` |
| Test Card (success) | `4111 1111 1111 1111` |
| Rate Limit | 20 req/sec per key |
| Webhook retry | Up to 24h with exponential backoff |

---

### Per-Ticket Guide

#### T-253 (U-1): Wire Razorpay SELL webhook handler ✅ CAN CODE NOW
- **What exists**: `webhooks.ts` lines 250-264 handle `payment.captured/failed/authorized`
- **Gap**: Not updating `payments.sell_payments` table with gateway confirmation
- **Action**: In webhook handler, after signature verification, UPDATE `sell_payments SET status='confirmed', upi_payment_id=$paymentId, webhook_payload=$payload WHERE upi_order_id=$orderId`
- **Pattern**: Follow existing `handlePayoutWebhook()` at line 276

#### T-254 (U-2): Real UPI order tracking ⚠️ NEEDS API KEYS
- **What exists**: `payments.ts` lines 54-65 generate plain UPI intent strings
- **Action**: Replace with `razorpay.orders.create({ amount, currency:'INR', receipt })` → store `order_id` in `sell_payments.upi_order_id` → generate QR from order
- **Code pattern**: `razorpayClient.ts` lines 49-78 already have `createOrder()` function

#### T-255 (U-3): UTR verification via gateway ✅ CAN CODE NOW
- **What exists**: `payments.ts` lines 836-1095 does format-only validation (12-22 chars)
- **Action**: After `payment.captured` webhook, fetch `razorpay.payments.fetch(paymentId)` → extract `acquirer_data.utr` → cross-reference with stored UTRs
- **Note**: No Razorpay endpoint to look up arbitrary UTR — must match against known payments

#### T-256 (U-4): Enable supplier payouts (RazorpayX) ⚠️ NEEDS API KEYS + RAZORPAYX ACCOUNT
- **What exists**: `supplierPayoutService.ts` is COMPLETE — contact creation, fund account, payout, webhook handling all implemented using raw `fetch()`
- **Action**: Set `SUPPLIER_PAYOUTS_ENABLED=true`, provide `RAZORPAY_ACCOUNT_NUMBER`
- **RazorpayX**: Separate product from Razorpay PG. Same API keys work once activated. Needs linked current account (RBL/ICICI bank).

#### T-257 (U-5): Supplier bank/UPI KYC collection 🔧 EXISTING CODE
- **What exists**: Migration `060_supplier_bank_kyc.sql` has bank columns. Supplier portal has KYC page.
- **Action**: Verify supplier portal KYC form saves bank_account_number + ifsc_code. Add UPI VPA field. Wire to RazorpayX fund account creation.

#### T-258 (U-6): Payout retry & failure handling 🔧 EXISTING CODE
- **What exists**: `supplierPayoutService.ts` has error handling but no retry queue
- **Action**: Add `payments.payout_retries` table. On failure, insert retry record with exponential backoff. Cron job processes retry queue. Alert after 3x failure.

#### T-259 (U-7): Refund flow (SELL) 🔧 EXISTING CODE
- **What exists**: Refund webhook handler at `refundWebhook.ts`, admin approve/reject at `admin/refunds.ts`, schema at migration 152
- **Gap**: No code calls `razorpay.payments.refund()` to INITIATE the refund
- **Action**: Add `initiateRazorpayRefund()` in `razorpayClient.ts`:
  ```typescript
  const refund = await razorpay.payments.refund(paymentId, { amount: amountPaise, speed: 'normal' });
  ```
- **Wire**: Admin approve → call `initiateRazorpayRefund()` → webhook confirms

#### T-260 (U-8): Payment reconciliation dashboard ✅ CAN CODE NOW
- **Action**: Create `retailer-admin/src/pages/ReconciliationPage.tsx`. Backend endpoint: aggregate sell_payments by date + payment_method. DD/MM/YYYY + INR format.

#### T-261 (U-9): Dynamic QR expiry + refresh UI ✅ CAN CODE NOW
- **What exists**: Backend `QR_EXPIRY_MS = 5*60*1000` at `payments.ts` line 22. Returns `expiresAt`.
- **Gap**: POS shows no countdown
- **Action**: POS `PaymentScreen` — add `CountdownTimer` component using `expiresAt` from API response. On expiry: "QR expired — Tap to regenerate". Use `useEffect` + `setInterval(1000)`.

#### T-262 (U-10): Payment event outbox processor ✅ CAN CODE NOW
- **What exists**: `orders.event_outbox` table from reorder system. BullMQ infrastructure.
- **Action**: Create worker that reads outbox entries, publishes to BullMQ queues for payment event consumers.

---

## AREA 2: B2B FINANCE — 14 PROVIDERS (T-263 → T-290)

### Integration Readiness Matrix

| # | Provider | Tier | Public API Docs | Sandbox | npm Package | Integration Path | Readiness |
|---|----------|------|----------------|---------|-------------|-----------------|-----------|
| 1 | **Rupifi** | T1-Trade Credit | ✅ developers.rupifi.com | ⚠️ Contact required | None (REST API) | Partnership → API keys → REST integration | 🔑 NEEDS PARTNERSHIP |
| 2 | **KredX** | T1-Trade Credit | ⚠️ Not public | ⚠️ Contact required | None | Partnership → API access → REST integration | 🔑 NEEDS PARTNERSHIP |
| 3 | **Mintifi** | T1-Trade Credit | ⚠️ Not public | ⚠️ Contact required | None | Enterprise onboarding → API integration | 🔑 NEEDS PARTNERSHIP |
| 4 | **Trevex** | T1-Trade Credit | ⚠️ Not public | ⚠️ Contact required | None | Contact trevex.io → API setup | 🔑 NEEDS PARTNERSHIP |
| 5 | **Lendingkart** | T2-Credit Line | ✅ lendingkart.com/docs/xlr8/api/ | ✅ UAT at gateway-qa.lendingkart.io | None (REST API) | Partner SPOC → UAT credentials → go-live ~1 week | 🔑 NEEDS PARTNERSHIP |
| 6 | **FlexiLoans** | T2-Credit Line | ⚠️ Via FintegrationFS | ⚠️ Contact required | None | REST API documented → contact for credentials | 🔑 NEEDS PARTNERSHIP |
| 7 | **Progcap** | T2-Credit Line | ⚠️ Not public | ⚠️ Contact required | None | Contact progcap.com → API onboarding | 🔑 NEEDS PARTNERSHIP |
| 8 | **NeoGrowth** | T2-Credit Line | ⚠️ Not public | ⚠️ Contact required | None | Contact neogrowth.in → API integration | 🔑 NEEDS PARTNERSHIP |
| 9 | **Finova Capital** | T3-RJ NBFC | ⚠️ Not public | ⚠️ Contact required | None | Contact Jaipur HQ → API access | 🔑 NEEDS PARTNERSHIP |
| 10 | **Cashfree EL** | T4-LaaS | ✅ docs.cashfree.com | ✅ Likely (Cashfree has sandbox) | `cashfree-sdk` | Developer signup → sandbox → integration | ⚠️ NEEDS API KEYS |
| 11 | **KredX** | T5-Invoice Disc. | ⚠️ Not public | ⚠️ Contact required | None | Same as T1 KredX partnership | 🔑 NEEDS PARTNERSHIP |
| 12 | **M1xchange** | T5-TReDS | ⚠️ Not public (API via NPCI Bharat Connect) | ⚠️ Contact required | None | TReDS registration → API via Bharat Connect | 🔑 NEEDS PARTNERSHIP |
| 13 | **Vayana** | T5-Trade Finance | ✅ docs.enriched-api.vayana.com | ⚠️ Contact required | None | docs.gsp.vayana.com for GST APIs | 🔑 NEEDS PARTNERSHIP |
| 14 | **Credlix** | T5-Invoice Factoring | ⚠️ Not public | ⚠️ Contact required | None | Contact credlix.com → API access | 🔑 NEEDS PARTNERSHIP |

### Key Finding: Provider Abstraction Layer is CRITICAL

Since 12 of 14 providers need partnerships, the **abstraction layer (T-263/B-1)** should be built FIRST. This lets VS Code Claude:
1. Build the full `CreditProvider` interface + provider selection UI + repayment tracking
2. Implement mock providers for staging/testing
3. Swap in real providers as partnerships come through

### Existing BNPL Code Audit

| Component | File | Status |
|-----------|------|--------|
| BNPL drawdowns | `backend/src/routes/v1/pos/bnpl.ts` | GET active, GET summary, POST pay — ALL WORKING |
| BNPL settings | `payments.bnpl_settings` table | Schema ready, per-supplier limits |
| Credit offers | `payments.credit_offers` table | Schema ready with `offer_source` field (OCEN/SUPERMANDI/PARTNER_BANK) |
| Credit applications | `payments.credit_applications` table | Schema ready with KYC tracking |
| Credit scoring | `backend/src/services/creditScoringService.ts` | GMV + txn count + repayment scoring — WORKING |
| Store BNPL config | `platform.stores` columns | `bnpl_enabled`, `bnpl_credit_limit` — WORKING |

### Per-Ticket Guide

#### T-263 (B-1): Credit provider abstraction layer ✅ CAN CODE NOW
- **Action**: Create `backend/src/services/credit/CreditProvider.ts` interface:
  ```typescript
  interface CreditProvider {
    providerId: string;
    providerName: string;
    mode: 'trade_credit' | 'credit_line' | 'invoice_discounting';
    checkEligibility(storeId: string): Promise<EligibilityResult>;
    getOffers(storeId: string): Promise<CreditOffer[]>;
    createDrawdown(params: DrawdownParams): Promise<DrawdownResult>;
    getRepaymentSchedule(drawdownId: string): Promise<RepaymentSchedule>;
    processRepayment(params: RepaymentParams): Promise<RepaymentResult>;
    getBalance(storeId: string): Promise<BalanceResult>;
  }
  ```
- **Existing pattern**: `credit_offers.offer_source` already supports `'OCEN' | 'SUPERMANDI' | 'PARTNER_BANK'` — extend with provider IDs
- **Mock provider**: Create `MockCreditProvider` for staging testing

#### T-264 (B-2): Rupifi integration 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- **API Docs**: https://developers.rupifi.com/docs/rupifi-bnpl/
- **Integration model**: Anchor (SuperMandi) → Merchant (retailer) → Lender (Rupifi's NBFC partner)
- **Flow**: Marketplace checkout → Rupifi BNPL as payment option → user selects → loan created → supplier paid instantly → retailer repays 15-60 days
- **Key detail**: Rupifi APIs are embedded in marketplace app journey — NOT a redirect
- **Action when partnership ready**: Implement `RupifiCreditProvider` extending `CreditProvider` interface
- **Contact**: developers.rupifi.com or contact@rupifi.com

#### T-265 (B-3): KredX integration 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- **Website**: https://www.kredx.com/channel-finance/
- **Key feature**: API integration in <24 hours (per KredX claims), multi-financier on single integration
- **Model**: Closed-loop digital supply chain financing — brands/enterprises get instant payment, buyers get credit
- **Action when partnership ready**: Implement `KredXCreditProvider`

#### T-266 (B-4): Mintifi integration 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- **Website**: https://mintifi.com
- **NBFC**: Own NBFC (Mintifi Finserve Private Limited, RBI-registered middle layer)
- **Model**: Data-driven SCF — collateral-free inventory + purchase financing through brand partnerships
- **Series E**: $270M raised — well-funded, reliable partner
- **Action when partnership ready**: Implement `MintifiCreditProvider`

#### T-267 (B-5): Trevex integration 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- **Website**: https://www.trevex.io/b2b-bnpl
- **Model**: White-label BNPL via lending partner
- **Action when partnership ready**: Implement `TrevexCreditProvider`

#### T-268 (B-6): Lendingkart integration 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX (BEST SANDBOX ACCESS)
- **API Docs**: https://www.lendingkart.com/docs/xlr8/api/
- **Sandbox**: ✅ UAT at `gateway-qa.lendingkart.io` — credentials from Partnerships SPOC
- **Go-live**: ~1 week after UAT approval
- **Model**: 2gthr co-lending platform — working capital credit lines, EMI-based
- **Revenue**: ₹898Cr — largest among Tier 2 providers
- **Action when partnership ready**: Implement `LendingkartCreditProvider` — best candidate for FIRST integration due to documented sandbox

#### T-269 (B-7): FlexiLoans integration 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- **API Docs**: Via FintegrationFS — REST API documented
- **Model**: RBI-registered NBFC, collateral-free ₹50K-₹1Cr, 24-48h approval
- **Action when partnership ready**: Implement `FlexiLoansCreditProvider`

#### T-270 (B-8): Progcap integration 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- **Website**: https://www.progcap.com/products-services
- **Product**: FRCL (Fast Rotation Credit Line) — aligns with inventory turnover cycles
- **Scale**: $3B+ disbursed, semi-urban/rural India focus
- **App**: `app.progfin.com` (Progfin is the NBFC arm)
- **Action when partnership ready**: Implement `ProgcapCreditProvider`

#### T-271 (B-9): NeoGrowth integration 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- **Model**: POS-based lending — repayment via daily sales deduction
- **Action when partnership ready**: Implement `NeoGrowthCreditProvider`

#### T-272 (B-10): Finova Capital integration 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- **HQ**: Jaipur, Rajasthan — 180 branches in RJ/MP/UP
- **Focus**: Kirana stores — strongest local fit for SuperMandi's Rajasthan launch
- **Scale**: 30K+ customers, own NBFC
- **Action when partnership ready**: Implement `FinovaCreditProvider`

#### T-273 (B-11): Cashfree Embedded Lending ⚠️ NEEDS API KEYS
- **Docs**: https://docs.cashfree.com + https://www.cashfree.com/embedded-lending/
- **npm**: `cashfree-sdk` (or direct REST API)
- **Model**: Single API → multiple NBFCs — handles disbursement + repayment + escrow
- **Two integration options**: Native (your UI + their API) or white-labeled UI
- **Key advantage**: ONE integration = access to 10+ lenders. Cashfree handles KYC routing.
- **Sandbox**: Likely available (Cashfree has sandbox for all products)
- **Action**: Sign up at cashfree.com → get sandbox → implement `CashfreeELProvider`

#### T-274 (B-12): Provider selection UI (POS) ✅ CAN CODE NOW
- **Action**: POS checkout → show credit offers from all registered providers sorted by terms
- **Pattern**: Use `CreditProvider.getOffers()` → render as selectable cards with terms comparison

#### T-275 (B-13): Repayment tracking ✅ CAN CODE NOW
- **What exists**: `bnpl_drawdowns` table with `status`, `paid_amount_minor`, `due_date`
- **Action**: Extend for multi-provider: add `provider_id`, `external_loan_id` columns. Track EMI schedules.

#### T-276 (B-14): KYC routing ✅ CAN CODE NOW (abstraction)
- **Action**: Build KYC routing layer — each provider has own KYC needs. Shared KYC (PAN/Aadhaar/GSTIN) collected once, routed to each provider's verification API.
- **Pattern**: `backend/src/services/credit/kycRouter.ts`

#### T-277 (B-15): Credit dashboard (Retailer Admin) ✅ CAN CODE NOW
- **Action**: `RetailerCreditDashboard.tsx` — aggregated view across ALL providers

#### T-278 (B-16): Settlement reconciliation ✅ CAN CODE NOW
- **Action**: Match disbursements from each provider to POs/withdrawals

#### T-279 (B-17): Auto-overdue maturation job ✅ CAN CODE NOW
- **Action**: Cron checks all drawdowns past `due_date`, marks `overdue`, sends push notifications (FCM service exists)

#### T-280 (B-18): Supplier-side BNPL visibility ✅ CAN CODE NOW
- **Action**: Supplier portal — show which POs are BNPL-backed, payment guaranteed

#### T-281 (B-19): Provider health monitoring ✅ CAN CODE NOW
- **Action**: SuperAdmin dashboard — API health, response times, approval rates per provider

#### T-282 (B-20): Provider comparison engine ✅ CAN CODE NOW
- **Action**: Side-by-side offers sorted by total cost — "Rupifi: ₹2L at 1.5%/mo" vs "KredX: ₹5L at 1.2%/mo"

#### T-283 (B-21): KredX invoice discounting (Supplier side) 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- Same KredX partnership as T-265

#### T-284 (B-22): M1xchange TReDS integration 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- **Platform**: RBI-licensed TReDS — invoice discounting via bank bidding
- **Scale**: ₹1.7L Cr+ processed, 70K+ MSMEs, 70 banks/NBFCs
- **Integration**: Via NPCI Bharat Connect B2B API framework
- **Contact**: m1xchange.com

#### T-285 (B-23): Vayana trade credit 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- **Docs**: docs.enriched-api.vayana.com (GST/e-invoicing APIs documented)
- **Scale**: USD 30B+ financed, 300K+ enterprises
- **Trade finance docs**: docs.gsp.vayana.com for compliance APIs

#### T-286 (B-24): Credlix invoice factoring 🔑 PARTNERSHIP DONE — NEEDS API CREDENTIALS/SANDBOX
- **Website**: credlix.com
- **Model**: 90% of invoice in 24h, PO financing, non-recourse

#### T-287 (B-25): Supplier financing UI ✅ CAN CODE NOW
- **Action**: Supplier portal "Get Paid Now" button on invoices → application flow

#### T-288 (B-26): Retailer bulk purchase credit UI ✅ CAN CODE NOW
- **Action**: POS large PO → "Finance this purchase" option at checkout

#### T-289 (B-27): SuperAdmin finance monitoring dashboard ✅ CAN CODE NOW
- **Action**: Real-time monitoring across ALL providers — applications, approvals, disbursements

#### T-290 (B-28): SuperAdmin provider management ✅ CAN CODE NOW
- **Action**: Enable/disable providers per store, set commission rates

---

## AREA 3: WHATSAPP + IN-APP CHAT (T-291 → T-302)

### WhatsApp Cloud API — Key Details

| Item | Value |
|------|-------|
| **Official Node.js SDK** | `whatsapp` (npm) — https://github.com/WhatsApp/WhatsApp-Nodejs-SDK |
| **Install** | `npm install whatsapp` |
| **API Version** | v21.0 (Feb 2026) |
| **Base URL** | `https://graph.facebook.com/v21.0` |
| **Developer Signup** | https://developers.facebook.com → Create App → WhatsApp |
| **Business Verification** | https://business.facebook.com (Meta Business Suite) |
| **Test Phone** | Meta provides a test phone number in sandbox mode |
| **Free Tier** | 1000 free service conversations/month |
| **India Pricing** | Utility: ~₹0.13/conv, Marketing: ~₹0.88/conv, Service: free first 1000 |

### Environment Variables (WhatsApp)

```env
WA_PHONE_NUMBER_ID=123456789012345        # From Meta App Dashboard
CLOUD_API_ACCESS_TOKEN=EAAxxxxxxxx         # System User token (permanent)
CLOUD_API_VERSION=v21.0                    # Graph API version
WA_WEBHOOK_VERIFY_TOKEN=my_custom_token    # Your webhook verification string
WA_BUSINESS_ACCOUNT_ID=xxxxxxxxxxxx        # WhatsApp Business Account ID
```

### Send Message Code Pattern

```typescript
import WhatsApp from 'whatsapp';

const wa = new WhatsApp(process.env.WA_PHONE_NUMBER_ID!);

// Send text message
await wa.messages.text({ body: 'Your order #SM123 is confirmed!' }, recipientPhone);

// Send template message (pre-approved)
await wa.messages.template({
  name: 'order_confirmation',
  language: { code: 'en' },
  components: [{ type: 'body', parameters: [{ type: 'text', text: 'SM123' }] }]
}, recipientPhone);
```

### Webhook Verification (Meta Challenge)

```typescript
app.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WA_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});
```

### Socket.io for In-App Chat

| Item | Value |
|------|-------|
| **Server npm** | `socket.io@^4.x` |
| **Client npm** | `socket.io-client@^4.x` |
| **Expo compatibility** | ✅ Works with Expo managed workflow (uses WebSocket transport) |
| **Auth pattern** | JWT token in `auth` handshake option |
| **Redis adapter** | `@socket.io/redis-adapter` for multi-instance |

### Socket.io Server Setup (alongside Express)

```typescript
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const io = new Server(httpServer, { cors: { origin: '*' } });

// JWT auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  try { socket.data.user = verifyJWT(token); next(); }
  catch { next(new Error('auth_failed')); }
});

// Room-based messaging
io.on('connection', (socket) => {
  socket.join(`conversation:${conversationId}`);
  socket.on('send_message', async (data) => {
    await saveMessageToDB(data);
    io.to(`conversation:${data.conversationId}`).emit('new_message', data);
  });
});
```

### React Native Client (Expo)

```typescript
import { io } from 'socket.io-client';

const socket = io('https://api.supermandi.tech', {
  auth: { token: jwtToken },
  transports: ['websocket'],  // Skip polling for RN
});

socket.on('new_message', (msg) => setChatMessages(prev => [...prev, msg]));
socket.emit('send_message', { conversationId, text: 'Hello!' });
```

### FCM Push Notifications — ALREADY BUILT

| Component | File | Status |
|-----------|------|--------|
| FCM Service | `backend/src/services/fcmService.ts` | COMPLETE — sendToUser, sendToStore, sendToSupplier, token management |
| GRN Alert Service | `backend/src/services/grnAlertNotificationService.ts` | COMPLETE — push + persist |
| Notification schema | `backend/migrations/152_phase8_notifications_and_compliance.sql` | `notifications.notifications`, `notifications.delivery_log`, `notifications.preferences` |
| Device tokens | `auth.device_tokens` table | READY |
| POS push client | `src/services/pushNotifications.ts` | Expo notifications setup |
| firebase-admin | `backend/package.json` | INSTALLED |

### Per-Ticket Guide

#### T-291 (W-1): Chat database schema ✅ CAN CODE NOW
- **Action**: Migration adding `chat.conversations`, `chat.messages`, `chat.conversation_participants` tables
- **Pattern**: Follow existing notification schema patterns

#### T-292 (W-2): Chat backend API ✅ CAN CODE NOW
- **Action**: CRUD routes — create conversation, send message, list messages, mark read
- **File**: `backend/src/routes/v1/chat.ts`

#### T-293 (W-3): Real-time chat (Socket.io) ✅ CAN CODE NOW
- **npm**: `socket.io@^4.x`, `@socket.io/redis-adapter`
- **Action**: Add Socket.io server alongside Express in api-gateway. JWT auth middleware.

#### T-294 (W-4): POS chat screen ✅ CAN CODE NOW
- **npm**: `socket.io-client@^4.x` (Expo compatible)
- **Action**: ChatListScreen + ConversationScreen in POS app

#### T-295 (W-5): Supplier portal chat UI ✅ CAN CODE NOW
- **npm**: `socket.io-client@^4.x`
- **Action**: Chat component in supplier portal Next.js app

#### T-296 (W-6): WhatsApp Cloud API integration ⚠️ NEEDS META BUSINESS VERIFICATION
- **npm**: `whatsapp` (official Meta SDK)
- **Signup**: https://developers.facebook.com → Create App → WhatsApp
- **Docs needed for India**: GST certificate, business PAN, authorized signatory ID
- **Test mode**: Available immediately after app creation (free test number)

#### T-297 (W-7): WhatsApp order receipt to consumer ⚠️ NEEDS TEMPLATE APPROVAL
- **Requires**: Approved message template (submit via Meta Business Manager)
- **Template approval**: Usually 24-48 hours
- **Action**: Send template message with order details after sale completion

#### T-298 (W-8): WhatsApp reorder alert to supplier ⚠️ NEEDS TEMPLATE APPROVAL
- Same WhatsApp setup as T-296/T-297

#### T-299 (W-9): Push notifications (FCM + Expo) 🔧 EXISTING CODE
- **What exists**: `fcmService.ts` is COMPLETE. `pushNotifications.ts` has Expo setup.
- **Action**: Wire POS app to register device token on login → backend stores in `auth.device_tokens`

#### T-300 (W-10): SuperMandi support chat ✅ CAN CODE NOW
- **Action**: Dedicated "Support" conversation channel in chat system

#### T-301 (W-11): Chat attachment support ✅ CAN CODE NOW
- **Action**: Image/PDF upload via existing GCS upload endpoint (T-160 built) + message type 'image'/'document'

#### T-302 (W-12): Message template management ✅ CAN CODE NOW
- **Action**: SuperAdmin UI to create/edit WhatsApp template messages (stored in DB, submitted to Meta API)

---

## AREA 4: AI AUTOMATION (T-303 → T-316)

### ⚠️ ALREADY EXISTS — DO NOT RECREATE

Phase 9 voice tickets are **ADDITIVE** (add TTS + multi-turn + alerts). They do NOT replace existing voice infra.

| Layer | File | What It Does | Status |
|-------|------|-------------|--------|
| POS Client | `src/services/voice/voiceClient.ts` (438 lines) | Audio recording via expo-av, upload to backend, intent execution | ✅ WORKING |
| POS Client | `src/services/voice/voicePermissions.ts` (207 lines) | Microphone permissions + audio session config | ✅ WORKING |
| POS Client | `src/components/voice/VoiceButton.tsx` (218 lines) | Push-to-talk FAB with pulse animation | ✅ WORKING |
| POS Client | `src/components/voice/VoiceSheet.tsx` (471 lines) | Bottom sheet: recording → processing → success/error | ✅ WORKING |
| POS Client | `src/screens/SellScanScreen.tsx` | Full state machine: button + sheet + cart integration | ✅ INTEGRATED |
| Backend API | `backend/src/routes/v1/pos/voice.ts` (368 lines) | POST /interpret, /parse, /execute, GET /health | ✅ WORKING |
| AI Service | `backend/src/services/ai/voiceOrderService.ts` (522 lines) | STT → intent parsing → product resolution pipeline | ✅ WORKING |
| AI Provider | `backend/src/services/ai/openaiProvider.ts` (595 lines) | GPT-4o-mini chat + Whisper STT, rate limiting, budget | ✅ PRODUCTION |
| Voice Service | `backend/services/voice-service/` (port 3009) | Standalone microservice with Anthropic Claude STT | ✅ WORKING |
| Feature Flag | `voiceEnabled` | Server-side toggle for voice feature | ✅ ACTIVE |
| E2E Test | `e2e/voiceAddToCart.yaml` | Push-to-talk → record → submit → cart add flow | ✅ DEFINED |

### STT Provider Clarification

**Two STT paths exist** (this is intentional, not a conflict):
1. **Main backend** (`openaiProvider.ts`): Uses OpenAI Whisper — this is the **active path** called by POS app
2. **Voice service** (`sttService.ts`, port 3009): Uses Anthropic Claude multimodal — standalone microservice

The POS app calls `POST /api/v1/voice/interpret` which goes through the main backend → OpenAI Whisper. The voice-service is a separate deployment for future scaling.

### ⚠️ Product Search Prerequisite

`voice.ts` line 72: `registerProductSearch()` returns **EMPTY ARRAY** — documented TODO.

The search endpoint already exists at `storeProducts.ts` line 263. This must be wired before T-306 (multi-turn server-side disambiguation) and T-315 (voice workflows) can work. The POS app currently works around this via client-side product search.

### Existing AI/Voice Codebase Audit

| Component | File | Status |
|-----------|------|--------|
| OpenAI Provider | `backend/src/services/ai/openaiProvider.ts` | GPT-4o-mini, rate limiting, budget guardrails, retry — PRODUCTION GRADE |
| Voice Order Service | `backend/src/services/ai/voiceOrderService.ts` | STT (Whisper) + intent parsing (GPT) — WORKING |
| Ask SuperMandi AI | `backend/src/services/ai/askSuperMandiAI.ts` | Natural language → analytics query — WORKING |
| Voice Routes | `backend/src/routes/v1/pos/voice.ts` | POST /interpret, POST /parse, GET /health — WORKING |
| Product Search | `voice.ts` line 72 | Returns empty array — `TODO: Integrate with store-products/search` |
| Credit Scoring | `backend/src/services/creditScoringService.ts` | GMV + txn count scoring — WORKING |

### Key Packages for AI Tickets

| Package | Purpose | Status |
|---------|---------|--------|
| `expo-speech` | TTS (text-to-speech) built into Expo | ✅ Available, FREE, offline, Hindi support |
| `openai` | GPT-4o-mini for NLU | ✅ Already installed (`openai@^4.x`) |
| `@anthropic-ai/sdk` | Claude for STT | ✅ Already used |
| `simple-statistics` | Basic forecasting (linear regression) | ✅ npm install, no API key |
| `ml-regression-simple-linear` | Linear regression for demand forecasting | ✅ npm install, no API key |

### expo-speech API (Built-in TTS)

```typescript
import * as Speech from 'expo-speech';

// Speak in Hindi
Speech.speak('आपके कार्ट में 2 किलो चावल जोड़ दिया गया', {
  language: 'hi-IN',
  rate: 0.9,
  onDone: () => console.log('Speech finished'),
});

// Speak in English
Speech.speak('Added 2 kg rice to your cart', { language: 'en-IN' });

// Check if speaking
const isSpeaking = await Speech.isSpeakingAsync();

// Stop speaking
Speech.stop();
```

**Key facts about expo-speech**:
- ✅ Built into Expo SDK — no install needed
- ✅ Works offline (uses device TTS engine)
- ✅ Hindi (`hi-IN`), English (`en-IN`), Marathi (`mr-IN`), Gujarati (`gu-IN`), Tamil (`ta-IN`) supported
- ✅ FREE — no API charges
- ✅ No permission needed
- Rate control, pitch control, volume control available

### Per-Ticket Guide (CORRECTED — matches STAGING_TICKETS.md source of truth)

#### T-303: AI onboarding assistant ✅ CAN CODE NOW
- **Depends on**: T-305 (TTS) for spoken prompts
- **Action**: First-time flow: AI walks through store setup → first product → first sale
- **Pattern**: Guided wizard with TTS prompts at each step. Detect "first-time retailer" via empty store_products count.
- **Files**: New wizard component + `VoiceSheet.tsx` integration for spoken guidance

#### T-304: Hindi NLU expansion (Marathi, Gujarati, Tamil) ✅ CAN CODE NOW
- **What exists**: `voiceOrderService.ts` defaults to Hindi/Hinglish (system prompt lines 150-186)
- **Action**: Add regional number words (Marathi: ek/don/teen, Gujarati: ek/be/tran, Tamil: onnu/rendu/moonu) + product aliases to NLU system prompt
- **Files**: `backend/src/services/ai/voiceOrderService.ts` (expand VOICE_ORDER_SYSTEM_PROMPT)

#### T-305: Voice TTS response (AI speaks back) ✅ CAN CODE NOW
- **Package**: `expo-speech` (built into Expo, FREE, offline, no install needed)
- **Action**: In `src/components/voice/VoiceSheet.tsx`, after voice command processed, call `Speech.speak(responseText, { language: locale === 'hi' ? 'hi-IN' : 'en-IN' })`
- **No API key needed**. No new packages. Add `import * as Speech from 'expo-speech'` to VoiceSheet.
- **PREREQUISITE for**: T-303, T-306, T-310, T-315

#### T-306: Multi-turn voice conversation ✅ CAN CODE NOW
- **Depends on**: T-305 (TTS for spoken clarifications), product search wired (`voice.ts:72`)
- **Action**: Add conversation context to `voiceOrderService.ts`. Track last intent + product mentions. When ambiguous ("which one?"), system asks clarifying question via TTS.
- **Pattern**: State machine: IDLE → LISTENING → PROCESSING → CLARIFYING → CONFIRMING → DONE
- **Key change**: Add `VoiceSession` type with `previousActions[]`, `contextWindow[]`, `sessionId`. Store in-memory Map with 10-min TTL.
- **PREREQUISITE for**: T-315 (voice workflows)

#### T-307: Proactive AI alerts (push) ✅ CAN CODE NOW
- **What exists**: FCM push service (`fcmService.ts` — COMPLETE), stock monitor (reorder-service), credit scoring
- **Action**: Daily cron (9 PM IST, offset from stock monitor at minute 0) generates alerts: low stock, expiring items, overdue payments. Sends via `sendAndPersistNotification()`.
- **Pattern**: `node-cron` schedule → query conditions → dedup via Redis TTL → FCM push

#### T-308: Demand forecasting engine ✅ CAN CODE NOW
- **npm**: `simple-statistics` (45KB, no API key)
- **Action**: Query last 4 weeks of daily sales per SKU → weighted moving average with day-of-week adjustment → predict next 7 days
- **Pattern**: `SELECT product_id, DATE(created_at), SUM(quantity) FROM sale_items WHERE store_id=$1 GROUP BY 1,2`
- **New file**: `backend/src/services/analytics/demandForecast.ts`
- **PREREQUISITE for**: T-309 (smart reorder)

#### T-309: Smart reorder suggestions (forecast-driven) ✅ CAN CODE NOW
- **Depends on**: T-308 (forecasting)
- **What exists**: Reorder stock monitor, product policies
- **Action**: Enhance: `suggested_qty = demand_forecast_7d + buffer_days * avg_daily - current_stock`

#### T-310: Auto daily closing summary ✅ CAN CODE NOW
- **What exists**: `getDailySummary()` endpoint returns sales totals
- **Action**: Evening cron (9 PM IST) → generate summary → push notification + TTS readout option (uses T-305 expo-speech)

#### T-311: Supplier price comparison ✅ CAN CODE NOW
- **What exists**: `catalog.supplier_products` with `purchase_price_minor`
- **Action**: At PO creation, query all suppliers for same product → show "Supplier B is ₹X cheaper"

#### T-312: Customer purchase insights ✅ CAN CODE NOW
- **What exists**: `platform.customer_profiles`, `orders.sale_items`
- **Action**: Aggregate top 10 customers by value, inactive customers (7+ days)

#### T-313: Slow mover detection ✅ CAN CODE NOW
- **Action**: Query items with <2 sales in last 30 days → flag → suggest discount/discontinue
- **New file**: `backend/src/services/analytics/slowMoverDetector.ts`

#### T-314: Expiry tracking alerts ✅ CAN CODE NOW
- **What exists**: `expiry_date` column on `purchase_order_items` (T-144)
- **Action**: Daily cron checks items expiring in 30/15/7 days → push alert → suggest markdown
- **No API key needed** — pure backend + FCM push

#### T-315: Voice-driven full workflow ✅ CAN CODE NOW
- **Depends on**: T-305 (TTS) + T-306 (multi-turn) + product search wired
- **Action**: "Place reorder for all low stock items" → AI shows list → user confirms → POs created
- **Pattern**: Multi-step voice flow using T-306 conversation state machine

#### T-316: Anomaly detection ✅ CAN CODE NOW
- **npm**: `simple-statistics` for z-score calculation (same as T-308)
- **Action**: Compare today's metrics vs rolling 30-day average. If >2 std deviations → alert.
- **New file**: `backend/src/services/analytics/anomalyDetector.ts`
- **No API key needed** — pure backend math

---

## EXECUTION PRIORITY — WHAT TO START NOW

### WAVE A: Start Immediately (✅ CAN CODE NOW) — 44 tickets

| Category | Tickets | What |
|----------|---------|------|
| UPI Core | T-253, T-254, T-255, T-258-T-262 | Webhook wiring, UPI tracking, UTR verify, payout retry, refund, reconciliation, QR timer, outbox |
| BNPL Platform | T-263, T-274-T-282, T-287-T-290 | Abstraction layer, UI, tracking, dashboards, comparison |
| Chat | T-291-T-295, T-297-T-302 | Schema, API, Socket.io, POS/Supplier chat, WhatsApp receipt/alerts, FCM, templates |
| AI Core (Wave E) | T-305, T-306, T-307, T-310 | TTS (expo-speech) → multi-turn → alerts → daily closing |
| AI Intelligence (Wave H) | T-308, T-309, T-311, T-312 | Forecasting → smart reorder → price compare → insights |
| AI Polish (Wave I) | T-313, T-314, T-303, T-316, T-304 | Slow mover → expiry → onboarding → anomaly → Hindi NLU |
| AI Voice (Wave H) | T-315 | Voice-driven workflows (depends on T-305 + T-306) |

### WAVE B: Needs API Keys Only (⚠️) — 3 tickets

| Ticket | Provider | What Operator Must Do |
|--------|----------|----------------------|
| T-254 | Razorpay | Sign up → get API keys (test mode) |
| T-256 | RazorpayX | Contact Razorpay sales → get RazorpayX account |
| T-273 | Cashfree EL | Sign up at cashfree.com → sandbox credentials |
| T-296 | Meta WhatsApp | Create app at developers.facebook.com |

### WAVE C: Needs Partnership (🔑) — 13 tickets

| Tickets | Providers | Action |
|---------|-----------|--------|
| T-264 | Rupifi | Apply at rupifi.com/partners |
| T-265, T-283 | KredX | Apply at kredx.com |
| T-266 | Mintifi | Contact mintifi.com |
| T-267 | Trevex | Contact trevex.io |
| T-268 | Lendingkart | Contact → SPOC → UAT credentials |
| T-269 | FlexiLoans | Apply at flexiloans.com/partners |
| T-270 | Progcap | Contact progcap.com |
| T-271 | NeoGrowth | Contact neogrowth.in |
| T-272 | Finova Capital | Contact Jaipur HQ |
| T-284 | M1xchange | TReDS registration |
| T-285 | Vayana | Contact vayana.com |
| T-286 | Credlix | Contact credlix.com |

---

## OPERATOR ACTION ITEMS (Sorted by Priority)

### P0 — Do This Week
1. **Razorpay**: Sign up/activate account → get test API keys → share with Claude
2. **Meta WhatsApp**: Create developer app at developers.facebook.com → get test phone number

### P1 — Do This Month
3. **Cashfree Embedded Lending**: Sign up at cashfree.com → sandbox API keys
4. **Lendingkart**: Contact partnership team → request UAT credentials (documented sandbox)
5. **Rupifi**: Apply at developers.rupifi.com for BNPL API access

### P2 — Do When Ready
6. **KredX, Mintifi, Trevex**: Contact each for channel finance API partnership
7. **Progcap, FlexiLoans, NeoGrowth, Finova**: Contact for credit line API access
8. **M1xchange, Vayana, Credlix**: Contact for supplier-side invoice discounting API access

---

## SUMMARY STATS

| Category | Total Tickets | ✅ Can Code Now | ⚠️ Needs Keys | 🔑 Needs Partnership | 🔧 Existing Code |
|----------|--------------|-----------------|----------------|----------------------|-------------------|
| UPI (Razorpay) | 10 | 5 | 2 | 0 | 3 |
| B2B Finance | 28 | 14 | 1 | 13 | 0 |
| WhatsApp + Chat | 12 | 8 | 3 | 0 | 1 |
| AI Automation | 14 | 14 | 0 | 0 | 0 |
| **TOTAL** | **64** | **41** | **6** | **13** | **4** |

> **Bottom line**: **41 of 64 tickets (64%) can be coded immediately** with no external dependencies. VS Code Claude should start with these.
