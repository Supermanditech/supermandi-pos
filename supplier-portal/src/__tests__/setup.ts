// Supplier Portal — Jest setup
import '@testing-library/jest-dom';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/supplier/dashboard',
  useSearchParams: () => new URLSearchParams(),
  redirect: jest.fn(),
}));

// Mock next/image (avoid JSX in .ts — use createElement)
jest.mock('next/image', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => React.createElement('img', props),
  };
});
