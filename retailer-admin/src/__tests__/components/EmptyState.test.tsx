import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyState from '../../components/EmptyState';
import { Package } from 'lucide-react';

describe('EmptyState', () => {
  it('renders title text', () => {
    render(
      <EmptyState
        icon={<Package size={24} />}
        title="No products found"
        description="Add your first product to get started"
      />
    );

    expect(screen.getByText('No products found')).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(
      <EmptyState
        icon={<Package size={24} />}
        title="No products found"
        description="Add your first product to get started"
      />
    );

    expect(screen.getByText('Add your first product to get started')).toBeInTheDocument();
  });

  it('renders icon component', () => {
    const { container } = render(
      <EmptyState
        icon={<Package size={24} />}
        title="No products found"
        description="Add your first product to get started"
      />
    );

    // Icon is rendered as SVG from lucide-react
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders without action button when not provided', () => {
    render(
      <EmptyState
        icon={<Package size={24} />}
        title="No products found"
        description="Add your first product to get started"
      />
    );

    const button = screen.queryByRole('button');
    expect(button).not.toBeInTheDocument();
  });

  it('renders action button when provided', () => {
    render(
      <EmptyState
        icon={<Package size={24} />}
        title="No products found"
        description="Add your first product to get started"
        action={<button>Add Product</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Add Product' })).toBeInTheDocument();
  });

  it('renders custom action node', () => {
    render(
      <EmptyState
        icon={<Package size={24} />}
        title="No products found"
        description="Add your first product to get started"
        action={<a href="/add">Add Product Link</a>}
      />
    );

    expect(screen.getByRole('link', { name: 'Add Product Link' })).toBeInTheDocument();
  });
});
