import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotFound from '../../app/not-found';

// Mock next/link
jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: any) =>
      React.createElement('a', { href, ...props }, children),
  };
});

describe('NotFound Page', () => {
  it('renders 404 text', () => {
    render(<NotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders Page Not Found heading', () => {
    render(<NotFound />);
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders description message', () => {
    render(<NotFound />);
    expect(screen.getByText(/The page you're looking for doesn't exist/)).toBeInTheDocument();
  });

  it('renders Back to Dashboard link', () => {
    render(<NotFound />);
    const link = screen.getByText('Back to Dashboard');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/dashboard');
  });
});
