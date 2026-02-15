import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ErrorPage from '../../app/error';

// Create error using native Error (not the imported component)
const NativeError = globalThis.Error;

// Mock window.location
const originalLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { href: '' },
  });
});
afterAll(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: originalLocation,
  });
});

describe('Error Page', () => {
  const mockReset = jest.fn();
  const mockError = new NativeError('Test error message') as Error & { digest?: string };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('renders error heading', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders error description', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
  });

  it('renders Try Again button', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders Go Home button', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    expect(screen.getByText('Go Home')).toBeInTheDocument();
  });

  it('calls reset when Try Again is clicked', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    fireEvent.click(screen.getByText('Try Again'));
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('navigates to home when Go Home is clicked', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    fireEvent.click(screen.getByText('Go Home'));
    expect(window.location.href).toBe('/');
  });

  it('logs error to console', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    expect(console.error).toHaveBeenCalledWith(
      '[GO-LIVE-172] Application error caught:',
      mockError
    );
  });
});
