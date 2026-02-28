// SM-005: Supplier Profile Routes
// Get and update supplier profile

import { Router, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";
import { validatePinCode, validateEmail, validatePhone } from "@supermandi/common";
import { log } from "../../../lib/logger";

const router = Router();

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/supplier/profile
 * Get supplier profile
 */
router.get("/profile", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // GL-WF-034: Include email_verified in profile query
    const result = await pool.query(
      `SELECT
        id,
        primary_email as email,
        business_name,
        trade_name,
        gstin,
        pan,
        primary_contact_name as contact_name,
        primary_phone as phone,
        address_line1 as address,
        city,
        state,
        pincode,
        verification_status,
        email_verified,
        status,
        rating,
        bank_account_number,
        bank_ifsc,
        bank_account_name,
        bank_name,
        bank_verification_status,
        created_at
      FROM supplier.suppliers
      WHERE id = $1`,
      [req.supplierId]
    );

    const supplier = result.rows[0];
    if (!supplier) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Supplier not found' }
      });
      return;
    }

    res.json({
      data: {
        id: supplier.id,
        email: supplier.email,
        businessName: supplier.business_name,
        tradeName: supplier.trade_name,
        gstin: supplier.gstin,
        pan: supplier.pan,
        contactName: supplier.contact_name,
        phone: supplier.phone,
        address: supplier.address,
        city: supplier.city,
        state: supplier.state,
        pincode: supplier.pincode,
        verificationStatus: supplier.verification_status,
        emailVerified: supplier.email_verified || false, // GL-WF-034
        status: supplier.status,
        rating: parseFloat(supplier.rating),
        // STG-088: Include bankName in response
        bankDetails: supplier.bank_account_number ? {
          accountNumber: supplier.bank_account_number,
          ifscCode: supplier.bank_ifsc,
          accountName: supplier.bank_account_name,
          bankName: supplier.bank_name || null,
        } : null,
        bankVerificationStatus: supplier.bank_verification_status || 'pending',
        createdAt: supplier.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/supplier/profile
 * Update supplier profile
 */
router.patch("/profile", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      contactName,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      tradeName,
      bankDetails,
    } = req.body;

    // GO-LIVE-155: Validate PIN code format (6 digits, numeric only)
    if (pincode !== undefined && pincode !== null) {
      const pincodeValidation = validatePinCode(pincode);
      if (!pincodeValidation.valid) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: pincodeValidation.error }
        });
        return;
      }
    }

    // GO-LIVE-153: Validate email format
    if (email !== undefined && email !== null) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.valid) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: emailValidation.error }
        });
        return;
      }
    }

    // GO-LIVE-154: Validate phone format
    if (phone !== undefined && phone !== null) {
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.valid) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: phoneValidation.error }
        });
        return;
      }
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: (string | null)[] = [];
    let paramIndex = 1;

    if (contactName !== undefined) {
      updates.push(`primary_contact_name = $${paramIndex++}`);
      values.push(contactName);
    }
    if (email !== undefined) {
      updates.push(`primary_email = $${paramIndex++}`);
      values.push(email.toLowerCase());
    }
    if (phone !== undefined) {
      updates.push(`primary_phone = $${paramIndex++}`);
      values.push(phone);
    }
    if (address !== undefined) {
      updates.push(`address_line1 = $${paramIndex++}`);
      values.push(address);
    }
    if (city !== undefined) {
      updates.push(`city = $${paramIndex++}`);
      values.push(city);
    }
    if (state !== undefined) {
      updates.push(`state = $${paramIndex++}`);
      values.push(state);
    }
    if (pincode !== undefined) {
      updates.push(`pincode = $${paramIndex++}`);
      values.push(pincode);
    }
    if (tradeName !== undefined) {
      updates.push(`trade_name = $${paramIndex++}`);
      values.push(tradeName);
    }
    // SA-P1-008: Track whether bank fields are changing for re-verification
    let bankFieldsChanging = false;
    let oldBankDetails: { account_number: string | null; ifsc: string | null; account_name: string | null; status: string } | null = null;

    if (bankDetails !== undefined) {
      // Fetch current bank details to detect actual changes
      const currentRes = await pool.query(
        `SELECT bank_account_number as account_number, bank_ifsc as ifsc, bank_account_name as account_name, bank_verification_status as status
         FROM supplier.suppliers WHERE id = $1`,
        [req.supplierId]
      );
      oldBankDetails = currentRes.rows[0] || null;

      if (bankDetails.accountNumber !== undefined) {
        if (oldBankDetails && bankDetails.accountNumber !== oldBankDetails.account_number) {
          bankFieldsChanging = true;
        }
        updates.push(`bank_account_number = $${paramIndex++}`);
        values.push(bankDetails.accountNumber);
      }
      if (bankDetails.ifscCode !== undefined) {
        const normalized = bankDetails.ifscCode?.toUpperCase();
        if (oldBankDetails && normalized !== oldBankDetails.ifsc) {
          bankFieldsChanging = true;
        }
        updates.push(`bank_ifsc = $${paramIndex++}`);
        values.push(normalized);
      }
      if (bankDetails.accountName !== undefined) {
        if (oldBankDetails && bankDetails.accountName !== oldBankDetails.account_name) {
          bankFieldsChanging = true;
        }
        updates.push(`bank_account_name = $${paramIndex++}`);
        values.push(bankDetails.accountName);
      }
      // STG-088: Handle bankName in update
      if (bankDetails.bankName !== undefined) {
        updates.push(`bank_name = $${paramIndex++}`);
        values.push(bankDetails.bankName);
      }

      // SA-P1-008: If bank fields actually changed, trigger re-verification
      if (bankFieldsChanging) {
        updates.push(`bank_verification_status = 'pending'`);
        updates.push(`bank_verified_at = NULL`);
      }
    }

    if (updates.length === 0) {
      res.status(400).json({
        error: { code: 'NO_UPDATES', message: 'No fields to update' }
      });
      return;
    }

    values.push(req.supplierId!);

    const result = await pool.query(
      `UPDATE supplier.suppliers
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING
         id,
         primary_email as email,
         business_name,
         trade_name,
         gstin,
         primary_contact_name as contact_name,
         primary_phone as phone,
         address_line1 as address,
         city,
         state,
         pincode,
         verification_status,
         bank_account_number,
         bank_ifsc,
         bank_account_name,
         bank_name,
         bank_verification_status`,
      values
    );

    const supplier = result.rows[0];

    // SA-P1-008: Log bank change to approval_logs for audit trail
    if (bankFieldsChanging && oldBankDetails) {
      try {
        await pool.query(
          `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, changes, reason, actor_id)
           VALUES ('bank_change', $1, 'submit', $2, 'pending', $3, 'Supplier updated bank details', $1)`,
          [
            req.supplierId,
            oldBankDetails.status || 'pending',
            JSON.stringify({
              old: { account_number: oldBankDetails.account_number, ifsc: oldBankDetails.ifsc, account_name: oldBankDetails.account_name },
              new: { account_number: supplier.bank_account_number, ifsc: supplier.bank_ifsc, account_name: supplier.bank_account_name },
            }),
          ]
        );
      } catch (logErr) {
        // Audit log failure should not block the profile update
        log.error("[SA-P1-008] Failed to log bank change:", (logErr as Error).message);
      }
    }

    res.json({
      data: {
        id: supplier.id,
        email: supplier.email,
        businessName: supplier.business_name,
        tradeName: supplier.trade_name,
        gstin: supplier.gstin,
        contactName: supplier.contact_name,
        phone: supplier.phone,
        address: supplier.address,
        city: supplier.city,
        state: supplier.state,
        pincode: supplier.pincode,
        verificationStatus: supplier.verification_status,
        // STG-088: Include bankName in response
        bankDetails: supplier.bank_account_number ? {
          accountNumber: supplier.bank_account_number,
          ifscCode: supplier.bank_ifsc,
          accountName: supplier.bank_account_name,
          bankName: supplier.bank_name || null,
        } : null,
        bankVerificationStatus: supplier.bank_verification_status || 'pending',
      },
    });
  } catch (error) {
    next(error);
  }
});

export const supplierProfileRouter = router;
