// SuperAdmin — Test PayloadDetails component
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PayloadDetails } from '../../components/PayloadDetails';

describe('PayloadDetails', () => {
  it('renders View JSON summary', () => {
    render(<PayloadDetails payload={{ key: 'value' }} />);
    expect(screen.getByText('View JSON')).toBeTruthy();
  });

  it('does not show pre content initially (closed)', () => {
    const { container } = render(<PayloadDetails payload={{ key: 'value' }} />);
    expect(container.querySelector('pre')).toBeNull();
  });

  it('renders details element for expanding JSON', () => {
    const { container } = render(<PayloadDetails payload={{ name: 'test', count: 42 }} />);
    const details = container.querySelector('details');
    expect(details).toBeTruthy();
    const summary = container.querySelector('summary');
    expect(summary).toBeTruthy();
    expect(summary!.textContent).toBe('View JSON');
  });

  it('handles null payload', () => {
    render(<PayloadDetails payload={null} />);
    expect(screen.getByText('View JSON')).toBeTruthy();
  });

  it('handles string payload', () => {
    render(<PayloadDetails payload="hello world" />);
    expect(screen.getByText('View JSON')).toBeTruthy();
  });

  it('handles array payload', () => {
    render(<PayloadDetails payload={[1, 2, 3]} />);
    expect(screen.getByText('View JSON')).toBeTruthy();
  });

  it('handles complex nested payload', () => {
    const payload = {
      order: { id: 'o1', items: [{ name: 'Item 1', qty: 2 }] },
      total: 5000,
    };
    render(<PayloadDetails payload={payload} />);
    expect(screen.getByText('View JSON')).toBeTruthy();
  });
});
