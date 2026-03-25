#!/usr/bin/env bash
# GCP-STG-0635: DPDPA Data Export Documentation
# Documents the data export capability for Digital Personal Data Protection Act compliance.
set -euo pipefail

cat <<'DOCS'
=============================================================
  DPDPA Data Export — Right to Access Implementation Guide
=============================================================

The Digital Personal Data Protection Act (DPDPA) 2023 grants data
principals the right to obtain a summary of their personal data.

1. TABLES CONTAINING PERSONAL DATA

   Schema: auth
   - auth.users         — email, phone, name, role, created_at
   - auth.user_sessions — session tokens, IP addresses, device info

   Schema: platform
   - platform.stores    — store name, address, GSTIN, owner details
   - platform.devices   — device tokens, push notification tokens

   Schema: pos
   - pos.pos_devices    — device ID, store association, last active

   Schema: orders
   - orders.sales       — transaction records, payment details
   - orders.sale_items  — purchased items (linked to sales)
   - orders.payments    — payment method, amount, UPI reference

   Schema: supplier
   - supplier.applications — business name, contact, bank details

2. SQL QUERIES FOR DATA EXPORT

   -- Export all data for a specific user (by userId)
   SELECT * FROM auth.users WHERE id = :userId;
   SELECT * FROM auth.user_sessions WHERE user_id = :userId;

   -- Export all data for a specific store (by storeId)
   SELECT * FROM platform.stores WHERE id = :storeId;
   SELECT * FROM pos.pos_devices WHERE store_id = :storeId;
   SELECT * FROM orders.sales WHERE store_id = :storeId;
   SELECT s.*, si.* FROM orders.sales s
     JOIN orders.sale_items si ON si.sale_id = s.id
     WHERE s.store_id = :storeId;
   SELECT * FROM orders.payments WHERE sale_id IN (
     SELECT id FROM orders.sales WHERE store_id = :storeId
   );

   -- Export supplier data
   SELECT * FROM supplier.applications WHERE user_id = :userId;

3. API ENDPOINT (to be implemented)

   POST /api/v1/admin/data-export/:userId
   Authorization: Bearer <admin-token>
   Response: {
     "status": "processing",
     "exportId": "exp-uuid",
     "estimatedCompletionMs": 30000
   }

   GET /api/v1/admin/data-export/:exportId/download
   Response: application/json (or CSV)

4. EXPORT FORMAT
   - JSON preferred (machine-readable)
   - Include all tables listed above
   - Exclude: password hashes, internal IDs (replace with pseudonyms)
   - Include: timestamps in ISO 8601 format
   - File naming: dpdpa-export-<userId>-<date>.json

5. IMPLEMENTATION NOTES
   - Export must complete within 30 days (DPDPA requirement)
   - Log all export requests in audit trail
   - Notify data principal when export is ready
   - Large exports should be async (queue-based)
   - Superadmin-only access to trigger exports

6. AUDIT TRAIL
   Every export request must be logged:
   - Who requested (admin userId)
   - For whom (target userId)
   - When (timestamp)
   - What was exported (table list)
   - Export format and size
=============================================================
DOCS

echo "This is a documentation script — no runtime changes."
echo "Implement the API endpoint when DPDPA compliance audit requires it."
