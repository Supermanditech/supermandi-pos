# SuperMandi POS — Full System Audit Report

> HEAD: b318d935 | 105 fixes | Zero drift | 2026-03-17
> Source of truth: https://supermanditech.github.io/supermandi-pos/RELEASES/supermandi-pos-v3.html

## Section 1: Full System Audit

| Layer | Count | Status |
|-------|-------|--------|
| v3 Screens | 25 | COMPLETE |
| v3 Components | 15 | COMPLETE |
| POS Backend Routes | 41 | COMPLETE |
| Admin Backend Routes | 37 | COMPLETE |
| DB Schemas | 16 | COMPLETE |
| DB Tables | 173 | COMPLETE |
| Migrations | 196 (190+191 pending apply) | CODE COMPLETE |
| Zustand Stores | 14 | COMPLETE |
| Frontend Services | 78 | COMPLETE |
| Backend Services | 62 | COMPLETE |
| Frontend Tests | 243 | PRESENT |
| Backend Tests | 102 | PRESENT |

**GAPS:**
- AUDIT-001: Migrations 190+191 not applied to staging DB (needs GCP deploy)
- AUDIT-002: TypeScript passes (0 errors), backend typecheck passes

## Section 2: Product Ledger and Metadata Sync

### Schema Coverage
| Field | catalog.products | catalog.store_products | catalog.supplier_products |
|-------|-----------------|----------------------|--------------------------|
| Name | name | display_name | name |
| Category | category | (via product) | category |
| Brand | brand | brand | brand |
| Unit | unit | (via product) | unit |
| Pack Size | (via net_content) | (via product) | pack_size |
| Barcode | primary_barcode | (via store_product_barcodes) | barcode |
| HSN Code | hsn_code (migration 135) | - | - |
| GST Rate | default_gst_rate | - | - |
| MRP | - | mrp | mrp |
| Sell Price | - | sell_price | - |
| Purchase Price | - | purchase_price | purchase_price |
| Image | image_url | (via product) | - |
| Stock | - | current_stock | stock_quantity |

### Ledger (Append-Only)
- `inventory.inventory_ledger`: append-only transaction log
- `inventory.stock_balances`: materialized read model (updated via events)
- `inventory.event_inbox` + `event_outbox`: event sourcing pattern

**GAPS:**
- AUDIT-003: CSV upload for bulk product import (Retailer Web has UI, backend route exists)
- AUDIT-004: SuperMandi barcode generation (barcodes table exists, generation service exists)

**STATUS: COMPLETE** - All required fields exist across tables

## Section 3: Supplier -> SuperAdmin -> Retailer SKU Flow

### Current Flow
1. Supplier registers at Supplier Portal -> supplier.suppliers
2. Supplier uploads KYC docs -> supplier.kyc_documents
3. Supplier lists products -> catalog.supplier_products
4. SuperAdmin reviews at SuperAdmin Panel -> admin routes
5. SuperAdmin approves supplier (verification_status = verified)
6. Approved supplier products visible in retailer BUY tab via catalog API
7. Retailer purchases -> creates PO -> supplier fulfills -> GRN

### Route Coverage
| Step | Route | Status |
|------|-------|--------|
| Supplier register | POST /api/v1/supplier/register | EXISTS |
| Supplier list products | POST /api/v1/supplier/products | EXISTS |
| Admin view suppliers | GET /api/v1/admin/suppliers | EXISTS |
| Admin approve supplier | PATCH /api/v1/admin/suppliers/:id | EXISTS |
| Retailer browse catalog | GET /api/v1/catalog | EXISTS |
| Retailer create PO | POST /api/v1/orders | EXISTS |

**GAPS:**
- AUDIT-005: SKU-level approval (currently supplier-level, not per-SKU)
- AUDIT-006: Bulk SKU upload by supplier (1500-3000 SKUs) — CSV import exists but not stress-tested

## Section 4: SuperAdmin Pricing Control

### Current State
- Analytics margin route: GET /api/v1/admin/analytics/margins (read-only)
- No margin OVERRIDE route exists for SuperAdmin to set margins before publishing

**GAPS:**
- AUDIT-007: SuperAdmin margin control — need admin route to set % or fixed margin per SKU before publishing to retailers
- AUDIT-008: Margin application to final retailer purchase price

## Section 5-6: Retailer POS SKU Availability + 5000 Capacity

### Current Limits
- Store products search: limit 100 per query (configurable)
- Product grid shows first 30 (v3 SellScreen)
- FlatList with removeClippedSubviews + windowSize=5 for performance
- DB: No hard limit on store_products per store (UUID FK, indexed)

**GAPS:**
- AUDIT-009: Product grid pagination — currently loads 30, needs infinite scroll for 5000+
- AUDIT-010: DB index verification for 5000+ products per store performance

## Section 7: POS Performance and Device Compatibility

### Current State
- FlatList virtualization: removeClippedSubviews + windowSize=5
- 3-column grid optimized for mobile screens
- Expo SDK 52 supports Android 6.0+ (API 23+)
- HID scanner: 15s timeout, camera: 45s idle

**GAPS:**
- AUDIT-011: No load testing done for 10K scan-to-cart/day
- AUDIT-012: No multi-device testing (only tested on Redmi)

## Section 8: Authentication Flow Validation

### Current Flow
1. Retailer registers on Retailer Web (auth.users + platform.stores)
2. SuperAdmin approves store (status = ACTIVE)
3. POS App: Phone -> OTP (via WhatsApp) -> session token -> POS access
4. Multi-store: If >1 store, StoreSelectScreenV3 shown
5. Session persisted to SecureStore (deviceToken)

### Route Coverage
| Route | Status |
|-------|--------|
| POST /api/v1/pos/auth/send-otp | EXISTS (V3-035) |
| POST /api/v1/pos/auth/verify-otp | EXISTS (V3-035) |
| OTP delivery via WhatsApp | EXISTS (V3-057) |
| Token validation middleware | EXISTS (requireDeviceToken) |
| Session persistence | EXISTS (saveDeviceSession) |

**STATUS: COMPLETE** - No gaps

## Section 9: Ledger Integrity and Sync

### Architecture
- **inventory.inventory_ledger**: Append-only, immutable transaction log
- **inventory.stock_balances**: Materialized view (updated via ledger events)
- **Event sourcing**: inventory.event_inbox + event_outbox
- **Idempotency**: inventory.idempotency_keys prevents duplicate transactions
- **Offline sync**: POS outbox queue (AsyncStorage) -> sync when online

### Sync Coverage
| Direction | Mechanism | Status |
|-----------|-----------|--------|
| POS -> Backend | Outbox queue + syncService | EXISTS |
| Backend -> POS | productsStore.loadProducts() on app foreground | EXISTS |
| Retailer Web -> Backend | Direct API calls | EXISTS |
| Backend -> Retailer Web | Direct API reads | EXISTS |

**GAPS:**
- AUDIT-013: No real-time push sync (relies on polling/pull)
- AUDIT-014: Conflict resolution strategy not documented (last-write-wins assumed)

## Section 10: Payments and WhatsApp Integration

### WhatsApp
| Feature | Status |
|---------|--------|
| WhatsApp Business API configured | YES (GCP Secret Manager) |
| sendTextMessage | EXISTS |
| sendTemplateMessage | EXISTS |
| sendBillReceipt | EXISTS |
| OTP delivery via WhatsApp | EXISTS (V3-057) |
| Webhook handler | EXISTS |

### UPI Payment
| Feature | Status |
|---------|--------|
| QR generation (upi://pay URL) | EXISTS |
| Dynamic QR per sale | EXISTS (linked to sale + VPA) |
| Payment goes to retailer VPA | YES (no intermediary) |
| UPI intent deep link | EXISTS |
| Manual UTR confirmation | EXISTS |
| Split payment | EXISTS (V3-061) |

**STATUS: COMPLETE** - No critical gaps

---

## Summary: All Gaps as Tickets

### CRITICAL (blocks go-live)
| Ticket | Section | Description |
|--------|---------|-------------|
| AUDIT-001 | S1 | Apply migrations 190+191 to staging DB (needs GCP deploy) |
| AUDIT-007 | S4 | SuperAdmin margin control — % or fixed margin per SKU before publish |
| AUDIT-008 | S4 | Margin application reflected in retailer purchase price |

### HIGH (important for production)
| Ticket | Section | Description |
|--------|---------|-------------|
| AUDIT-005 | S3 | SKU-level approval in SuperAdmin (currently supplier-level only) |
| AUDIT-009 | S5 | Product grid infinite scroll for 5000+ SKUs |
| AUDIT-013 | S9 | Real-time push sync (WebSocket or Server-Sent Events) |

### MEDIUM (should have)
| Ticket | Section | Description |
|--------|---------|-------------|
| AUDIT-006 | S3 | Stress test bulk supplier SKU upload (1500-3000) |
| AUDIT-010 | S6 | DB index verification for 5000+ products |
| AUDIT-011 | S7 | Load testing for 10K scans/day |
| AUDIT-012 | S7 | Multi-device testing (beyond Redmi) |
| AUDIT-014 | S9 | Document conflict resolution strategy |

### LOW (nice to have)
| Ticket | Section | Description |
|--------|---------|-------------|
| AUDIT-003 | S2 | Verify CSV bulk product import works end-to-end |
| AUDIT-004 | S2 | Verify SuperMandi barcode generation |

---

## Verdict

| Section | Status |
|---------|--------|
| S1: System | COMPLETE |
| S2: Product Metadata | COMPLETE |
| S3: Supplier Flow | COMPLETE (1 gap: per-SKU approval) |
| S4: Pricing Control | GAP — margin control route needed |
| S5-6: Capacity | GAP — pagination for 5000+ |
| S7: Performance | NEEDS TESTING |
| S8: Auth | COMPLETE |
| S9: Ledger | COMPLETE (docs needed) |
| S10: Payments + WhatsApp | COMPLETE |

**3 CRITICAL, 3 HIGH, 5 MEDIUM, 2 LOW = 13 total audit tickets**
