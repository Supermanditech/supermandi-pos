import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SettingsPage from '../../pages/SettingsPage';

// Mock AuthContext
// MFA-003: Include logout mock — SettingsPage.tsx:377 calls logout() in setTimeout
// after password change success. Missing mock causes "TypeError: logout is not a function"
// uncaught exception that cascades across test files.
const mockLogout = vi.fn();
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({
    store: { id: 's1', code: 'STORE1', name: 'My Store' },
    accessToken: 'test-token',
    isAuthenticated: true,
    logout: mockLogout,
  }),
}));

// Mock api
const mockAuthFetch = vi.fn();
const mockSafeJson = vi.fn();
vi.mock('../../lib/api', () => ({
  authFetch: (...args: any[]) => mockAuthFetch(...args),
  safeJson: (...args: any[]) => mockSafeJson(...args),
  API_GATEWAY_BASE: 'http://localhost:3000',
}));

// Mock Breadcrumb
vi.mock('../../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

// Mock UpiInput — export validateUpiVpa
vi.mock('../../components/UpiInput', () => ({
  validateUpiVpa: (vpa: string): string | undefined => {
    if (!vpa) return undefined; // Optional
    if (!vpa.includes('@')) return 'UPI VPA must contain @';
    if (vpa.length < 5) return 'UPI VPA is too short';
    return undefined;
  },
}));

// ── Test Data ─────────────────────────────────────────────────────────────

const mockSettingsResponse = {
  upiVpa: 'mystore@upi',
  taxRate: 18,
  storeName: 'My Store',
  operatingHours: { open: '09:00', close: '21:00' },
  receiptFooter: 'Thank you for shopping!',
  gstNumber: '22AAAAA0000A1Z5',
  address: '123 Main Street',
  phone: '9876543210',
  receiptSettings: {
    gstin: '22AAAAA0000A1Z5',
    customFooter: 'Exchange within 7 days',
    showTaxBreakdown: false,
  },
};

function renderSettings(path = '/s/STORE1/settings') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/s/:storeCode/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });

  // Default: Settings API returns settings successfully
  mockAuthFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockSettingsResponse),
  });

  mockSafeJson.mockImplementation((res: any) => res.json());
});

afterEach(() => {
  // MFA-003: Flush orphaned setTimeout(logout, 2000) from password change flow
  // to prevent uncaught exceptions leaking into other test files
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

// ── Loading State ─────────────────────────────────────────────────────────

describe('Loading state', () => {
  it('shows loading text initially', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {})); // Never resolves

    renderSettings();

    expect(screen.getByText('Loading settings...')).toBeInTheDocument();
  });
});

// ── Page Rendering ────────────────────────────────────────────────────────

describe('Settings page rendering', () => {
  it('renders Store Settings heading', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Store Settings')).toBeInTheDocument();
    });
  });

  it('renders description text', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText(/Configure your store's payment, tax, and display preferences/)).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    });
  });

  it('renders Payment Settings section', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Payment Settings')).toBeInTheDocument();
    });
  });

  it('renders Tax Settings section', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Tax Settings')).toBeInTheDocument();
    });
  });

  it('renders Store Information section', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Store Information')).toBeInTheDocument();
    });
  });

  it('renders Preferences section', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Preferences')).toBeInTheDocument();
    });
  });

  it('renders Receipt Customization section', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Receipt Customization')).toBeInTheDocument();
    });
  });

  it('renders Change Password section', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getAllByText('Change Password').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders Save Settings button', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
  });
});

// ── Form Fields Population ────────────────────────────────────────────────

describe('Form fields population', () => {
  it('populates UPI VPA from loaded settings', async () => {
    renderSettings();

    await waitFor(() => {
      const input = screen.getByPlaceholderText('yourstore@upi') as HTMLInputElement;
      expect(input.value).toBe('mystore@upi');
    });
  });

  it('populates tax rate from loaded settings', async () => {
    renderSettings();

    await waitFor(() => {
      const input = screen.getByDisplayValue('18') as HTMLInputElement;
      expect(input).toBeInTheDocument();
    });
  });

  it('populates store name from loaded settings', async () => {
    renderSettings();

    await waitFor(() => {
      const input = screen.getByDisplayValue('My Store') as HTMLInputElement;
      expect(input).toBeInTheDocument();
    });
  });

  it('populates phone number from loaded settings', async () => {
    renderSettings();

    await waitFor(() => {
      const input = screen.getByDisplayValue('9876543210') as HTMLInputElement;
      expect(input).toBeInTheDocument();
    });
  });

  it('populates GST number from loaded settings', async () => {
    renderSettings();

    await waitFor(() => {
      const inputs = screen.getAllByDisplayValue('22AAAAA0000A1Z5');
      expect(inputs.length).toBeGreaterThan(0);
    });
  });

  it('populates address from loaded settings', async () => {
    renderSettings();

    await waitFor(() => {
      const textarea = screen.getByDisplayValue('123 Main Street') as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();
    });
  });

  it('populates receipt footer from loaded settings', async () => {
    renderSettings();

    await waitFor(() => {
      const textarea = screen.getByDisplayValue('Thank you for shopping!') as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();
    });
  });

  it('populates operating hours from loaded settings', async () => {
    renderSettings();

    await waitFor(() => {
      const openInput = screen.getByDisplayValue('09:00') as HTMLInputElement;
      const closeInput = screen.getByDisplayValue('21:00') as HTMLInputElement;
      expect(openInput).toBeInTheDocument();
      expect(closeInput).toBeInTheDocument();
    });
  });
});

// ── UPI VPA Validation ────────────────────────────────────────────────────

describe('UPI VPA validation', () => {
  it('shows error for UPI without @', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const upiInput = screen.getByPlaceholderText('yourstore@upi') as HTMLInputElement;
    fireEvent.change(upiInput, { target: { value: 'invalidupi' } });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('UPI VPA must contain @')).toBeInTheDocument();
    });
  });

  it('accepts valid UPI VPA', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const upiInput = screen.getByPlaceholderText('yourstore@upi') as HTMLInputElement;
    fireEvent.change(upiInput, { target: { value: 'store@ybl' } });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
    });
  });

  it('accepts empty UPI VPA (optional)', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const upiInput = screen.getByPlaceholderText('yourstore@upi') as HTMLInputElement;
    fireEvent.change(upiInput, { target: { value: '' } });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
    });
  });
});

// ── Tax Rate Validation ───────────────────────────────────────────────────

describe('Tax rate validation', () => {
  it('shows error for tax rate above 28', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    // Find the GST Rate input and change it
    const taxInput = screen.getByDisplayValue('18') as HTMLInputElement;
    fireEvent.change(taxInput, { target: { value: '50' } });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Tax rate must be between 0% and 28%')).toBeInTheDocument();
    });
  });

  it('shows error for negative tax rate', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const taxInput = screen.getByDisplayValue('18') as HTMLInputElement;
    fireEvent.change(taxInput, { target: { value: '-5' } });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Tax rate must be between 0% and 28%')).toBeInTheDocument();
    });
  });

  it('accepts tax rate of 0', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const taxInput = screen.getByDisplayValue('18') as HTMLInputElement;
    fireEvent.change(taxInput, { target: { value: '0' } });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
    });
  });
});

// ── Phone Validation ──────────────────────────────────────────────────────

describe('Phone validation', () => {
  it('shows error for invalid phone number', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const phoneInput = screen.getByDisplayValue('9876543210') as HTMLInputElement;
    fireEvent.change(phoneInput, { target: { value: '1234' } });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Invalid phone number (10 digits starting with 6-9)')).toBeInTheDocument();
    });
  });

  it('accepts valid phone number starting with 6-9', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const phoneInput = screen.getByDisplayValue('9876543210') as HTMLInputElement;
    fireEvent.change(phoneInput, { target: { value: '7890123456' } });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
    });
  });

  it('accepts empty phone (optional)', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const phoneInput = screen.getByDisplayValue('9876543210') as HTMLInputElement;
    fireEvent.change(phoneInput, { target: { value: '' } });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
    });
  });
});

// ── GST Number Validation ─────────────────────────────────────────────────

describe('GST number validation', () => {
  it('shows error for invalid GST format', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    // Find the GST Number input and change it
    const gstInputs = screen.getAllByDisplayValue('22AAAAA0000A1Z5');
    // The first one is the GST Number field in Tax Settings
    fireEvent.change(gstInputs[0], { target: { value: 'INVALID' } });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Invalid GST number format')).toBeInTheDocument();
    });
  });

  it('accepts empty GST number (optional)', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const gstInputs = screen.getAllByDisplayValue('22AAAAA0000A1Z5');
    fireEvent.change(gstInputs[0], { target: { value: '' } });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
    });
  });
});

// ── Save Settings ─────────────────────────────────────────────────────────

describe('Save settings', () => {
  it('calls API with PATCH method on save', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/v1/retailer-admin/settings',
        'test-token',
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });
  });

  it('shows success message after saving', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
    });
  });

  it('shows error message when save fails', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'Invalid settings payload' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Invalid settings payload')).toBeInTheDocument();
    });
  });

  it('shows error when save throws network error', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('includes receiptSettings in save payload', async () => {
    let savedPayload: any = null;

    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        savedPayload = JSON.parse(options.body);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(savedPayload).toBeTruthy();
      expect(savedPayload.receiptSettings).toBeDefined();
      expect(savedPayload.receiptSettings).toHaveProperty('gstin');
      expect(savedPayload.receiptSettings).toHaveProperty('customFooter');
      expect(savedPayload.receiptSettings).toHaveProperty('showTaxBreakdown');
    });
  });
});

// ── Change Password ───────────────────────────────────────────────────────

describe('Change password', () => {
  it('renders password fields', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getAllByText('Change Password').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByPlaceholderText('Enter current password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Min 8 chars, 1 upper, 1 lower, 1 number')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Re-enter new password')).toBeInTheDocument();
  });

  it('renders Change Password button', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password', { selector: 'button' })).toBeInTheDocument();
    });
  });

  it('shows error when current password is empty', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password', { selector: 'button' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Change Password', { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('Please enter your current password')).toBeInTheDocument();
    });
  });

  it('shows error when new password is less than 8 characters', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password', { selector: 'button' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Enter current password'), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 chars, 1 upper, 1 lower, 1 number'), { target: { value: 'short' } });

    fireEvent.click(screen.getByText('Change Password', { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('New password must be at least 8 characters')).toBeInTheDocument();
    });
  });

  it('shows error when password lacks uppercase/lowercase/digit', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password', { selector: 'button' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Enter current password'), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 chars, 1 upper, 1 lower, 1 number'), { target: { value: 'alllowercase' } });

    fireEvent.click(screen.getByText('Change Password', { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText(/Password must contain at least one uppercase letter, one lowercase letter, and one number/)).toBeInTheDocument();
    });
  });

  it('shows error when passwords do not match', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password', { selector: 'button' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Enter current password'), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 chars, 1 upper, 1 lower, 1 number'), { target: { value: 'NewPass1234' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter new password'), { target: { value: 'DifferentPass1' } });

    fireEvent.click(screen.getByText('Change Password', { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
    });
  });

  it('successfully changes password', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (_url.includes('change-password') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password', { selector: 'button' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Enter current password'), { target: { value: 'OldPass123' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 chars, 1 upper, 1 lower, 1 number'), { target: { value: 'NewPass1234' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter new password'), { target: { value: 'NewPass1234' } });

    fireEvent.click(screen.getByText('Change Password', { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('Password changed successfully!')).toBeInTheDocument();
    });
  });

  it('clears password fields after successful change', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (_url.includes('change-password') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password', { selector: 'button' })).toBeInTheDocument();
    });

    const currentInput = screen.getByPlaceholderText('Enter current password') as HTMLInputElement;
    const newInput = screen.getByPlaceholderText('Min 8 chars, 1 upper, 1 lower, 1 number') as HTMLInputElement;
    const confirmInput = screen.getByPlaceholderText('Re-enter new password') as HTMLInputElement;

    fireEvent.change(currentInput, { target: { value: 'OldPass123' } });
    fireEvent.change(newInput, { target: { value: 'NewPass1234' } });
    fireEvent.change(confirmInput, { target: { value: 'NewPass1234' } });

    fireEvent.click(screen.getByText('Change Password', { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('Password changed successfully!')).toBeInTheDocument();
    });

    // Fields should be cleared
    expect(currentInput.value).toBe('');
    expect(newInput.value).toBe('');
    expect(confirmInput.value).toBe('');
  });

  it('shows error when change password API fails', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (_url.includes('change-password') && options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: { message: 'Current password is incorrect' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password', { selector: 'button' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Enter current password'), { target: { value: 'WrongPass123' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 chars, 1 upper, 1 lower, 1 number'), { target: { value: 'NewPass1234' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter new password'), { target: { value: 'NewPass1234' } });

    fireEvent.click(screen.getByText('Change Password', { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('Current password is incorrect')).toBeInTheDocument();
    });
  });

  it('sends correct payload to change password API', async () => {
    let capturedPayload: any = null;

    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (_url.includes('change-password') && options?.method === 'POST') {
        capturedPayload = JSON.parse(options.body);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password', { selector: 'button' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Enter current password'), { target: { value: 'OldPass123' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 chars, 1 upper, 1 lower, 1 number'), { target: { value: 'NewPass1234' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter new password'), { target: { value: 'NewPass1234' } });

    fireEvent.click(screen.getByText('Change Password', { selector: 'button' }));

    await waitFor(() => {
      expect(capturedPayload).toEqual({
        currentPassword: 'OldPass123',
        newPassword: 'NewPass1234',
      });
    });
  });
});

// ── Receipt Customization ─────────────────────────────────────────────────

describe('Receipt customization', () => {
  it('renders Receipt GSTIN field', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Receipt GSTIN')).toBeInTheDocument();
    });
  });

  it('renders Show Tax Breakdown checkbox', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Show Tax Breakdown on Receipt')).toBeInTheDocument();
    });
  });

  it('renders Custom Receipt Footer textarea', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Custom Receipt Footer')).toBeInTheDocument();
    });
  });

  it('shows character count for custom footer', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText(/\/300 characters/)).toBeInTheDocument();
    });
  });

  it('renders receipt footer character counter', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText(/\/200 characters/)).toBeInTheDocument();
    });
  });
});

// ── Error State on Load ───────────────────────────────────────────────────

describe('Error state on load', () => {
  it('still renders page when settings API fails', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Failed to load'));

    renderSettings();

    await waitFor(() => {
      // Should still render the form with defaults
      expect(screen.getByText('Store Settings')).toBeInTheDocument();
    });
  });

  it('uses store name as fallback when API fails', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Failed to load'));

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    // Store name from AuthContext should be used as fallback
    const storeNameInput = screen.getByDisplayValue('My Store') as HTMLInputElement;
    expect(storeNameInput).toBeInTheDocument();
  });
});

// ── Field Interaction ─────────────────────────────────────────────────────

describe('Field interaction', () => {
  it('clears success message when a field is changed', async () => {
    mockAuthFetch.mockImplementation((_url: string, _token: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSettingsResponse),
      });
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    // Save first
    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
    });

    // Change a field — success message should disappear
    const storeNameInput = screen.getByDisplayValue('My Store') as HTMLInputElement;
    fireEvent.change(storeNameInput, { target: { value: 'Updated Store Name' } });

    await waitFor(() => {
      expect(screen.queryByText('Settings saved successfully!')).not.toBeInTheDocument();
    });
  });

  it('updates operating hours', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const openInput = screen.getByDisplayValue('09:00') as HTMLInputElement;
    fireEvent.change(openInput, { target: { value: '08:00' } });

    expect(openInput.value).toBe('08:00');
  });
});
