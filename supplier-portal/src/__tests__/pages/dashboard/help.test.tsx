import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardHelpPage from '../../../app/(dashboard)/help/page';

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ items }: any) =>
      React.createElement('nav', { 'data-testid': 'breadcrumb' },
        items.map((item: any, i: number) =>
          React.createElement('span', { key: i }, item.label)
        )
      ),
  };
});

// Mock lucide-react
jest.mock('lucide-react', () => {
  const React = require('react');
  const mockIcon = (name: string) => (props: any) =>
    React.createElement('svg', { 'data-testid': `icon-${name}`, ...props });
  return {
    Mail: mockIcon('Mail'),
    Phone: mockIcon('Phone'),
    MessageSquare: mockIcon('MessageSquare'),
    FileText: mockIcon('FileText'),
    HelpCircle: mockIcon('HelpCircle'),
    Package: mockIcon('Package'),
    ShoppingCart: mockIcon('ShoppingCart'),
    CreditCard: mockIcon('CreditCard'),
    Shield: mockIcon('Shield'),
  };
});

describe('DashboardHelpPage', () => {
  // ── Header & Breadcrumb ───────────────────────────────────────

  it('renders page heading', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByRole('heading', { name: 'Help & Support', level: 1 })).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText(/Find answers to common questions/)).toBeInTheDocument();
  });

  it('renders breadcrumb with Dashboard and Help & Support', () => {
    render(<DashboardHelpPage />);
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toHaveTextContent('Dashboard');
    expect(breadcrumb).toHaveTextContent('Help & Support');
  });

  // ── Contact Section ───────────────────────────────────────────

  it('renders Contact Us heading', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText('Contact Us')).toBeInTheDocument();
  });

  it('renders email support section', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText('Email Support')).toBeInTheDocument();
    expect(screen.getByText('hello@supermandi.tech')).toBeInTheDocument();
  });

  it('renders mailto link', () => {
    render(<DashboardHelpPage />);
    const emailLink = screen.getByText('hello@supermandi.tech');
    expect(emailLink.closest('a')).toHaveAttribute('href', 'mailto:hello@supermandi.tech');
  });

  it('renders email response time note', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText(/typically respond within 24 hours/)).toBeInTheDocument();
  });

  it('renders live chat section', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText('Live Chat')).toBeInTheDocument();
    expect(screen.getByText(/Use the Chat feature in the sidebar/)).toBeInTheDocument();
  });

  it('renders business hours note', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText(/Available during business hours/)).toBeInTheDocument();
  });

  // ── FAQ Section ───────────────────────────────────────────────

  it('renders FAQ heading', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
  });

  it('renders all 6 FAQ questions', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText('How do I add a new product?')).toBeInTheDocument();
    expect(screen.getByText('How long does product approval take?')).toBeInTheDocument();
    expect(screen.getByText('How do I track my orders?')).toBeInTheDocument();
    expect(screen.getByText('When do I get paid?')).toBeInTheDocument();
    expect(screen.getByText('How do I upload products in bulk?')).toBeInTheDocument();
    expect(screen.getByText('What documents are needed for KYC?')).toBeInTheDocument();
  });

  it('renders FAQ answers', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText(/Go to Products > click/)).toBeInTheDocument();
    expect(screen.getByText(/typically takes 1-2 business days/)).toBeInTheDocument();
    expect(screen.getByText(/Go to Orders to see all purchase orders/)).toBeInTheDocument();
    expect(screen.getByText(/Payouts are processed after order delivery/)).toBeInTheDocument();
    expect(screen.getByText(/use the "Upload CSV" option/)).toBeInTheDocument();
    expect(screen.getByText(/PAN card, GSTIN certificate/)).toBeInTheDocument();
  });

  // ── Footer ────────────────────────────────────────────────────

  it('renders copyright text', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText(/SuperMandi Tech Pvt Ltd/)).toBeInTheDocument();
  });

  it('renders current year in copyright', () => {
    render(<DashboardHelpPage />);
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
  });
});
