// Suppress expected console.error/warn noise in tests
// Tests deliberately trigger error paths — their console output is expected but noisy.
// This file silences console.error and console.warn during test execution
// while preserving console.log for debugging.

const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // Only suppress known test noise patterns
    const msg = String(args[0] || '');
    if (
      msg.includes('mock-transaction') ||
      msg.includes('[OTP]') ||
      msg.includes('[GO-LIVE-') ||
      msg.includes('Warning: An update to') ||
      msg.includes('Error: Uncaught') ||
      msg.includes('ReferenceError: window') ||
      msg.includes('[Auth]') ||
      msg.includes('not wrapped in act')
    ) {
      return; // suppress known test noise
    }
    originalError(...args); // pass through unexpected errors
  };

  console.warn = (...args: unknown[]) => {
    const msg = String(args[0] || '');
    if (
      msg.includes('[AUTH-EXPIRY-') ||
      msg.includes('[AUTH-LOGOUT-') ||
      msg.includes('Token refresh')
    ) {
      return; // suppress known auth test warnings
    }
    originalWarn(...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
