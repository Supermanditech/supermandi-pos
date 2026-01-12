// Auth Service Tests - V3.0.9 compliant
// Authentication and authorization integration tests

import request from 'supertest';
import { TEST_IDS, TEST_CREDENTIALS, getTestAuthHeaders } from './setup';

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';

describe('Auth Service', () => {
  let validToken: string;

  // ===========================================================================
  // LOGIN TESTS
  // ===========================================================================
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(API_GATEWAY_URL)
        .post('/api/auth/login')
        .send({
          phone: TEST_CREDENTIALS.staffPhone,
          pin: TEST_CREDENTIALS.staffPin,
          deviceFingerprint: TEST_CREDENTIALS.deviceFingerprint
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('store');
      expect(response.body.data.user.phone).toBe(TEST_CREDENTIALS.staffPhone);

      validToken = response.body.data.token;
    });

    it('should reject invalid phone', async () => {
      const response = await request(API_GATEWAY_URL)
        .post('/api/auth/login')
        .send({
          phone: '+919999999999',
          pin: TEST_CREDENTIALS.staffPin,
          deviceFingerprint: TEST_CREDENTIALS.deviceFingerprint
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should reject invalid PIN', async () => {
      const response = await request(API_GATEWAY_URL)
        .post('/api/auth/login')
        .send({
          phone: TEST_CREDENTIALS.staffPhone,
          pin: '9999',
          deviceFingerprint: TEST_CREDENTIALS.deviceFingerprint
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject unenrolled device', async () => {
      const response = await request(API_GATEWAY_URL)
        .post('/api/auth/login')
        .send({
          phone: TEST_CREDENTIALS.staffPhone,
          pin: TEST_CREDENTIALS.staffPin,
          deviceFingerprint: 'unknown-device-fingerprint'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toMatch(/device/i);
    });

    it('should validate required fields', async () => {
      const response = await request(API_GATEWAY_URL)
        .post('/api/auth/login')
        .send({
          phone: TEST_CREDENTIALS.staffPhone
          // Missing pin and deviceFingerprint
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toMatch(/VALIDATION/i);
    });
  });

  // ===========================================================================
  // TOKEN VERIFICATION TESTS
  // ===========================================================================
  describe('GET /api/auth/verify', () => {
    it('should verify valid token', async () => {
      const response = await request(API_GATEWAY_URL)
        .get('/api/auth/verify')
        .set(getTestAuthHeaders(validToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.user).toBeDefined();
    });

    it('should reject expired token', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0IiwiZXhwIjoxfQ.invalid';

      const response = await request(API_GATEWAY_URL)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject malformed token', async () => {
      const response = await request(API_GATEWAY_URL)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer malformed-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing token', async () => {
      const response = await request(API_GATEWAY_URL)
        .get('/api/auth/verify')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // LOGOUT TESTS
  // ===========================================================================
  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(API_GATEWAY_URL)
        .post('/api/auth/logout')
        .set(getTestAuthHeaders(validToken))
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // ===========================================================================
  // DEVICE ENROLLMENT TESTS
  // ===========================================================================
  describe('Device Enrollment', () => {
    it('should get device status', async () => {
      const response = await request(API_GATEWAY_URL)
        .get('/api/auth/device/status')
        .set('X-Device-Fingerprint', TEST_CREDENTIALS.deviceFingerprint)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.enrolled).toBe(true);
      expect(response.body.data.status).toBe('active');
    });

    it('should return not enrolled for unknown device', async () => {
      const response = await request(API_GATEWAY_URL)
        .get('/api/auth/device/status')
        .set('X-Device-Fingerprint', 'unknown-fingerprint')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.enrolled).toBe(false);
    });
  });
});
