import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from '../../app/page';

// Mock next/navigation
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));

// Mock API — source imports hasAuthCookie (FIX-023)
const mockHasAuthCookie = jest.fn();
jest.mock('../../lib/api', () => ({
  hasAuthCookie: () => mockHasAuthCookie(),
}));

describe('HomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /dashboard when auth cookie exists', () => {
    mockHasAuthCookie.mockReturnValue(true);
    render(<HomePage />);
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects to /login when no auth cookie', () => {
    mockHasAuthCookie.mockReturnValue(false);
    render(<HomePage />);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('renders loading spinner', () => {
    mockHasAuthCookie.mockReturnValue(false);
    const { container } = render(<HomePage />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
