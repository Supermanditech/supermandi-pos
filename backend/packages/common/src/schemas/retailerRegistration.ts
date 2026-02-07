/**
 * RO-002: Unified Retailer Registration Schema
 *
 * Single source of truth for registration fields, validation rules, and error messages.
 * Used by backend registration route. Frontends mirror these rules.
 *
 * Fields:
 * - phone (required, E.164 format +91XXXXXXXXXX)
 * - businessName (required, 2-100 chars)
 * - ownerName (required, 2-100 chars)
 * - gstin (optional, 15-char GSTIN format if provided)
 * - email (optional, valid email)
 * - address (optional)
 * - pincode (optional, 6 digits)
 * - source (required: PORTAL | POS_DEVICE | POS_MOBILE)
 * - deviceMeta (optional, for POS registrations)
 */

import { z } from "zod";

// =============================================================================
// Phone validation: Indian E.164 format
// =============================================================================
const PHONE_REGEX = /^\+91[6-9]\d{9}$/;

export const phoneSchema = z
  .string()
  .trim()
  .transform((val) => {
    // Auto-normalize: if 10 digits starting with 6-9, add +91
    if (/^[6-9]\d{9}$/.test(val)) return `+91${val}`;
    // If starts with 91 but no +, add +
    if (/^91[6-9]\d{9}$/.test(val)) return `+${val}`;
    return val;
  })
  .refine((val) => PHONE_REGEX.test(val), {
    message: "Phone must be a valid Indian mobile number (+91XXXXXXXXXX)",
  });

// =============================================================================
// GSTIN validation: 15-char alphanumeric with checksum format
// Format: 2-digit state + 10-char PAN + 1 entity + 1 default + 1 check
// =============================================================================
const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{1}[0-9A-Z]{1}$/;

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((val) => GSTIN_REGEX.test(val), {
    message:
      "GSTIN must be 15 characters in format: 2-digit state + PAN + entity code",
  });

// =============================================================================
// Registration source enum
// =============================================================================
export const REGISTRATION_SOURCES = [
  "PORTAL",
  "POS_DEVICE",
  "POS_MOBILE",
] as const;

export const registrationSourceSchema = z.enum(REGISTRATION_SOURCES);

// =============================================================================
// Device metadata (optional, for POS registrations)
// =============================================================================
export const deviceMetaSchema = z
  .object({
    userAgent: z.string().max(500).optional(),
    manufacturer: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    appVersion: z.string().max(50).optional(),
    androidVersion: z.string().max(20).optional(),
  })
  .optional();

// =============================================================================
// Main registration schema
// =============================================================================
export const retailerRegistrationSchema = z.object({
  phone: phoneSchema,
  otpProof: z.string().min(1, "OTP proof is required"),
  businessName: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters")
    .max(100, "Business name must not exceed 100 characters"),
  ownerName: z
    .string()
    .trim()
    .min(2, "Owner name must be at least 2 characters")
    .max(100, "Owner name must not exceed 100 characters"),
  gstin: gstinSchema.optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Pincode must be exactly 6 digits")
    .optional()
    .or(z.literal("")),
  source: registrationSourceSchema,
  deviceMeta: deviceMetaSchema,
});

// =============================================================================
// TypeScript types auto-derived from schema
// =============================================================================
export type RetailerRegistrationInput = z.input<
  typeof retailerRegistrationSchema
>;
export type RetailerRegistrationData = z.output<
  typeof retailerRegistrationSchema
>;
export type RegistrationSource = z.infer<typeof registrationSourceSchema>;
export type DeviceMeta = z.infer<typeof deviceMetaSchema>;

// =============================================================================
// Validation helper
// =============================================================================

/**
 * Validate registration input. Returns parsed data or error details.
 */
export function validateRegistration(input: unknown):
  | { success: true; data: RetailerRegistrationData }
  | { success: false; errors: Array<{ field: string; message: string }> } {
  const result = retailerRegistrationSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  };
}
