/**
 * TEST-011: auth-service — jwtService unit tests
 * Tests JWT token generation, verification, error handling, and service tokens.
 */

// Mock config before importing jwtService
jest.mock('../services/auth-service/src/config', () => ({
  config: {
    jwt: {
      secret: 'test-secret-key-for-unit-tests-minimum-32-chars',
      serviceTokenSecret: 'test-service-token-secret-for-unit-tests-32c',
      accessTokenExpiresIn: '15m',
      refreshTokenExpiresInDays: 7,
      issuer: 'supermandi-auth',
    },
  },
}));

import {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyAccessTokenWithError,
  verifyRefreshToken,
  verifyRefreshTokenWithError,
  generateServiceToken,
  verifyServiceToken,
  verifyServiceTokenWithError,
  hashRefreshToken,
  getRefreshTokenExpiry,
  decodeToken,
} from '../services/auth-service/src/services/jwtService';
import jwt from 'jsonwebtoken';

describe('jwtService', () => {
  // =========================================================================
  // ACCESS TOKEN
  // =========================================================================
  describe('generateAccessToken', () => {
    it('generates a valid JWT with correct claims', () => {
      const token = generateAccessToken({
        sub: 'user-123',
        actorType: 'store',
        actorId: 'store-456',
        permissions: ['pos:scan', 'pos:sell'],
      });

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const decoded = jwt.decode(token) as jwt.JwtPayload;
      expect(decoded.sub).toBe('user-123');
      expect(decoded.actorType).toBe('store');
      expect(decoded.actorId).toBe('store-456');
      expect(decoded.permissions).toEqual(['pos:scan', 'pos:sell']);
      expect(decoded.iss).toBe('supermandi-auth');
      expect(decoded.exp).toBeDefined();
    });

    it('sets expiry based on config (15m = 900s)', () => {
      const token = generateAccessToken({
        sub: 'user-1',
        actorType: 'store',
        permissions: [],
      });

      const decoded = jwt.decode(token) as jwt.JwtPayload;
      const expiryDelta = decoded.exp! - decoded.iat!;
      expect(expiryDelta).toBe(900);
    });
  });

  // =========================================================================
  // REFRESH TOKEN
  // =========================================================================
  describe('generateRefreshToken', () => {
    it('returns token and unique tokenId', () => {
      const result = generateRefreshToken('user-123');

      expect(typeof result.token).toBe('string');
      expect(typeof result.tokenId).toBe('string');
      // tokenId should be a UUID
      expect(result.tokenId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('embeds refresh type and tokenId in payload', () => {
      const result = generateRefreshToken('user-123');
      const decoded = jwt.decode(result.token) as jwt.JwtPayload;

      expect(decoded.sub).toBe('user-123');
      expect(decoded.type).toBe('refresh');
      expect(decoded.tokenId).toBe(result.tokenId);
    });

    it('sets expiry to 7 days', () => {
      const result = generateRefreshToken('user-123');
      const decoded = jwt.decode(result.token) as jwt.JwtPayload;
      const expiryDelta = decoded.exp! - decoded.iat!;
      expect(expiryDelta).toBe(7 * 86400);
    });

    it('generates unique tokenIds for each call', () => {
      const r1 = generateRefreshToken('user-1');
      const r2 = generateRefreshToken('user-1');
      expect(r1.tokenId).not.toBe(r2.tokenId);
    });
  });

  // =========================================================================
  // TOKEN PAIR
  // =========================================================================
  describe('generateTokenPair', () => {
    it('returns access + refresh tokens with expiry info', () => {
      const pair = generateTokenPair('user-1', 'store', 'store-1', ['pos:scan']);

      expect(typeof pair.accessToken).toBe('string');
      expect(typeof pair.refreshToken).toBe('string');
      expect(pair.expiresIn).toBe(900);
      expect(typeof pair.refreshTokenId).toBe('string');
    });
  });

  // =========================================================================
  // ACCESS TOKEN VERIFICATION
  // =========================================================================
  describe('verifyAccessToken', () => {
    it('returns payload for valid token', () => {
      const token = generateAccessToken({
        sub: 'user-1',
        actorType: 'store',
        permissions: ['pos:scan'],
      });

      const payload = verifyAccessToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe('user-1');
      expect(payload!.actorType).toBe('store');
      expect(payload!.permissions).toEqual(['pos:scan']);
    });

    it('returns null for invalid token', () => {
      expect(verifyAccessToken('invalid.token.here')).toBeNull();
    });

    it('returns null for token signed with wrong secret', () => {
      const token = jwt.sign(
        { sub: 'user-1', actorType: 'staff', permissions: [] },
        'wrong-secret',
        { issuer: 'supermandi-auth' }
      );
      expect(verifyAccessToken(token)).toBeNull();
    });
  });

  describe('verifyAccessTokenWithError', () => {
    it('returns MALFORMED for token missing required fields', () => {
      const token = jwt.sign(
        { sub: 'user-1' },
        'test-secret-key-for-unit-tests-minimum-32-chars',
        { issuer: 'supermandi-auth' }
      );

      const result = verifyAccessTokenWithError(token);
      expect(result.payload).toBeNull();
      expect(result.error).toBe('MALFORMED');
    });

    it('returns EXPIRED for expired token', () => {
      const token = jwt.sign(
        { sub: 'user-1', actorType: 'staff', permissions: [] },
        'test-secret-key-for-unit-tests-minimum-32-chars',
        { expiresIn: -60, issuer: 'supermandi-auth' }
      );

      const result = verifyAccessTokenWithError(token);
      expect(result.payload).toBeNull();
      expect(result.error).toBe('EXPIRED');
    });

    it('returns INVALID_SIGNATURE for wrong secret', () => {
      const token = jwt.sign(
        { sub: 'user-1', actorType: 'staff', permissions: [] },
        'wrong-secret',
        { issuer: 'supermandi-auth' }
      );

      const result = verifyAccessTokenWithError(token);
      expect(result.payload).toBeNull();
      expect(result.error).toBe('INVALID_SIGNATURE');
    });
  });

  // =========================================================================
  // REFRESH TOKEN VERIFICATION
  // =========================================================================
  describe('verifyRefreshToken', () => {
    it('returns payload for valid refresh token', () => {
      const { token, tokenId } = generateRefreshToken('user-1');
      const payload = verifyRefreshToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe('user-1');
      expect(payload!.tokenId).toBe(tokenId);
      expect(payload!.type).toBe('refresh');
    });

    it('returns null for access token (wrong type)', () => {
      const token = generateAccessToken({
        sub: 'user-1',
        actorType: 'store',
        permissions: [],
      });
      expect(verifyRefreshToken(token)).toBeNull();
    });
  });

  describe('verifyRefreshTokenWithError', () => {
    it('returns MALFORMED for non-refresh token', () => {
      const token = jwt.sign(
        { sub: 'user-1', type: 'access' },
        'test-secret-key-for-unit-tests-minimum-32-chars',
        { issuer: 'supermandi-auth' }
      );

      const result = verifyRefreshTokenWithError(token);
      expect(result.error).toBe('MALFORMED');
    });
  });

  // =========================================================================
  // SERVICE TOKEN (GL-CRIT-0007)
  // =========================================================================
  describe('generateServiceToken', () => {
    it('generates token for allowed service', () => {
      const token = generateServiceToken('api-gateway');
      expect(typeof token).toBe('string');

      const decoded = jwt.decode(token) as jwt.JwtPayload;
      expect(decoded.serviceName).toBe('api-gateway');
      expect(decoded.type).toBe('service');
    });

    it('throws for unknown service', () => {
      expect(() => generateServiceToken('rogue-service')).toThrow('Unknown service');
    });

    it('sets 5-minute expiry', () => {
      const token = generateServiceToken('order-service');
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      expect(decoded.exp! - decoded.iat!).toBe(300);
    });
  });

  describe('verifyServiceToken', () => {
    it('returns payload for valid service token', () => {
      const token = generateServiceToken('inventory-service');
      const payload = verifyServiceToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.serviceName).toBe('inventory-service');
      expect(payload!.type).toBe('service');
    });

    it('returns null for non-service token', () => {
      const token = generateAccessToken({
        sub: 'user-1',
        actorType: 'store',
        permissions: [],
      });
      expect(verifyServiceToken(token)).toBeNull();
    });
  });

  describe('verifyServiceTokenWithError', () => {
    it('returns UNKNOWN_SERVICE for unknown service in token', () => {
      // Forge a token with unknown service name, signed with the service token secret
      const token = jwt.sign(
        { serviceName: 'evil-service', type: 'service' },
        'test-service-token-secret-for-unit-tests-32c',
        { issuer: 'supermandi-auth' }
      );

      const result = verifyServiceTokenWithError(token);
      expect(result.error).toBe('UNKNOWN_SERVICE');
    });
  });

  // =========================================================================
  // UTILITIES
  // =========================================================================
  describe('hashRefreshToken', () => {
    it('returns SHA-256 hex hash', () => {
      const hash = hashRefreshToken('test-token');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic', () => {
      const h1 = hashRefreshToken('token-a');
      const h2 = hashRefreshToken('token-a');
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different tokens', () => {
      const h1 = hashRefreshToken('token-a');
      const h2 = hashRefreshToken('token-b');
      expect(h1).not.toBe(h2);
    });
  });

  describe('getRefreshTokenExpiry', () => {
    it('returns date 7 days in the future', () => {
      const before = Date.now();
      const expiry = getRefreshTokenExpiry();
      const after = Date.now();

      const expectedMin = before + 7 * 86400 * 1000;
      const expectedMax = after + 7 * 86400 * 1000;

      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMin - 1000);
      expect(expiry.getTime()).toBeLessThanOrEqual(expectedMax + 1000);
    });
  });

  describe('decodeToken', () => {
    it('decodes without verification', () => {
      const token = jwt.sign({ foo: 'bar' }, 'any-secret');
      const decoded = decodeToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.foo).toBe('bar');
    });

    it('returns null for garbage', () => {
      expect(decodeToken('not-a-jwt')).toBeNull();
    });
  });
});
