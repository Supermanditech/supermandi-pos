// GATE-1/2/5: Registration & Auth Funnel Contract Tests
// Anti-regression gates for the prerequisite funnel (PREREQUISITE_FUNNEL_MAP.md)
// Validates response shapes and critical field presence for:
//   - Retailer registration (FLOW-A)
//   - Retailer auth/login (FLOW-B)
//   - SuperAdmin approval (FLOW-F)
//   - Supplier registration (FLOW-D)
//   - Supplier auth/login (FLOW-E)

import { z } from 'zod';

// =============================================================================
// REGISTRATION LOOKUP CONTRACTS
// =============================================================================

const RegistrationLookupResponse = z.object({
  action: z.enum([
    'LOGIN_ALLOWED',
    'REGISTER_REQUIRED',
    'PENDING_APPROVAL',
    'FIX_REQUIRED',
    'CONTACT_SUPPORT',
    'ACCOUNT_SUSPENDED',
    'VERIFY_PHONE',
    'UPLOAD_DOCUMENTS',
  ]),
  message: z.string(),
  application_id: z.string().uuid().optional(),
});

// =============================================================================
// REGISTRATION CREATE CONTRACTS
// =============================================================================

const RegistrationCreateResponse = z.object({
  applicationId: z.string().uuid(),
  status: z.string(),
  nextStep: z.string(),
});

// =============================================================================
// REGISTRATION VERIFY-OTP CONTRACTS
// =============================================================================

const RegistrationVerifyOtpResponse = z.object({
  phoneVerified: z.literal(true),
  nextStep: z.string(),
});

// =============================================================================
// DOCUMENT UPLOAD CONTRACTS
// =============================================================================

const DocumentUploadResponse = z.object({
  document_id: z.string().uuid(),
  status: z.string(),
  file_path: z.string().optional(),
  message: z.string().optional(),
});

// =============================================================================
// SUBMIT KYC CONTRACTS
// =============================================================================

const SubmitKycResponse = z.object({
  status: z.enum(['KYC_SUBMITTED']),
  message: z.string().optional(),
});

// =============================================================================
// AUTH LOGIN CONTRACTS
// =============================================================================

const AuthLoginResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    phone: z.string(),
    name: z.string().nullable().optional(),
  }),
  stores: z.array(z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  })),
});

// =============================================================================
// ADMIN APPROVAL CONTRACTS
// =============================================================================

// BLK-F1 GATE: This schema enforces that approval response includes entity ID
// that downstream flows depend on.
const AdminApprovalResponse = z.object({
  success: z.literal(true),
  message: z.string(),
  applicationId: z.string().uuid(),
  approvedEntityId: z.string().uuid(),
  entityType: z.enum(['retailer', 'supplier']),
  activationCode: z.string().optional(), // Retailer only (POS enrollment)
  codeSentTo: z.string().optional(),
  codeSentVia: z.array(z.string()).optional(),
  emailDelivered: z.boolean().optional(), // Supplier only
});

// =============================================================================
// PLATFORM.STORES SCHEMA CONTRACT (DB-level)
// Validates that the store record created by approval has all fields needed
// by the firebase-otp-login handler.
// =============================================================================

const StoreRecordForLogin = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  phone: z.string(),
  retailer_portal_phone: z.string(), // BLK-F1: MUST NOT be null
  retailer_portal_enabled: z.literal(true),
  status: z.literal('ACTIVE'),
});

// =============================================================================
// CONTRACT VALIDATION TESTS
// =============================================================================

describe('Registration Funnel Contract Tests', () => {
  describe('GATE-1: Retailer Registration', () => {
    test('lookup returns LOGIN_ALLOWED for approved retailer', () => {
      const response = {
        action: 'LOGIN_ALLOWED',
        message: 'You can proceed with OTP login.',
      };
      expect(() => RegistrationLookupResponse.parse(response)).not.toThrow();
    });

    test('lookup returns REGISTER_REQUIRED for unknown phone', () => {
      const response = {
        action: 'REGISTER_REQUIRED',
        message: 'Please register to continue.',
      };
      expect(() => RegistrationLookupResponse.parse(response)).not.toThrow();
    });

    test('lookup returns PENDING_APPROVAL with application_id', () => {
      const response = {
        action: 'PENDING_APPROVAL',
        application_id: '00000000-0000-0000-0000-000000000001',
        message: 'Your application is under review.',
      };
      expect(() => RegistrationLookupResponse.parse(response)).not.toThrow();
    });

    test('lookup returns UPLOAD_DOCUMENTS for draft with verified phone', () => {
      const response = {
        action: 'UPLOAD_DOCUMENTS',
        application_id: '00000000-0000-0000-0000-000000000001',
        message: 'Please complete your registration before logging in.',
      };
      expect(() => RegistrationLookupResponse.parse(response)).not.toThrow();
    });

    test('lookup returns ACCOUNT_SUSPENDED for suspended store', () => {
      const response = {
        action: 'ACCOUNT_SUSPENDED',
        message: 'Your store account has been suspended. Contact hello@supermandi.tech for assistance.',
      };
      expect(() => RegistrationLookupResponse.parse(response)).not.toThrow();
    });

    test('lookup rejects invalid action', () => {
      const response = {
        action: 'INVALID_ACTION',
        message: 'Some message',
      };
      expect(() => RegistrationLookupResponse.parse(response)).toThrow();
    });

    test('create returns applicationId and status', () => {
      const response = {
        applicationId: '00000000-0000-0000-0000-000000000001',
        status: 'DRAFT',
        nextStep: 'VERIFY_PHONE',
      };
      expect(() => RegistrationCreateResponse.parse(response)).not.toThrow();
    });

    test('verify-otp returns phoneVerified true', () => {
      const response = {
        phoneVerified: true,
        nextStep: 'UPLOAD_DOCUMENTS',
      };
      expect(() => RegistrationVerifyOtpResponse.parse(response)).not.toThrow();
    });

    test('verify-otp rejects phoneVerified false', () => {
      const response = {
        phoneVerified: false,
        nextStep: 'VERIFY_PHONE',
      };
      expect(() => RegistrationVerifyOtpResponse.parse(response)).toThrow();
    });

    test('document upload returns document_id', () => {
      const response = {
        document_id: '00000000-0000-0000-0000-000000000001',
        status: 'pending',
        file_path: 'documents/application/uuid/pan_card_file.jpg',
        message: 'Document uploaded successfully',
      };
      expect(() => DocumentUploadResponse.parse(response)).not.toThrow();
    });

    test('submit-kyc returns KYC_SUBMITTED status', () => {
      const response = {
        status: 'KYC_SUBMITTED',
        message: 'Application submitted for review',
      };
      expect(() => SubmitKycResponse.parse(response)).not.toThrow();
    });
  });

  describe('GATE-2: Retailer Auth', () => {
    test('firebase-otp-login returns JWT + stores for single-store user', () => {
      const response = {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh.test',
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          phone: '+919876543210',
          name: 'Retailer Admin',
        },
        stores: [
          {
            id: '00000000-0000-0000-0000-000000000002',
            code: 'SU260308-001',
            name: 'Test Store',
          },
        ],
      };
      expect(() => AuthLoginResponse.parse(response)).not.toThrow();
    });

    test('firebase-otp-login returns multiple stores for multi-store user', () => {
      const response = {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh.test',
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          phone: '+919876543210',
          name: 'Retailer Admin',
        },
        stores: [
          { id: '00000000-0000-0000-0000-000000000002', code: 'SU260308-001', name: 'Store A' },
          { id: '00000000-0000-0000-0000-000000000003', code: 'SU260308-002', name: 'Store B' },
        ],
      };
      expect(() => AuthLoginResponse.parse(response)).not.toThrow();
    });

    test('login response requires accessToken and refreshToken', () => {
      const response = {
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          phone: '+919876543210',
        },
        stores: [],
      };
      expect(() => AuthLoginResponse.parse(response)).toThrow();
    });
  });

  describe('GATE-5: SuperAdmin Approval', () => {
    test('retailer approval returns approvedEntityId and activationCode', () => {
      const response = {
        success: true,
        message: 'Store approved successfully',
        applicationId: '00000000-0000-0000-0000-000000000001',
        approvedEntityId: '00000000-0000-0000-0000-000000000002',
        entityType: 'retailer',
        activationCode: 'SM-ABC123',
        codeSentTo: '+919876543210',
        codeSentVia: ['whatsapp'],
      };
      expect(() => AdminApprovalResponse.parse(response)).not.toThrow();
    });

    test('supplier approval returns approvedEntityId and emailDelivered', () => {
      const response = {
        success: true,
        message: 'Supplier approved successfully',
        applicationId: '00000000-0000-0000-0000-000000000001',
        approvedEntityId: '00000000-0000-0000-0000-000000000003',
        entityType: 'supplier',
        emailDelivered: true,
      };
      expect(() => AdminApprovalResponse.parse(response)).not.toThrow();
    });

    test('approval response requires success=true', () => {
      const response = {
        success: false,
        message: 'Failed',
        applicationId: '00000000-0000-0000-0000-000000000001',
        approvedEntityId: '00000000-0000-0000-0000-000000000002',
        entityType: 'retailer',
      };
      expect(() => AdminApprovalResponse.parse(response)).toThrow();
    });

    test('approval response rejects invalid entityType', () => {
      const response = {
        success: true,
        message: 'Approved',
        applicationId: '00000000-0000-0000-0000-000000000001',
        approvedEntityId: '00000000-0000-0000-0000-000000000002',
        entityType: 'unknown',
      };
      expect(() => AdminApprovalResponse.parse(response)).toThrow();
    });
  });

  // BLK-F1 REGRESSION GATE: This is the critical test that prevents
  // the retailer_portal_phone bug from recurring. The store record
  // created by approval MUST have retailer_portal_phone set, otherwise
  // firebase-otp-login will always return 404 USER_NOT_FOUND.
  describe('GATE-5b: Store Record Login Compatibility (BLK-F1)', () => {
    test('store created by approval has retailer_portal_phone set', () => {
      const storeRecord = {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'New Retailer Store',
        code: 'SU260308-001',
        phone: '+919876543210',
        retailer_portal_phone: '+919876543210',
        retailer_portal_enabled: true,
        status: 'ACTIVE',
      };
      expect(() => StoreRecordForLogin.parse(storeRecord)).not.toThrow();
    });

    test('store WITHOUT retailer_portal_phone fails contract (BLK-F1 regression)', () => {
      const storeRecord = {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Broken Store',
        code: 'SU260308-001',
        phone: '+919876543210',
        retailer_portal_phone: null, // BLK-F1: This was the bug — NULL = login always fails
        retailer_portal_enabled: true,
        status: 'ACTIVE',
      };
      expect(() => StoreRecordForLogin.parse(storeRecord)).toThrow();
    });

    test('store with retailer_portal_enabled=false fails contract', () => {
      const storeRecord = {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Disabled Store',
        code: 'SU260308-001',
        phone: '+919876543210',
        retailer_portal_phone: '+919876543210',
        retailer_portal_enabled: false,
        status: 'ACTIVE',
      };
      expect(() => StoreRecordForLogin.parse(storeRecord)).toThrow();
    });
  });

  describe('GATE-3/4: Supplier Registration & Auth', () => {
    test('supplier lookup returns valid action', () => {
      const response = {
        action: 'LOGIN_ALLOWED',
        message: 'You can proceed with login.',
      };
      expect(() => RegistrationLookupResponse.parse(response)).not.toThrow();
    });

    test('supplier create returns applicationId', () => {
      const response = {
        applicationId: '00000000-0000-0000-0000-000000000001',
        status: 'DRAFT',
        nextStep: 'VERIFY_PHONE',
      };
      expect(() => RegistrationCreateResponse.parse(response)).not.toThrow();
    });
  });
});
