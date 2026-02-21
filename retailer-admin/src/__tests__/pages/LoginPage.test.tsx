import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../../pages/LoginPage';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock AuthContext
const mockLogin = vi.fn();
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    isAuthenticated: false,
    isLoading: false,
    user: null,
    store: null,
    isLimitedMode: false,
    logout: vi.fn(),
  }),
}));

// Mock api
vi.mock('../../lib/api', () => ({
  API_GATEWAY_BASE: 'http://localhost:3000',
  safeJson: vi.fn(async (res: Response) => {
    try { return await res.json(); } catch { return null; }
  }),
}));

// Mock firebase
vi.mock('../../lib/firebase', () => ({
  setupRecaptcha: vi.fn(),
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
  isFirebaseReady: vi.fn(() => true),
  cleanup: vi.fn(),
}));

// Mock BuildStamp
vi.mock('../../components/BuildStamp', () => ({
  BuildStamp: () => <span data-testid="build-stamp">v1.0.0</span>,
}));

import { sendOtp, verifyOtp, isFirebaseReady } from '../../lib/firebase';
import { safeJson } from '../../lib/api';

const mockedSendOtp = vi.mocked(sendOtp);
const mockedVerifyOtp = vi.mocked(verifyOtp);
const mockedIsFirebaseReady = vi.mocked(isFirebaseReady);
vi.mocked(safeJson);

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/retailer/login']}>
      <LoginPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
  mockedIsFirebaseReady.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Phone Step Rendering ─────────────────────────────────────────────────

describe('LoginPage phone step', () => {
  it('renders sign in title', () => {
    renderLoginPage();
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
  });

  it('renders phone input field', () => {
    renderLoginPage();
    const phoneInput = screen.getByPlaceholderText('+91 98765 43210');
    expect(phoneInput).toBeInTheDocument();
    expect(phoneInput).toHaveAttribute('type', 'tel');
  });

  it('renders Send OTP button', () => {
    renderLoginPage();
    expect(screen.getByText('Send OTP')).toBeInTheDocument();
  });

  it('renders Register link', () => {
    renderLoginPage();
    expect(screen.getByText('Register')).toBeInTheDocument();
  });

  it('renders Forgot Password link', () => {
    renderLoginPage();
    expect(screen.getByText('Forgot Password?')).toBeInTheDocument();
  });

  it('renders toggle to password login', () => {
    renderLoginPage();
    expect(screen.getByText('Sign in with password instead')).toBeInTheDocument();
  });

  it('shows firebase warning when firebase is not ready', () => {
    mockedIsFirebaseReady.mockReturnValue(false);
    renderLoginPage();
    expect(screen.getByText('Phone Verification Unavailable')).toBeInTheDocument();
  });

  it('disables Send OTP when firebase is not ready', () => {
    mockedIsFirebaseReady.mockReturnValue(false);
    renderLoginPage();
    const sendBtn = screen.getByText('Send OTP');
    expect(sendBtn).toBeDisabled();
  });
});

// ── Phone Validation ─────────────────────────────────────────────────────

describe('Phone validation', () => {
  it('shows error for invalid phone number', async () => {
    renderLoginPage();

    const phoneInput = screen.getByPlaceholderText('+91 98765 43210');
    fireEvent.change(phoneInput, { target: { value: '123' } });

    const sendBtn = screen.getByText('Send OTP');
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid phone number')).toBeInTheDocument();
    });
  });

  it('accepts valid Indian phone numbers', async () => {
    // Mock successful lookup response
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ action: 'LOGIN_ALLOWED' }), { status: 200 })
    );
    mockedSendOtp.mockResolvedValue(true);

    renderLoginPage();

    const phoneInput = screen.getByPlaceholderText('+91 98765 43210');
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });

    const sendBtn = screen.getByText('Send OTP');
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.queryByText('Please enter a valid phone number')).not.toBeInTheDocument();
    });
  });
});

// ── Password Login ───────────────────────────────────────────────────────

describe('Password login mode', () => {
  it('switches to password mode', () => {
    renderLoginPage();

    fireEvent.click(screen.getByText('Sign in with password instead'));

    expect(screen.getByText('Sign in with your account and password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. MYSTORE')).toBeInTheDocument();
  });

  it('validates empty fields in password mode', async () => {
    renderLoginPage();

    fireEvent.click(screen.getByText('Sign in with password instead'));

    const signInBtn = screen.getByText('Sign In');
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(screen.getByText('Please enter your phone number')).toBeInTheDocument();
    });
  });

  it('validates missing store code', async () => {
    renderLoginPage();

    fireEvent.click(screen.getByText('Sign in with password instead'));

    const phoneInput = screen.getByPlaceholderText('+91 98765 43210');
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });

    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Please enter your store code')).toBeInTheDocument();
    });
  });

  it('validates missing password', async () => {
    renderLoginPage();

    fireEvent.click(screen.getByText('Sign in with password instead'));

    const phoneInput = screen.getByPlaceholderText('+91 98765 43210');
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });

    const storeInput = screen.getByPlaceholderText('e.g. MYSTORE');
    fireEvent.change(storeInput, { target: { value: 'STORE1' } });

    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Please enter your password')).toBeInTheDocument();
    });
  });

  it('submits password login and navigates on success', async () => {
    const loginResponse = {
      success: true,
      token: 'jwt-token',
      refreshToken: 'refresh-token',
      user: { id: 'u1', phone: '+919876543210', role: 'admin' },
      stores: [{ id: 's1', code: 'STORE1', name: 'My Store' }],
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(loginResponse), { status: 200 })
    );

    renderLoginPage();

    fireEvent.click(screen.getByText('Sign in with password instead'));

    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. MYSTORE'), { target: { value: 'STORE1' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'password123' } });

    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        'jwt-token',
        'refresh-token',
        expect.objectContaining({ id: 'u1' }),
        expect.objectContaining({ code: 'STORE1' })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/s/STORE1', { replace: true });
    });
  });

  it('shows error on failed password login', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Invalid credentials' } }), { status: 401 })
    );

    renderLoginPage();

    fireEvent.click(screen.getByText('Sign in with password instead'));

    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. MYSTORE'), { target: { value: 'STORE1' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'wrong' } });

    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('switches back to OTP mode', () => {
    renderLoginPage();

    fireEvent.click(screen.getByText('Sign in with password instead'));
    expect(screen.getByText('Sign in with your account and password')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Sign in with OTP instead'));
    expect(screen.getByText(/Enter your registered phone number/)).toBeInTheDocument();
  });
});

// ── OTP Flow ─────────────────────────────────────────────────────────────

describe('OTP flow', () => {
  it('moves to OTP step after successful send', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ action: 'LOGIN_ALLOWED' }), { status: 200 })
    );
    mockedSendOtp.mockResolvedValue(true);

    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(screen.getByText(/Enter the 6-digit code/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter 6-digit PIN')).toBeInTheDocument();
    });
  });

  it('shows not onboarded state for REGISTER_REQUIRED', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ action: 'REGISTER_REQUIRED' }), { status: 200 })
    );

    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(screen.getByText('Account not found')).toBeInTheDocument();
    });
  });

  it('shows error for PENDING_APPROVAL', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ action: 'PENDING_APPROVAL' }), { status: 200 })
    );

    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(screen.getByText(/under review/)).toBeInTheDocument();
    });
  });

  it('shows incomplete registration state', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ action: 'VERIFY_PHONE' }), { status: 200 })
    );

    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(screen.getByText(/registration is incomplete/)).toBeInTheDocument();
      expect(screen.getByText('Resume Registration')).toBeInTheDocument();
    });
  });

  it('shows CONTACT_SUPPORT error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ action: 'CONTACT_SUPPORT' }), { status: 200 })
    );

    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(screen.getByText(/not approved/)).toBeInTheDocument();
    });
  });
});

// ── Store Selection ──────────────────────────────────────────────────────

describe('Store selection', () => {
  it('shows store selection for multiple stores', async () => {
    // First, get to OTP step
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ action: 'LOGIN_ALLOWED' }), { status: 200 })
    );
    mockedSendOtp.mockResolvedValue(true);
    mockedVerifyOtp.mockResolvedValue('firebase-id-token');

    const loginResponse = {
      success: true,
      token: 'jwt',
      user: { id: 'u1', phone: '+91x', role: 'admin' },
      stores: [
        { id: 's1', code: 'STORE1', name: 'Store One' },
        { id: 's2', code: 'STORE2', name: 'Store Two' },
      ],
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(loginResponse), { status: 200 })
    );

    renderLoginPage();

    // Send OTP
    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter 6-digit PIN')).toBeInTheDocument();
    });

    // Enter OTP
    fireEvent.change(screen.getByPlaceholderText('Enter 6-digit PIN'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Store One')).toBeInTheDocument();
      expect(screen.getByText('Store Two')).toBeInTheDocument();
    });
  });

  it('shows no store assigned message when stores empty', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ action: 'LOGIN_ALLOWED' }), { status: 200 })
    );
    mockedSendOtp.mockResolvedValue(true);
    mockedVerifyOtp.mockResolvedValue('firebase-id-token');

    const loginResponse = {
      success: true,
      token: 'jwt',
      user: { id: 'u1', phone: '+91x', role: 'admin' },
      stores: [],
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(loginResponse), { status: 200 })
    );

    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter 6-digit PIN')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Enter 6-digit PIN'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Sign In'));

    await waitFor(() => {
      expect(screen.getByText('No Store Assigned')).toBeInTheDocument();
    });
  });
});

// ── Error Handling ───────────────────────────────────────────────────────

describe('Error handling', () => {
  it('shows error when OTP send fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ action: 'LOGIN_ALLOWED' }), { status: 200 })
    );
    mockedSendOtp.mockRejectedValue(new Error('Too many attempts'));

    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(screen.getByText('Too many attempts')).toBeInTheDocument();
    });
  });

  it('shows error when lookup fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Server error' }), { status: 500 })
    );

    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});

// ── Footer ───────────────────────────────────────────────────────────────

describe('Footer', () => {
  it('renders copyright text', () => {
    renderLoginPage();
    expect(screen.getByText(/2026 SuperMandi/)).toBeInTheDocument();
  });

  it('renders BuildStamp', () => {
    renderLoginPage();
    expect(screen.getByTestId('build-stamp')).toBeInTheDocument();
  });
});
