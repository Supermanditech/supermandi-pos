// Retailer Admin — Vitest setup
import '@testing-library/jest-dom';

// Mock import.meta.env
Object.defineProperty(globalThis, 'import', {
  value: { meta: { env: { VITE_API_BASE_URL: 'http://localhost:3000' } } },
  writable: true,
});

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
