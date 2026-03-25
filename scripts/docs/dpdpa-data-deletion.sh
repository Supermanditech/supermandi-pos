#!/usr/bin/env bash
# GCP-STG-0636: DPDPA Data Deletion Documentation
# Documents right to erasure implementation for DPDPA compliance.
set -euo pipefail

cat <<'DOCS'
=============================================================
  DPDPA Data Deletion — Right to Erasure Implementation Guide
=============================================================

The Digital Personal Data Protection Act (DPDPA) 2023 grants data
principals the right to erasure of their personal data, subject to
legal retention requirements.

1. DELETION STRATEGY: SOFT-DELETE vs HARD-DELETE

   SOFT-DELETE (anonymize PII, retain record structure):
   - orders.sales           — anonymize customer info, keep for GST/tax audit
   - orders.payments        — anonymize UPI refs, keep amount for ledger
   - supplier.applications  — anonymize contact, keep for audit trail

   HARD-DELETE (remove entirely):
   - auth.user_sessions     — no retention requirement
   - platform.devices       — push tokens have no audit value
   - pos.pos_devices        — device records can be fully removed

   RETAIN (cannot delete — legal/tax requirement):
   - GST invoices           — 6-year retention (GST Act)
   - Financial transactions — 8-year retention (Companies Act)

2. CASCADE DEPENDENCIES

   Before deleting a user, handle these cascades:

   auth.users (target)
     └── auth.user_sessions   → HARD DELETE
     └── platform.stores      → ANONYMIZE (if sole owner)
         └── pos.pos_devices   → HARD DELETE
         └── orders.sales      → ANONYMIZE
             └── orders.sale_items → RETAIN (for GST)
             └── orders.payments   → ANONYMIZE
             └── orders.ledger     → RETAIN (for accounting)

3. ANONYMIZATION SQL PROCEDURE

   -- Step 1: Anonymize user record
   UPDATE auth.users SET
     email = '[DELETED]-' || id || '@deleted.local',
     phone = '[DELETED]',
     name = '[DELETED]',
     password_hash = '[DELETED]',
     deleted_at = NOW(),
     is_active = false
   WHERE id = :userId;

   -- Step 2: Remove sessions
   DELETE FROM auth.user_sessions WHERE user_id = :userId;

   -- Step 3: Anonymize store (if sole owner)
   UPDATE platform.stores SET
     owner_name = '[DELETED]',
     owner_phone = '[DELETED]',
     owner_email = '[DELETED]'
   WHERE owner_user_id = :userId;

   -- Step 4: Remove device tokens
   DELETE FROM platform.devices WHERE user_id = :userId;
   DELETE FROM pos.pos_devices WHERE store_id IN (
     SELECT id FROM platform.stores WHERE owner_user_id = :userId
   );

   -- Step 5: Anonymize sales (keep amounts for GST)
   UPDATE orders.sales SET
     customer_name = '[DELETED]',
     customer_phone = '[DELETED]'
   WHERE store_id IN (
     SELECT id FROM platform.stores WHERE owner_user_id = :userId
   );

   -- Step 6: Anonymize payments (keep amounts)
   UPDATE orders.payments SET
     upi_reference = '[DELETED]',
     card_last_four = '[DELETED]'
   WHERE sale_id IN (
     SELECT s.id FROM orders.sales s
     JOIN platform.stores st ON st.id = s.store_id
     WHERE st.owner_user_id = :userId
   );

4. API ENDPOINT (to be implemented)

   POST /api/v1/admin/data-deletion/:userId
   Authorization: Bearer <admin-token>
   Body: { "reason": "user_request", "confirmDelete": true }
   Response: {
     "status": "processing",
     "deletionId": "del-uuid",
     "retainedRecords": ["GST invoices", "ledger entries"],
     "anonymizedTables": ["users", "stores", "sales", "payments"]
   }

5. VERIFICATION AFTER DELETION
   - Query all tables for userId — should return [DELETED] or empty
   - Verify sessions are removed
   - Verify device tokens are removed
   - Confirm retained records have no PII
   - Log deletion in audit trail (who, when, what was deleted)

6. IMPLEMENTATION NOTES
   - Deletion must complete within 30 days (DPDPA requirement)
   - Must notify user when deletion is complete
   - Superadmin-only access to trigger deletions
   - Wrap in transaction — rollback if any step fails
   - Keep deletion audit log for 3 years (accountability)
=============================================================
DOCS

echo "This is a documentation script — no runtime changes."
echo "Implement the deletion API when DPDPA compliance audit requires it."
