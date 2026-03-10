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
    devicePage: 0,
    setDevicePage: vi.fn(),
    devicesLoading: false,
    deviceTotal: 0,
    refreshDevices: vi.fn(),
    limit: 100,
    devices: [] as any[],
    storeDirectory: [],
    handleRevokeEnrollment: vi.fn(),
    revokeLoading: false,
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
    render(<DevicesTab {...createProps({ enrollment, revokeLoading: true })} />);
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
});
