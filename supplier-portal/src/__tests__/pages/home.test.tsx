import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from '../../app/page';

// Mock next/navigation
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));

// Mock API
const mockGetAuthToken = jest.fn();
jest.mock('../../lib/api', () => ({
  getAuthToken: () => mockGetAuthToken(),
}));

describe('HomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /dashboard when auth token exists', () => {
    mockGetAuthToken.mockReturnValue('valid-token');
    render(<HomePage />);
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects to /login when no auth token', () => {
    mockGetAuthToken.mockReturnValue(null);
    render(<HomePage />);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('renders loading spinner', () => {
    mockGetAuthToken.mockReturnValue(null);
    const { container } = render(<HomePage />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
