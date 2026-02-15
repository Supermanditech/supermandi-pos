import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Skeleton, TableSkeleton } from '../../components/Skeleton';

describe('Skeleton', () => {
  it('renders skeleton element with default classes', () => {
    const { container } = render(<Skeleton />);

    const skeletonDiv = container.firstChild as HTMLElement;
    expect(skeletonDiv).toHaveClass('animate-pulse');
    expect(skeletonDiv).toHaveClass('bg-slate-200');
    expect(skeletonDiv).toHaveClass('rounded');
  });

  it('renders with custom className', () => {
    const { container } = render(<Skeleton className="custom-class" />);

    const skeletonDiv = container.firstChild as HTMLElement;
    expect(skeletonDiv).toHaveClass('custom-class');
    expect(skeletonDiv).toHaveClass('animate-pulse');
  });

  it('renders with custom width and height', () => {
    const { container } = render(<Skeleton width="200px" height="50px" />);

    const skeletonDiv = container.firstChild as HTMLElement;
    expect(skeletonDiv).toHaveStyle({ width: '200px', height: '50px' });
  });
});

describe('TableSkeleton', () => {
  it('renders with default rows and columns', () => {
    const { container } = render(<TableSkeleton />);

    // Default is 5 rows, 4 columns
    // Header row + 5 body rows = 6 total rows
    const rows = container.querySelectorAll('.flex.gap-4');
    expect(rows.length).toBeGreaterThan(0);

    // Check that skeleton elements are rendered
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders with custom rows and columns', () => {
    const { container } = render(<TableSkeleton rows={3} cols={2} />);

    // Should render header + 3 body rows
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders table container with proper styling', () => {
    const { container } = render(<TableSkeleton />);

    const tableContainer = container.firstChild as HTMLElement;
    expect(tableContainer).toHaveClass('bg-white');
    expect(tableContainer).toHaveClass('rounded-lg');
    expect(tableContainer).toHaveClass('border');
    expect(tableContainer).toHaveClass('border-slate-200');
  });
});
