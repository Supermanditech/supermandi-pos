// SuperAdmin — Test DevicesTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DevicesTab } from '../../tabs/DevicesTab';

vi.mock('../../ui/status', () => ({
  isDeviceOnline: vi.fn(() => true),
  composeDeviceMessage: vi.fn(() => 'All good. Device is online and ready.'),
  getDeviceTone: vi.fn(() => 'success'),
}));

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr-code">{value}</div>,
}));

vi.mock('../../components/EnrollmentCountdown', () => ({
  EnrollmentCountdown: () => <span>5m 00s</span>,
}));

vi.mock('../../components/DeviceWhitelistSection', () => ({
  DeviceWhitelistSection: () => <div data-testid="whitelist-section">Whitelist</div>,
}));

const makeDeviceRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'dev-001',
  store_id: 's1',
  store_name: 'Test Store',
  label: 'Counter 1',
  device_type: 'RETAILER_PHONE',
  printing_mode: 'NONE',
  scan_lookup_v2_enabled: false,
  active: true,
  last_seen_online: '2026-03-10T10:00:00Z',
  last_sync_at: '2026-03-10T09:55:00Z',
  pending_outbox_count: 0,
  manufacturer: 'Samsung',
  model: 'Galaxy A15',
  android_version: '14',
  app_version: '2.1.0',
  ...overrides,
});

const makeDeviceActivity = (overrides: Record<string, unknown> = {}) => ({
  deviceId: 'd1',
  storeId: 's1',
  lastSeen: '2026-01-01',
  lastEventType: 'SALE',
  eventCount: 10,
  ...overrides,
});

function createProps(overrides: Partial<Parameters<typeof DevicesTab>[0]> = {}) {
  return {
    enrollStoreId: '',
    setEnrollStoreId: vi.fn(),
    handleCreateEnrollment: vi.fn(),
    enrollLoading: false,
    enrollError: '',
    enrollment: null,
    deviceActionError: '',
    devicesError: '',
    filteredDeviceRecords: [] as any[],
    deviceEdits: {},
    updateDeviceDraft: vi.fn(),
    deviceSaving: {},
    requestDeviceSave: vi.fn(),
    requestDeviceReset: vi.fn(),
    requestForceReEnroll: vi.fn(),
    // SA-P1-013
    requestRevokeToken: vi.fn(),
    revokingTokenDevices: {},
    // SA-P2-005
    requestForceSync: vi.fn(),
    forceSyncingDevices: {},
    // SA-P2-002
    handlePushConfig: vi.fn().mockResolvedValue(undefined),
    handleBroadcastConfig: vi.fn().mockResolvedValue(undefined),
    configPushHistory: [] as any[],
    configPushLoading: false,
    refreshConfigPushHistory: vi.fn(),
    devicePage: 0,
    setDevicePage: vi.fn(),
    devicesLoading: false,
    deviceTotal: 0,
    refreshDevices: vi.fn(),
    limit: 100,
    devices: [] as any[],
    storeDirectory: [],
    handleRevokeEnrollment: vi.fn(),
    revokeLoading: null,
    ...overrides,
  };
}

describe('DevicesTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Enrollment Section ──────────────────────────────────────

  it('renders Add Device header', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('Add Device')).toBeTruthy();
  });

  it('renders enrollment subtitle', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText(/Scan this QR from POS/)).toBeTruthy();
  });

  it('renders store select dropdown', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('-- Select a store --')).toBeTruthy();
  });

  it('renders store options from storeDirectory', () => {
    const stores = [
      { id: 's1', name: 'Store Alpha' },
      { id: 's2', storeName: 'Store Beta' },
    ];
    render(<DevicesTab {...createProps({ storeDirectory: stores })} />);
    expect(screen.getByText('Store Alpha')).toBeTruthy();
    expect(screen.getByText('Store Beta')).toBeTruthy();
  });

  it('shows Create enrollment button', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('Create enrollment')).toBeTruthy();
  });

  it('shows Generating... when enrollLoading', () => {
    render(<DevicesTab {...createProps({ enrollLoading: true })} />);
    expect(screen.getByText('Generating...')).toBeTruthy();
  });

  it('calls handleCreateEnrollment on button click', () => {
    const handler = vi.fn();
    render(<DevicesTab {...createProps({ handleCreateEnrollment: handler })} />);
    fireEvent.click(screen.getByText('Create enrollment'));
    expect(handler).toHaveBeenCalled();
  });

  it('shows enrollment error with role=alert', () => {
    render(<DevicesTab {...createProps({ enrollError: 'Invalid store' })} />);
    expect(screen.getByText('Invalid store')).toBeTruthy();
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
  });

  // ── Enrollment QR Card ──────────────────────────────────────

  it('renders QR code when enrollment exists', () => {
    const enrollment = { code: 'ABC123', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'payload-data' };
    render(<DevicesTab {...createProps({ enrollment })} />);
    expect(screen.getByTestId('qr-code')).toBeTruthy();
    // payload-data appears in both QR mock and mono display
    const payloadElements = screen.getAllByText('payload-data');
    expect(payloadElements.length).toBeGreaterThanOrEqual(2);
  });

  it('renders enrollment code badge', () => {
    const enrollment = { code: 'XYZ789', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'data' };
    render(<DevicesTab {...createProps({ enrollment })} />);
    expect(screen.getByText('Code: XYZ789')).toBeTruthy();
  });

  it('renders countdown timer', () => {
    const enrollment = { code: 'ABC', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'data' };
    render(<DevicesTab {...createProps({ enrollment })} />);
    expect(screen.getByText('5m 00s')).toBeTruthy();
  });

  it('renders Copy code button', () => {
    const enrollment = { code: 'ABC', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'data' };
    render(<DevicesTab {...createProps({ enrollment })} />);
    expect(screen.getByText('Copy code')).toBeTruthy();
  });

  it('renders Copy QR payload button', () => {
    const enrollment = { code: 'ABC', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'data' };
    render(<DevicesTab {...createProps({ enrollment })} />);
    expect(screen.getByText('Copy QR payload')).toBeTruthy();
  });

  it('renders Regenerate QR button', () => {
    const enrollment = { code: 'ABC', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'data' };
    render(<DevicesTab {...createProps({ enrollment })} />);
    expect(screen.getByText('Regenerate QR')).toBeTruthy();
  });

  it('renders Revoke Code button', () => {
    const enrollment = { code: 'ABC', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'data' };
    render(<DevicesTab {...createProps({ enrollment })} />);
    expect(screen.getByText('Revoke Code')).toBeTruthy();
  });

  it('calls handleRevokeEnrollment on Revoke click', () => {
    const handler = vi.fn();
    const enrollment = { code: 'REVOKE1', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'data' };
    render(<DevicesTab {...createProps({ enrollment, handleRevokeEnrollment: handler })} />);
    fireEvent.click(screen.getByText('Revoke Code'));
    expect(handler).toHaveBeenCalledWith('REVOKE1');
  });

  it('shows Revoking... when revokeLoading', () => {
    const enrollment = { code: 'ABC', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'data' };
    render(<DevicesTab {...createProps({ enrollment, revokeLoading: 'ABC' })} />);
    expect(screen.getByText('Revoking...')).toBeTruthy();
  });

  // ── Devices Status Section ──────────────────────────────────

  it('renders Devices (status) header', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('Devices (status)')).toBeTruthy();
  });

  it('shows empty devices state when no records', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('No devices synced yet.')).toBeTruthy();
  });

  it('shows device action error', () => {
    render(<DevicesTab {...createProps({ deviceActionError: 'Save failed' })} />);
    expect(screen.getByText('Save failed')).toBeTruthy();
  });

  it('shows devices error', () => {
    render(<DevicesTab {...createProps({ devicesError: 'Fetch failed' })} />);
    expect(screen.getByText('Fetch failed')).toBeTruthy();
  });

  it('renders device card with label input', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    const input = screen.getByPlaceholderText('Device label');
    expect(input).toBeTruthy();
  });

  it('renders Online badge for online device', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    expect(screen.getByText('Online')).toBeTruthy();
  });

  it('renders Active badge for active device', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    // "Active" appears as badge and checkbox label
    const activeElements = screen.getAllByText('Active');
    expect(activeElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders device metadata (store, device ID)', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    expect(screen.getByText('dev-001')).toBeTruthy();
    expect(screen.getByText('Test Store')).toBeTruthy();
  });

  it('renders manufacturer and model', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    expect(screen.getByText('Samsung Galaxy A15')).toBeTruthy();
  });

  it('renders android version', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    expect(screen.getByText('14')).toBeTruthy();
  });

  it('renders app version', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    expect(screen.getByText('2.1.0')).toBeTruthy();
  });

  it('renders Save and Reset Token buttons', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Reset Token')).toBeTruthy();
  });

  it('calls requestDeviceSave on Save click', () => {
    const handler = vi.fn();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()], requestDeviceSave: handler })} />);
    fireEvent.click(screen.getByText('Save'));
    expect(handler).toHaveBeenCalledWith('dev-001');
  });

  it('calls requestDeviceReset on Reset Token click', () => {
    const handler = vi.fn();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()], requestDeviceReset: handler })} />);
    fireEvent.click(screen.getByText('Reset Token'));
    expect(handler).toHaveBeenCalledWith('dev-001');
  });

  it('shows Saving... when device is saving', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()], deviceSaving: { 'dev-001': true } })} />);
    expect(screen.getByText('Saving...')).toBeTruthy();
  });

  it('renders V2 Scan toggle', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    expect(screen.getByText('V2 Scan')).toBeTruthy();
  });

  it('renders device type dropdown', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    // Device type options: OEM Handheld, SuperMandi Phone, Retailer Phone
    const retailerPhoneElements = screen.getAllByText('Retailer Phone');
    expect(retailerPhoneElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders printing mode dropdown', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    // "None" appears as printing mode option — may duplicate with other text
    const noneElements = screen.getAllByText('None');
    expect(noneElements.length).toBeGreaterThanOrEqual(1);
  });

  // ── Device Activity Section ─────────────────────────────────

  it('renders Device Activity header', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('Device Activity (from events)')).toBeTruthy();
  });

  it('shows device activity empty state', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('No devices seen yet.')).toBeTruthy();
  });

  it('renders device activity table when devices exist', () => {
    const devices = [makeDeviceActivity()];
    render(<DevicesTab {...createProps({ devices })} />);
    expect(screen.getByText('d1')).toBeTruthy();
    expect(screen.getByText('s1')).toBeTruthy();
    expect(screen.getByText('SALE')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('renders device activity table headers', () => {
    const devices = [makeDeviceActivity()];
    render(<DevicesTab {...createProps({ devices })} />);
    expect(screen.getByText('Device ID')).toBeTruthy();
    expect(screen.getByText('Store ID (last)')).toBeTruthy();
    expect(screen.getByText('Last seen')).toBeTruthy();
    expect(screen.getByText('Last event')).toBeTruthy();
    expect(screen.getByText('Events (window)')).toBeTruthy();
  });

  it('renders multiple device activity rows', () => {
    const devices = [
      makeDeviceActivity({ deviceId: 'd1', eventCount: 5 }),
      makeDeviceActivity({ deviceId: 'd2', eventCount: 15 }),
    ];
    render(<DevicesTab {...createProps({ devices })} />);
    expect(screen.getByText('d1')).toBeTruthy();
    expect(screen.getByText('d2')).toBeTruthy();
  });

  // ── Pagination ──────────────────────────────────────────────

  it('renders pagination info for device records', () => {
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [makeDeviceRecord()],
      deviceTotal: 1,
    })} />);
    expect(screen.getByText(/Page 1/)).toBeTruthy();
    expect(screen.getByText(/1 devices/)).toBeTruthy();
  });

  it('disables Prev on first page', () => {
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [makeDeviceRecord()],
      devicePage: 0,
      deviceTotal: 100,
    })} />);
    expect(screen.getByText('Prev')).toHaveProperty('disabled', true);
  });

  it('enables Next when more pages exist', () => {
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [makeDeviceRecord()],
      devicePage: 0,
      deviceTotal: 100,
    })} />);
    expect(screen.getByText('Next')).toHaveProperty('disabled', false);
  });

  it('disables Next on last page', () => {
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [makeDeviceRecord()],
      devicePage: 0,
      deviceTotal: 50,
    })} />);
    expect(screen.getByText('Next')).toHaveProperty('disabled', true);
  });

  it('calls setDevicePage and refreshDevices on Next click', () => {
    const setDevicePage = vi.fn();
    const refreshDevices = vi.fn();
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [makeDeviceRecord()],
      devicePage: 0,
      deviceTotal: 100,
      setDevicePage,
      refreshDevices,
    })} />);
    fireEvent.click(screen.getByText('Next'));
    expect(setDevicePage).toHaveBeenCalledWith(1);
    expect(refreshDevices).toHaveBeenCalledWith(1);
  });

  it('shows Loading text on pagination buttons when devicesLoading', () => {
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [makeDeviceRecord()],
      deviceTotal: 100,
      devicesLoading: true,
    })} />);
    const loadingButtons = screen.getAllByText('Loading…');
    expect(loadingButtons.length).toBe(2);
  });

  // ── Store Dropdown ────────────────────────────────────────

  it('calls setEnrollStoreId on store dropdown change', () => {
    const setEnrollStoreId = vi.fn();
    const stores = [{ id: 's1', name: 'Store A' }];
    render(<DevicesTab {...createProps({ storeDirectory: stores, setEnrollStoreId })} />);
    const select = screen.getByLabelText('Select store for enrollment');
    fireEvent.change(select, { target: { value: 's1' } });
    expect(setEnrollStoreId).toHaveBeenCalledWith('s1');
  });

  it('falls back to store ID when name and storeName are null', () => {
    const stores = [{ id: 's-fallback-id', name: null, storeName: null }];
    render(<DevicesTab {...createProps({ storeDirectory: stores })} />);
    expect(screen.getByText('s-fallback-id')).toBeTruthy();
  });

  // ── Device Draft Updates ──────────────────────────────────

  it('calls updateDeviceDraft on label input change', () => {
    const updateDeviceDraft = vi.fn();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()], updateDeviceDraft })} />);
    fireEvent.change(screen.getByPlaceholderText('Device label'), { target: { value: 'New Label' } });
    expect(updateDeviceDraft).toHaveBeenCalledWith('dev-001', { label: 'New Label' });
  });

  it('calls updateDeviceDraft on V2 Scan toggle', () => {
    const updateDeviceDraft = vi.fn();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()], updateDeviceDraft })} />);
    const checkbox = screen.getByTitle('Enable V2 Scan Lookup (faster barcode resolution)').querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox!);
    expect(updateDeviceDraft).toHaveBeenCalledWith('dev-001', expect.objectContaining({ scanLookupV2Enabled: true }));
  });

  // ── Confirm Dialog: Deactivation ─────────────────────────

  it('shows confirm dialog when deactivating device', () => {
    const device = makeDeviceRecord({ active: true });
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [device],
      deviceEdits: { 'dev-001': { label: 'Counter 1', deviceType: 'RETAILER_PHONE' as any, printingMode: 'NONE', scanLookupV2Enabled: false, active: false } },
    })} />);
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByText('Confirm Device Deactivation')).toBeTruthy();
  });

  it('does not show confirm dialog when saving without deactivation', () => {
    const handler = vi.fn();
    const device = makeDeviceRecord({ active: true });
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [device],
      deviceEdits: { 'dev-001': { label: 'Updated', deviceType: 'RETAILER_PHONE' as any, printingMode: 'NONE', scanLookupV2Enabled: false, active: true } },
      requestDeviceSave: handler,
    })} />);
    fireEvent.click(screen.getByText('Save'));
    expect(handler).toHaveBeenCalledWith('dev-001');
    expect(screen.queryByText('Confirm Device Deactivation')).toBeNull();
  });

  // ── Confirm Dialog: Regenerate QR ─────────────────────────

  it('shows confirm dialog on Regenerate QR click', () => {
    const enrollment = { code: 'ABC', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'data' };
    render(<DevicesTab {...createProps({ enrollment })} />);
    fireEvent.click(screen.getByText('Regenerate QR'));
    expect(screen.getByText('Regenerate QR Code')).toBeTruthy();
    expect(screen.getByText(/invalidate the current enrollment code/)).toBeTruthy();
  });

  // ── Device Metadata Edge Cases ────────────────────────────

  it('shows "-" for missing last_seen_online', () => {
    const device = makeDeviceRecord({ last_seen_online: null });
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Not Activated" when store_name and store_id are empty', () => {
    const device = makeDeviceRecord({ store_name: null, store_id: '' });
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    expect(screen.getByText('Not Activated')).toBeTruthy();
  });

  it('renders device status message', () => {
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [makeDeviceRecord()] })} />);
    expect(screen.getByText('All good. Device is online and ready.')).toBeTruthy();
  });

  it('renders pending sync count badge', () => {
    const device = makeDeviceRecord({ pending_outbox_count: 5 });
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    expect(screen.getByText('Sync 5')).toBeTruthy();
  });

  it('shows printing mode label for device', () => {
    const device = makeDeviceRecord({ printing_mode: 'DIRECT_ESC_POS' });
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    expect(screen.getAllByText('Direct ESC/POS').length).toBeGreaterThanOrEqual(1);
  });

  it('shows device activity limit info', () => {
    render(<DevicesTab {...createProps({ limit: 200 })} />);
    expect(screen.getByText(/Unique devices in last 200 events/)).toBeTruthy();
  });

  // ── SA-P2-001: Force Re-Enroll Button ─────────────────────

  it('renders Force Re-Enroll button for each device', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    expect(screen.getByText('Force Re-Enroll')).toBeTruthy();
  });

  it('calls requestForceReEnroll on Force Re-Enroll click', () => {
    const handler = vi.fn();
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device], requestForceReEnroll: handler })} />);
    fireEvent.click(screen.getByText('Force Re-Enroll'));
    expect(handler).toHaveBeenCalledWith('dev-001');
  });

  it('disables Force Re-Enroll button when deviceSaving', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [device],
      deviceSaving: { 'dev-001': true },
    })} />);
    const btn = screen.getByText('Processing…');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('shows Force Re-Enroll tooltip with explanation', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    const btn = screen.getByText('Force Re-Enroll');
    expect(btn.getAttribute('title')).toContain('deregistered');
  });

  // ── SA-P1-013: Revoke Token Button ─────────────────────────

  it('renders Revoke Token button for each device', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    expect(screen.getByText('Revoke Token')).toBeTruthy();
  });

  it('shows confirm dialog when Revoke Token is clicked', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    fireEvent.click(screen.getByText('Revoke Token'));
    expect(screen.getByText('Revoke Device Token')).toBeTruthy();
    expect(screen.getByText(/Revoke the authentication token/)).toBeTruthy();
  });

  it('calls requestRevokeToken after confirming dialog', () => {
    const handler = vi.fn();
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device], requestRevokeToken: handler })} />);
    fireEvent.click(screen.getByText('Revoke Token'));
    // The confirm dialog should be visible
    expect(screen.getByText('Revoke Device Token')).toBeTruthy();
    // Click the confirm button in the dialog — it's the btnDanger inside the modal
    const dialog = screen.getByRole('dialog');
    const confirmBtn = dialog.querySelector('.btnDanger') as HTMLElement;
    expect(confirmBtn).toBeTruthy();
    fireEvent.click(confirmBtn);
    expect(handler).toHaveBeenCalledWith('dev-001');
  });

  it('shows Revoking... when revokingTokenDevices is true', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [device],
      revokingTokenDevices: { 'dev-001': true },
    })} />);
    expect(screen.getByText('Revoking…')).toBeTruthy();
  });

  it('disables Revoke Token button when revokingTokenDevices is true', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [device],
      revokingTokenDevices: { 'dev-001': true },
    })} />);
    const btn = screen.getByText('Revoking…');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('disables Revoke Token button when deviceSaving', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [device],
      deviceSaving: { 'dev-001': true },
    })} />);
    const btn = screen.getByTitle('Revoke the device\'s current authentication token. The device will need to re-authenticate but not re-enroll.');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('shows Revoke Token tooltip with explanation', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    const btn = screen.getByText('Revoke Token');
    expect(btn.getAttribute('title')).toContain('re-authenticate');
  });

  // ── SA-P2-005: Force Sync Button ─────────────────────────

  it('renders Force Sync button for each device', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    expect(screen.getByText('Force Sync')).toBeTruthy();
  });

  it('calls requestForceSync on Force Sync click', () => {
    const handler = vi.fn();
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device], requestForceSync: handler })} />);
    fireEvent.click(screen.getByText('Force Sync'));
    expect(handler).toHaveBeenCalledWith('dev-001');
  });

  it('shows Syncing... when forceSyncingDevices is true', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [device],
      forceSyncingDevices: { 'dev-001': true },
    })} />);
    expect(screen.getByText('Syncing…')).toBeTruthy();
  });

  it('disables Force Sync button when forceSyncingDevices is true', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [device],
      forceSyncingDevices: { 'dev-001': true },
    })} />);
    const btn = screen.getByText('Syncing…');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('disables Force Sync button when deviceSaving', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [device],
      deviceSaving: { 'dev-001': true },
    })} />);
    const syncBtn = screen.getByText('Force Sync');
    expect(syncBtn).toHaveProperty('disabled', true);
  });

  it('shows Force Sync tooltip with explanation', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    const btn = screen.getByText('Force Sync');
    expect(btn.getAttribute('title')).toContain('force sync');
  });

  // ── SA-P2-002: Push Config ─────────────────────────────────

  it('renders Push Config button for each device', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    expect(screen.getByText('Push Config')).toBeTruthy();
  });

  it('Push Config button has tooltip', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    const btn = screen.getByText('Push Config');
    expect(btn.getAttribute('title')).toContain('config update');
  });

  it('disables Push Config button when deviceSaving', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({
      filteredDeviceRecords: [device],
      deviceSaving: { 'dev-001': true },
    })} />);
    // "Push Config" button is disabled when saving — it should exist
    const btn = screen.getByTitle('Push a config update to this device via FCM or poll');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('opens Push Config modal when button clicked', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    fireEvent.click(screen.getByText('Push Config'));
    expect(screen.getByText('Push Config to Device')).toBeTruthy();
    expect(screen.getByLabelText('Config key')).toBeTruthy();
    expect(screen.getByLabelText('Config value')).toBeTruthy();
  });

  it('shows device ID in Push Config modal target label', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    fireEvent.click(screen.getByText('Push Config'));
    // dev-001 appears in both the device card and the modal target
    const targets = screen.getAllByText('dev-001');
    expect(targets.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Broadcast to All button', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('Broadcast to All')).toBeTruthy();
  });

  it('opens broadcast modal when Broadcast to All is clicked', () => {
    render(<DevicesTab {...createProps()} />);
    fireEvent.click(screen.getByText('Broadcast to All'));
    expect(screen.getByText('Broadcast Config to All Devices')).toBeTruthy();
  });

  it('renders Config Push section header', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('Config Push')).toBeTruthy();
  });

  it('shows empty state when no config push history', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('No config pushes yet.')).toBeTruthy();
  });

  it('renders config push history table', () => {
    const history = [
      { id: 'p1', device_id: 'dev-1', store_id: null, config_key: 'FORCE_UPDATE', config_value: 'true', message: null, method: 'poll' as const, status: 'pending' as const, delivered_at: null, created_at: '2026-03-11T00:00:00Z' },
    ];
    render(<DevicesTab {...createProps({ configPushHistory: history })} />);
    expect(screen.getByText('FORCE_UPDATE')).toBeTruthy();
    expect(screen.getByText('poll')).toBeTruthy();
    expect(screen.getByText('pending')).toBeTruthy();
  });

  it('shows Refresh button for config push history', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('Refresh')).toBeTruthy();
  });

  it('calls refreshConfigPushHistory on Refresh click', () => {
    const handler = vi.fn();
    render(<DevicesTab {...createProps({ refreshConfigPushHistory: handler })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(handler).toHaveBeenCalled();
  });

  it('shows Loading... on Refresh when configPushLoading', () => {
    render(<DevicesTab {...createProps({ configPushLoading: true })} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders config key dropdown options in modal', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    fireEvent.click(screen.getByText('Push Config'));
    expect(screen.getByText('Force Update')).toBeTruthy();
    expect(screen.getByText('Maintenance Mode')).toBeTruthy();
    expect(screen.getByText('Sync Interval (ms)')).toBeTruthy();
  });

  it('renders Cancel button in Push Config modal', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    fireEvent.click(screen.getByText('Push Config'));
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('closes modal on Cancel click', () => {
    const device = makeDeviceRecord();
    render(<DevicesTab {...createProps({ filteredDeviceRecords: [device] })} />);
    fireEvent.click(screen.getByText('Push Config'));
    expect(screen.getByText('Push Config to Device')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Push Config to Device')).toBeNull();
  });

  it('renders method badge with fcm style in history', () => {
    const history = [
      { id: 'p1', device_id: 'dev-1', store_id: null, config_key: 'X', config_value: 'Y', message: null, method: 'fcm' as const, status: 'delivered' as const, delivered_at: '2026-03-11T00:00:00Z', created_at: '2026-03-11T00:00:00Z' },
    ];
    render(<DevicesTab {...createProps({ configPushHistory: history })} />);
    expect(screen.getByText('fcm')).toBeTruthy();
    expect(screen.getByText('delivered')).toBeTruthy();
  });

  it('shows config push subtitle', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText(/Push configuration updates to devices/)).toBeTruthy();
  });
});
