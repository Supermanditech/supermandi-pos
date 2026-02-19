import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PendingApprovalPage from '../../../app/(auth)/pending-approval/page';

// Mock next/link
jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: any) =>
      React.createElement('a', { href, ...props }, children),
  };
});

describe('PendingApprovalPage', () => {
  it('renders Application Under Review heading', () => {
    render(<PendingApprovalPage />);
    expect(screen.getByText('Application Under Review')).toBeInTheDocument();
  });

  it('renders review message', () => {
    render(<PendingApprovalPage />);
    expect(screen.getByText('Your supplier account is being reviewed by our team.')).toBeInTheDocument();
  });

  it('renders What happens next section', () => {
    render(<PendingApprovalPage />);
    expect(screen.getByText('What happens next?')).toBeInTheDocument();
  });

  it('renders the three timeline steps', () => {
    render(<PendingApprovalPage />);
    expect(screen.getByText(/Our team reviews your business details/)).toBeInTheDocument();
    expect(screen.getByText(/receive an email\/SMS notification/)).toBeInTheDocument();
    expect(screen.getByText(/Login again to access/)).toBeInTheDocument();
  });

  it('renders typical review time info', () => {
    render(<PendingApprovalPage />);
    expect(screen.getByText(/Typical review time/)).toBeInTheDocument();
    expect(screen.getByText(/1-2 business days/)).toBeInTheDocument();
  });

  it('renders support email link', () => {
    render(<PendingApprovalPage />);
    const emailLink = screen.getByText('hello@supermandi.tech');
    expect(emailLink).toBeInTheDocument();
    expect(emailLink).toHaveAttribute('href', 'mailto:hello@supermandi.tech');
  });

  it('renders Back to Login link', () => {
    render(<PendingApprovalPage />);
    const loginLink = screen.getByText('Back to Login');
    expect(loginLink.closest('a')).toHaveAttribute('href', '/login');
  });
});
