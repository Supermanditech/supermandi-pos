import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '../../components/Skeleton';
import TableSkeleton from '../../components/TableSkeleton';

// ── Skeleton ─────────────────────────────────────────────────────────────

describe('Skeleton', () => {
  it('renders a div with skeleton class', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toBe('skeleton');
  });

  it('applies default dimensions', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('100%');
    expect(el.style.height).toBe('16px');
    expect(el.style.borderRadius).toBe('4px');
  });

  it('applies custom width as string', () => {
    const { container } = render(<Skeleton width="200px" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('200px');
  });

  it('applies custom width as number', () => {
    const { container } = render(<Skeleton width={150} />);
    const el = container.firstChild as HTMLElement;
    // Numbers are rendered as px by React
    expect(el.style.width).toBe('150px');
  });

  it('applies custom height', () => {
    const { container } = render(<Skeleton height={24} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe('24px');
  });

  it('applies custom borderRadius', () => {
    const { container } = render(<Skeleton borderRadius={8} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.borderRadius).toBe('8px');
  });

  it('renders with all custom props', () => {
    const { container } = render(<Skeleton width="50%" height={32} borderRadius={12} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('50%');
    expect(el.style.height).toBe('32px');
    expect(el.style.borderRadius).toBe('12px');
  });
});

// ── TableSkeleton ────────────────────────────────────────────────────────

describe('TableSkeleton', () => {
  it('renders default 5 rows and 4 columns', () => {
    const { container } = render(<TableSkeleton />);
    // Header row has cols skeleton elements
    const skeletons = container.querySelectorAll('.skeleton');
    // 4 columns in header + 5 rows * 4 cols = 4 + 20 = 24
    expect(skeletons.length).toBe(24);
  });

  it('renders custom number of rows', () => {
    const { container } = render(<TableSkeleton rows={3} />);
    const skeletons = container.querySelectorAll('.skeleton');
    // 4 cols header + 3 rows * 4 cols = 4 + 12 = 16
    expect(skeletons.length).toBe(16);
  });

  it('renders custom number of columns', () => {
    const { container } = render(<TableSkeleton cols={2} />);
    const skeletons = container.querySelectorAll('.skeleton');
    // 2 cols header + 5 rows * 2 cols = 2 + 10 = 12
    expect(skeletons.length).toBe(12);
  });

  it('renders custom rows and columns', () => {
    const { container } = render(<TableSkeleton rows={2} cols={3} />);
    const skeletons = container.querySelectorAll('.skeleton');
    // 3 cols header + 2 rows * 3 cols = 3 + 6 = 9
    expect(skeletons.length).toBe(9);
  });

  it('renders inside a card', () => {
    const { container } = render(<TableSkeleton />);
    const card = container.querySelector('.card');
    expect(card).toBeTruthy();
  });

  it('has header row with border-bottom', () => {
    const { container } = render(<TableSkeleton />);
    const firstRow = container.querySelector('.card > div');
    expect((firstRow as HTMLElement)?.style.borderBottom).toContain('1px solid');
  });
});
