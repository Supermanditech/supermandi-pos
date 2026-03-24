// GCP-STG-0547: Behavioral test for TOTP backup codes UI in TotpSetupCard
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TotpSetupCard } from '../../components/TotpSetupCard';

// Mock authToken module — prevent real network calls
vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
  fetchWithTimeout: vi.fn(),
}));

// Import the mock so we can control responses per-test
import { fetchWithTimeout } from '../../api/authToken';
const mockFetch = vi.mocked(fetchWithTimeout);

/** Helper: mock the initial GET status check (returns idle / not enabled) */
function mockStatusIdle() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ enabled: false }),
  } as unknown as Response);
}

/** Helper: mock POST /totp-setup returning setup data with backup codes */
function mockSetupWithBackupCodes(codes: string[] = ['AAAA1111', 'BBBB2222', 'CCCC3333', 'DDDD4444']) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      secret: 'JBSWY3DPEHPK3PXP',
      qrCodeDataUrl: 'data:image/png;base64,fake',
      backupCodes: codes,
    }),
  } as unknown as Response);
}

/** Helper: render TotpSetupCard in idle state then click Enable to reach setup with backup codes */
async function renderWithBackupCodes(codes?: string[]) {
  mockStatusIdle();
  render(<TotpSetupCard />);

  // Wait for status check to finish
  await waitFor(() => {
    expect(screen.getByText('Enable 2FA')).toBeTruthy();
  });

  // Now mock the setup POST
  mockSetupWithBackupCodes(codes);
  fireEvent.click(screen.getByText('Enable 2FA'));

  // Wait for backup codes to appear
  await waitFor(() => {
    expect(screen.getByText(/Backup codes/)).toBeTruthy();
  });
}

describe('TotpSetupCard — backup codes UI (GCP-STG-0547)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset clipboard mock
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  // ===========================================================================
  // 1. Backup codes are rendered when setup returns them
  // ===========================================================================
  it('renders all backup codes from setup response', async () => {
    const codes = ['CODE1111', 'CODE2222', 'CODE3333', 'CODE4444'];
    await renderWithBackupCodes(codes);

    for (const code of codes) {
      expect(screen.getByText(code)).toBeTruthy();
    }
  });

  // ===========================================================================
  // 2. "Copy All" button exists
  // ===========================================================================
  it('shows Copy All button when backup codes are displayed', async () => {
    await renderWithBackupCodes();
    expect(screen.getByText('Copy All')).toBeTruthy();
  });

  // ===========================================================================
  // 3. "Download" button exists
  // ===========================================================================
  it('shows Download as Text button when backup codes are displayed', async () => {
    await renderWithBackupCodes();
    expect(screen.getByText('Download as Text')).toBeTruthy();
  });

  // ===========================================================================
  // 4. "I have saved" checkbox exists
  // ===========================================================================
  it('shows "I have saved these recovery codes" checkbox', async () => {
    await renderWithBackupCodes();
    expect(screen.getByText(/I have saved these recovery codes/)).toBeTruthy();
    // The checkbox itself
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeTruthy();
    expect(checkbox).not.toBeChecked();
  });

  // ===========================================================================
  // 5. Verify button is disabled when checkbox is unchecked
  // ===========================================================================
  it('disables Verify & Enable button when codes-saved checkbox is unchecked', async () => {
    await renderWithBackupCodes();
    const verifyBtn = screen.getByText('Verify & Enable');
    // Should be disabled because checkbox is unchecked (and code is empty, but
    // the backup-codes guard is the one we're testing)
    expect(verifyBtn).toBeDisabled();
  });

  it('enables Verify & Enable button when checkbox is checked AND 6-digit code entered', async () => {
    await renderWithBackupCodes();

    // Check the checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Enter a 6-digit code
    const input = screen.getByLabelText('TOTP verification code');
    fireEvent.change(input, { target: { value: '123456' } });

    // Now the button should be enabled
    const verifyBtn = screen.getByText('Verify & Enable');
    expect(verifyBtn).not.toBeDisabled();
  });

  // ===========================================================================
  // 6. Copy All button invokes clipboard API
  // ===========================================================================
  it('Copy All button calls navigator.clipboard.writeText with codes', async () => {
    const codes = ['AAAA1111', 'BBBB2222'];
    await renderWithBackupCodes(codes);

    fireEvent.click(screen.getByText('Copy All'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(codes.join('\n'));
  });

  // ===========================================================================
  // 7. Copy All label changes to "Copied!" after click
  // ===========================================================================
  it('Copy All label changes to Copied! after click', async () => {
    await renderWithBackupCodes();

    fireEvent.click(screen.getByText('Copy All'));
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeTruthy();
    });
  });

  // ===========================================================================
  // 8. No backup codes section when array is empty
  // ===========================================================================
  it('does not render backup codes section when backupCodes is empty', async () => {
    mockStatusIdle();
    render(<TotpSetupCard />);

    await waitFor(() => {
      expect(screen.getByText('Enable 2FA')).toBeTruthy();
    });

    // Setup with empty backup codes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeDataUrl: 'data:image/png;base64,fake',
        backupCodes: [],
      }),
    } as unknown as Response);

    fireEvent.click(screen.getByText('Enable 2FA'));

    await waitFor(() => {
      expect(screen.getByText(/Scan this QR code/)).toBeTruthy();
    });

    // Backup codes heading should NOT be present
    expect(screen.queryByText(/Backup codes/)).toBeNull();
    // Verify button should be enabled (no checkbox gate when no backup codes)
    // Just need 6 digits
    const input = screen.getByLabelText('TOTP verification code');
    fireEvent.change(input, { target: { value: '123456' } });
    const verifyBtn = screen.getByText('Verify & Enable');
    expect(verifyBtn).not.toBeDisabled();
  });
});
