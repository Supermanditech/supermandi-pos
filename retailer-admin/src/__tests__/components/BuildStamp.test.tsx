import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuildStamp } from '../../components/BuildStamp';

describe('BuildStamp', () => {
  const originalEnv = { ...import.meta.env };

  afterEach(() => {
    // Restore original env
    Object.assign(import.meta.env, originalEnv);
  });

  it('renders build SHA when provided via env', () => {
    // Mock environment variables
    import.meta.env.VITE_BUILD_SHA = 'abc1234';
    import.meta.env.VITE_BUILD_TIME = '2024-01-15T10:30:00Z';

    render(<BuildStamp />);

    expect(screen.getByText(/Build: abc1234/)).toBeInTheDocument();
  });

  it('renders build time when provided via env', () => {
    import.meta.env.VITE_BUILD_SHA = 'abc1234';
    import.meta.env.VITE_BUILD_TIME = '2024-01-15T10:30:00Z';

    render(<BuildStamp />);

    expect(screen.getByText(/Deployed: 2024-01-15T10:30:00Z/)).toBeInTheDocument();
  });

  it('shows dev as default SHA when env not set', () => {
    delete import.meta.env.VITE_BUILD_SHA;
    delete import.meta.env.VITE_BUILD_TIME;

    render(<BuildStamp />);

    expect(screen.getByText(/Build: dev/)).toBeInTheDocument();
  });

  it('shows local as default build time when env not set', () => {
    delete import.meta.env.VITE_BUILD_SHA;
    delete import.meta.env.VITE_BUILD_TIME;

    render(<BuildStamp />);

    expect(screen.getByText(/Deployed: local/)).toBeInTheDocument();
  });

  it('renders complete build stamp format', () => {
    import.meta.env.VITE_BUILD_SHA = 'xyz9876';
    import.meta.env.VITE_BUILD_TIME = '2024-02-16T14:20:00Z';

    render(<BuildStamp />);

    // Check for the complete format: "Build: {sha} · Deployed: {time}"
    expect(screen.getByText(/Build: xyz9876 · Deployed: 2024-02-16T14:20:00Z/)).toBeInTheDocument();
  });

  it('applies monospace font styling', () => {
    import.meta.env.VITE_BUILD_SHA = 'test123';
    import.meta.env.VITE_BUILD_TIME = '2024-01-01T00:00:00Z';

    const { container } = render(<BuildStamp />);

    const buildStampDiv = container.querySelector('div');
    expect(buildStampDiv).toHaveStyle({ fontFamily: 'monospace' });
  });
});
