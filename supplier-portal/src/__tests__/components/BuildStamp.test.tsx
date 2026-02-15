import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BuildStamp } from '../../components/BuildStamp';

describe('BuildStamp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('renders SHA and time from environment variables', () => {
    process.env.NEXT_PUBLIC_BUILD_SHA = 'abc123';
    process.env.NEXT_PUBLIC_BUILD_TIME = '2026-02-16T10:30:00Z';

    render(<BuildStamp />);

    expect(screen.getByText(/Build: abc123/)).toBeInTheDocument();
    expect(screen.getByText(/Deployed: 2026-02-16T10:30:00Z/)).toBeInTheDocument();
  });

  it('renders default values when environment variables are not set', () => {
    delete process.env.NEXT_PUBLIC_BUILD_SHA;
    delete process.env.NEXT_PUBLIC_BUILD_TIME;

    render(<BuildStamp />);

    expect(screen.getByText(/Build: dev/)).toBeInTheDocument();
    expect(screen.getByText(/Deployed: local/)).toBeInTheDocument();
  });

  it('renders with monospace font', () => {
    const { container } = render(<BuildStamp />);

    const buildStampDiv = container.firstChild as HTMLElement;
    expect(buildStampDiv).toHaveStyle({ fontFamily: 'monospace' });
  });
});
