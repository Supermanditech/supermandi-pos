import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EmptyState from '../../components/EmptyState';
import { Package } from 'lucide-react';

describe('EmptyState', () => {
  it('renders message text', () => {
    render(
      <EmptyState
        icon={Package}
        title="No Products"
        description="You haven't added any products yet"
      />
    );

    expect(screen.getByText('No Products')).toBeInTheDocument();
    expect(screen.getByText("You haven't added any products yet")).toBeInTheDocument();
  });

  it('renders icon if provided', () => {
    const { container } = render(
      <EmptyState
        icon={Package}
        title="No Products"
        description="You haven't added any products yet"
      />
    );

    // Icon should be rendered (Lucide renders as SVG)
    const iconElement = container.querySelector('svg');
    expect(iconElement).toBeInTheDocument();
  });

  it('renders action button if provided', () => {
    render(
      <EmptyState
        icon={Package}
        title="No Products"
        description="You haven't added any products yet"
        action={<button>Add Product</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Add Product' })).toBeInTheDocument();
  });

  it('does not render action container if action is not provided', () => {
    const { container } = render(
      <EmptyState
        icon={Package}
        title="No Products"
        description="You haven't added any products yet"
      />
    );

    // No action div should be present
    const actionDivs = container.querySelectorAll('.mt-6');
    expect(actionDivs).toHaveLength(0);
  });
});
