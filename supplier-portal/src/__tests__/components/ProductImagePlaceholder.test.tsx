import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProductImagePlaceholder from '../../components/ProductImagePlaceholder';

describe('ProductImagePlaceholder', () => {
  it('renders with default (md) size', () => {
    const { container } = render(<ProductImagePlaceholder />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('w-12', 'h-12');
  });

  it('renders with sm size', () => {
    const { container } = render(<ProductImagePlaceholder size="sm" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('w-8', 'h-8');
  });

  it('renders with lg size', () => {
    const { container } = render(<ProductImagePlaceholder size="lg" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('w-24', 'h-24');
  });

  it('renders SVG icon (Package from lucide)', () => {
    const { container } = render(<ProductImagePlaceholder />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('has correct background and layout classes', () => {
    const { container } = render(<ProductImagePlaceholder />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('bg-slate-100', 'rounded-md', 'flex', 'items-center', 'justify-center');
  });
});
