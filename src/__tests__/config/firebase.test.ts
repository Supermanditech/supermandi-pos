/**
 * Tests for config/firebase
 * Covers: isFirebaseReady, graceful degradation, exported values
 *
 * NOTE: babel-preset-expo inlines EXPO_PUBLIC_* env vars at compile time,
 * so runtime process.env changes do NOT affect hasFirebaseConfig() in jest.
 * We test the module's behavior given the compile-time state (no env vars set),
 * plus verify that isFirebaseReady correctly reports auth availability.
 */

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
}));

import { isFirebaseReady, app, auth } from '../../config/firebase';

describe('firebase config', () => {
  it('isFirebaseReady returns false when firebase is not configured', () => {
    // In test environment, EXPO_PUBLIC_* vars are not set at compile time,
    // so hasFirebaseConfig() returns false and auth stays null
    expect(isFirebaseReady()).toBe(false);
  });

  it('exports null app when not configured', () => {
    expect(app).toBeNull();
  });

  it('exports null auth when not configured', () => {
    expect(auth).toBeNull();
  });

  it('isFirebaseReady is a function', () => {
    expect(typeof isFirebaseReady).toBe('function');
  });

  it('isFirebaseReady returns boolean', () => {
    const result = isFirebaseReady();
    expect(typeof result).toBe('boolean');
  });

  it('initializeApp is not called when config is missing', () => {
    const { initializeApp } = require('firebase/app');
    expect(initializeApp).not.toHaveBeenCalled();
  });

  it('getAuth is not called when config is missing', () => {
    const { getAuth } = require('firebase/auth');
    expect(getAuth).not.toHaveBeenCalled();
  });
});
