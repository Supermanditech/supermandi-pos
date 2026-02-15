import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Providers } from '../../components/Providers';

// Mock QueryClient/QueryClientProvider
jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="query-provider">{children}</div>,
}));

// Mock AuthProvider
jest.mock('../../lib/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-provider">{children}</div>,
}));

// Mock react-hot-toast Toaster
jest.mock('react-hot-toast', () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

describe('Providers', () => {
  it('renders children', () => {
    render(
      <Providers>
        <div data-testid="child">Hello</div>
      </Providers>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('wraps children with QueryClientProvider', () => {
    render(
      <Providers>
        <span>Content</span>
      </Providers>
    );
    expect(screen.getByTestId('query-provider')).toBeInTheDocument();
  });

  it('wraps children with AuthProvider', () => {
    render(
      <Providers>
        <span>Content</span>
      </Providers>
    );
    expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
  });

  it('renders Toaster component', () => {
    render(
      <Providers>
        <span>Content</span>
      </Providers>
    );
    expect(screen.getByTestId('toaster')).toBeInTheDocument();
  });
});
