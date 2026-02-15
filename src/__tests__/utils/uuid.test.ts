/**
 * Tests for utils/uuid
 */

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('550e8400-e29b-41d4-a716-446655440000'),
}));

import { uuidv4 } from '../../utils/uuid';

describe('uuidv4', () => {
  it('returns a UUID string', () => {
    const result = uuidv4();
    expect(typeof result).toBe('string');
    expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('calls Crypto.randomUUID', () => {
    const Crypto = require('expo-crypto');
    uuidv4();
    expect(Crypto.randomUUID).toHaveBeenCalled();
  });
});
