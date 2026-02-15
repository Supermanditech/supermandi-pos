import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Breadcrumb from '../../components/Breadcrumb';

// Mock next/link
jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
      React.createElement('a', { href, ...props }, children),
  };
});

describe('Breadcrumb', () => {
  it('renders a single item without a link', () => {
    render(<Breadcrumb items={[{ label: 'Dashboard' }]} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders multiple items with separators', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Products' },
        ]}
      />
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
  });

  it('renders items with paths as links', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Orders', path: '/orders' },
          { label: 'Detail' },
        ]}
      />
    );
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    const ordersLink = screen.getByText('Orders').closest('a');
    expect(ordersLink).toHaveAttribute('href', '/orders');
    // Last item (no path) should NOT be a link
    const detail = screen.getByText('Detail');
    expect(detail.closest('a')).toBeNull();
  });

  it('renders nav element for accessibility', () => {
    const { container } = render(
      <Breadcrumb items={[{ label: 'Home' }]} />
    );
    const nav = container.querySelector('nav');
    expect(nav).toBeInTheDocument();
  });

  it('does not render separator before first item', () => {
    const { container } = render(
      <Breadcrumb items={[{ label: 'Dashboard' }, { label: 'Products' }]} />
    );
    // There should be exactly one separator (between two items)
    const separators = container.querySelectorAll('.text-slate-300');
    expect(separators).toHaveLength(1);
  });

  it('renders last item without path as bold text', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Current Page' },
        ]}
      />
    );
    const currentPage = screen.getByText('Current Page');
    expect(currentPage).toHaveClass('font-medium');
  });
});
