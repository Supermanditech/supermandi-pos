// SM-005: Supplier Profile Routes
// Get and update supplier profile

import { Router, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";

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
        status,
        rating,
        bank_account_number,
        bank_ifsc,
        bank_account_name,
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
        status: supplier.status,
        rating: parseFloat(supplier.rating),
        bankDetails: supplier.bank_account_number ? {
          accountNumber: supplier.bank_account_number,
          ifscCode: supplier.bank_ifsc,
          accountName: supplier.bank_account_name,
        } : null,
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
    if (bankDetails !== undefined) {
      if (bankDetails.accountNumber !== undefined) {
        updates.push(`bank_account_number = $${paramIndex++}`);
        values.push(bankDetails.accountNumber);
      }
      if (bankDetails.ifscCode !== undefined) {
        updates.push(`bank_ifsc = $${paramIndex++}`);
        values.push(bankDetails.ifscCode?.toUpperCase());
      }
      if (bankDetails.accountName !== undefined) {
        updates.push(`bank_account_name = $${paramIndex++}`);
        values.push(bankDetails.accountName);
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
         bank_account_name`,
      values
    );

    const supplier = result.rows[0];

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
        bankDetails: supplier.bank_account_number ? {
          accountNumber: supplier.bank_account_number,
          ifscCode: supplier.bank_ifsc,
          accountName: supplier.bank_account_name,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const supplierProfileRouter = router;
