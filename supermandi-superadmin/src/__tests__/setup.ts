// SuperAdmin — Vitest setup
import '@testing-library/jest-dom';

// CI-FIX: Suppress "window is not defined" errors during jsdom teardown.
// After all tests pass, async React internals (timers, microtasks) may try to access
// `window` or `document` after jsdom has already destroyed the environment.
// This causes 100+ "Unhandled Errors" that fail CI despite zero test failures.
// We suppress only ReferenceErrors mentioning window/document — real errors propagate.
if (typeof globalThis !== 'undefined') {
  const origError = globalThis.onerror;
  globalThis.onerror = function (msg, _src, _line, _col, error) {
    if (error instanceof ReferenceError && /window|document/.test(error.message)) {
      return true; // suppress
    }
    return origError ? origError.call(this, msg, _src, _line, _col, error) : false;
  };
  globalThis.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (event.reason instanceof ReferenceError && /window|document/.test(event.reason.message)) {
      event.preventDefault();
    }
  });
}

// Mock window.matchMedia for responsive component tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock window.confirm for cleanup confirmations
Object.defineProperty(window, 'confirm', {
  writable: true,
  value: () => true,
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});
