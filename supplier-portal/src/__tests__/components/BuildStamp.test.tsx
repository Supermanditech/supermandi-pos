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

  it('renders SHA and time from environment variables after mount', async () => {
    process.env.NEXT_PUBLIC_BUILD_SHA = 'abc123';
    process.env.NEXT_PUBLIC_BUILD_TIME = '2026-02-16T10:30:00Z';

    render(<BuildStamp />);

    expect(await screen.findByText(/Build: abc123/)).toBeInTheDocument();
    expect(await screen.findByText(/Deployed: 2026-02-16T10:30:00Z/)).toBeInTheDocument();
  });

  it('renders default values when environment variables are not set', async () => {
    delete process.env.NEXT_PUBLIC_BUILD_SHA;
    delete process.env.NEXT_PUBLIC_BUILD_TIME;

    render(<BuildStamp />);

    expect(await screen.findByText(/Build: dev/)).toBeInTheDocument();
    expect(await screen.findByText(/Deployed: local/)).toBeInTheDocument();
  });

  it('renders with monospace font class (Tailwind font-mono)', () => {
    const { container } = render(<BuildStamp />);

    const buildStampDiv = container.firstChild as HTMLElement;
    expect(buildStampDiv.className).toContain('font-mono');
  });
});
