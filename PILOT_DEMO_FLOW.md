# SuperMandi POS — Pilot / Demo Flow (Cloud Observability)

Backend base URL: `http://34.14.150.183:3001`

SuperAdmin dashboard (local dev): `http://localhost:5173/`

## Goal

Run a story-driven demo where every key step in a retail checkout is visible as live events in SuperAdmin.

## Demo Story (recommended)

1) **Device comes online**
2) **Items scanned**
3) **Items added/removed from cart**
4) **Bill generated**
5) **UPI QR created**
6) **Payment pending → confirmed**
7) **Receipt printed (or print error)**
8) **SuperAdmin reconciliation: group by transactionId / billId**

## Required Setup

1) POS app config points to cloud backend:
   - [`app.json`](app.json:16) → `expo.extra.API_URL = http://34.14.150.183:3001`

2) Backend is running (PM2) and DB is configured:
   - `POST /api/v1/pos/events`
   - `GET /api/v1/admin/pos/events?limit=N`

3) SuperAdmin has `VITE_API_BASE_URL=http://34.14.150.183:3001`.

## What to Show in SuperAdmin

### A) Live stream

Open **Events** tab; confirm "Backend: healthy".

### B) Grouping

Set **Group by: transactionId**.

This lets you show a full payment lifecycle per sale.

### C) Payments

Open **Payments** tab; filter `PAYMENT_`.

## Sample Event Payloads (reference)

> The backend stores: `deviceId`, `storeId`, `eventType`, `payload` (JSON), `createdAt`.
> The POS logger also includes in payload: `eventId`, `createdAt`, `appVersion`.

### Device online / app start

```json
{
  "deviceId": "pos-redmi-01",
  "storeId": "store-1",
  "eventType": "APP_START",
  "payload": {
    "screen": "Splash",
    "appVersion": "1.0.1"
  }
}
```

### Scan barcode

```json
{
  "eventType": "SCAN_BARCODE",
  "payload": {
    "barcode": "0987654321",
    "source": "camera"
  }
}
```

### Add/remove cart

```json
{
  "eventType": "ADD_TO_CART",
  "payload": {
    "productId": "123",
    "name": "Test Barcode Product",
    "quantity": 1,
    "priceMinor": 1500,
    "currency": "INR",
    "barcode": "0987654321"
  }
}
```

```json
{
  "eventType": "REMOVE_FROM_CART",
  "payload": {
    "productId": "123",
    "name": "Test Barcode Product",
    "quantity": 1
  }
}
```

### Payment lifecycle (UPI / QR)

All payment events include `transactionId`.

```json
{
  "eventType": "PAYMENT_INIT",
  "payload": {
    "transactionId": "tx-1700000000000-abc",
    "billId": "123456",
    "paymentMode": "UPI",
    "amountMinor": 2500,
    "currency": "INR",
    "itemCount": 2
  }
}
```

```json
{
  "eventType": "PAYMENT_QR_CREATED",
  "payload": {
    "transactionId": "tx-1700000000000-abc",
    "billId": "123456",
    "retailerUpiId": "sharmakirana@upi",
    "amountMinor": 2500,
    "currency": "INR"
  }
}
```

```json
{
  "eventType": "PAYMENT_PENDING",
  "payload": {
    "transactionId": "tx-1700000000000-abc",
    "billId": "123456"
  }
}
```

```json
{
  "eventType": "PAYMENT_CONFIRMED",
  "payload": {
    "transactionId": "tx-1700000000000-abc",
    "billId": "123456"
  }
}
```

### Printer error

```json
{
  "eventType": "PRINTER_ERROR",
  "payload": {
    "transactionId": "tx-1700000000000-abc",
    "billId": "123456",
    "reason": "paper_not_available"
  }
}
```

## Suggested Demo Script (talk track)

1) "This is the live SuperAdmin dashboard, connected to the cloud backend." (show green health)
2) "When the handheld POS comes online, we see APP_START." (filter by device)
3) "Every scan is logged." (scan test barcode; show SCAN_BARCODE)
4) "Cart changes are visible." (ADD_TO_CART / REMOVE_FROM_CART)
5) "For UPI, we log a full lifecycle: QR created → pending → confirmed." (filter PAYMENT_)
6) "We can group all events by transactionId for reconciliation." (Group by transactionId)
7) "Printer failures are visible instantly to operations." (PRINTER_ERROR)

