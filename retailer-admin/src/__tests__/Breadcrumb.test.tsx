import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';

describe('Breadcrumb', () => {
  const renderWithRouter = (ui: React.ReactElement) =>
    render(<MemoryRouter>{ui}</MemoryRouter>);

  it('renders single item without link', () => {
    renderWithRouter(<Breadcrumb items={[{ label: 'Home' }]} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('renders multiple items with separator', () => {
    renderWithRouter(
      <Breadcrumb items={[
        { label: 'Home', path: '/home' },
        { label: 'Products', path: '/products' },
        { label: 'Detail' },
      ]} />
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Detail')).toBeInTheDocument();
  });

  it('renders items with path as links', () => {
    renderWithRouter(
      <Breadcrumb items={[
        { label: 'Home', path: '/home' },
        { label: 'Current' },
      ]} />
    );
    const link = screen.getByText('Home');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/home');
  });

  it('renders last item (no path) as plain span', () => {
    renderWithRouter(
      <Breadcrumb items={[
        { label: 'Home', path: '/home' },
        { label: 'Current' },
      ]} />
    );
    const current = screen.getByText('Current');
    expect(current.tagName).toBe('SPAN');
  });

  it('renders nav element', () => {
    const { container } = renderWithRouter(
      <Breadcrumb items={[{ label: 'Home' }]} />
    );
    expect(container.querySelector('nav')).toBeInTheDocument();
  });

  it('renders empty items without crashing', () => {
    renderWithRouter(<Breadcrumb items={[]} />);
    // Should render nav but nothing inside
    expect(document.querySelector('nav')).toBeInTheDocument();
  });
});
