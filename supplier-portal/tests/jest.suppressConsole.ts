// Suppress expected console noise in supplier portal tests
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = String(args[0] || '');
    if (
      msg.includes('Warning: An update to') ||
      msg.includes('not wrapped in act') ||
      msg.includes('[GO-LIVE-') ||
      msg.includes('[Auth]') ||
      msg.includes('Error: Uncaught')
    ) return;
    originalError(...args);
  };
  console.warn = (...args: unknown[]) => {
    const msg = String(args[0] || '');
    if (msg.includes('[AUTH-') || msg.includes('Token refresh')) return;
    originalWarn(...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
