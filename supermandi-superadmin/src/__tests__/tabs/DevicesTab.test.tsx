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
    filteredDeviceRecords: [],
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
    devices: [],
    ...overrides,
  };
}

describe('DevicesTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders Add Device header', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('Add Device')).toBeTruthy();
  });

  it('shows create enrollment button', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('Create enrollment')).toBeTruthy();
  });

  it('calls handleCreateEnrollment on click', () => {
    const handler = vi.fn();
    render(<DevicesTab {...createProps({ handleCreateEnrollment: handler })} />);
    fireEvent.click(screen.getByText('Create enrollment'));
    expect(handler).toHaveBeenCalled();
  });

  it('shows enrollment QR code when enrollment exists', () => {
    const enrollment = { code: 'ABC123', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'payload-data' };
    render(<DevicesTab {...createProps({ enrollment })} />);
    expect(screen.getByText('Code: ABC123')).toBeTruthy();
    expect(screen.getByTestId('qr-code')).toBeTruthy();
  });

  it('shows enroll error', () => {
    render(<DevicesTab {...createProps({ enrollError: 'Invalid store' })} />);
    expect(screen.getByText('Invalid store')).toBeTruthy();
  });

  it('shows empty devices state', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('No devices synced yet.')).toBeTruthy();
  });

  it('shows device activity empty state', () => {
    render(<DevicesTab {...createProps()} />);
    expect(screen.getByText('No devices seen yet.')).toBeTruthy();
  });

  it('shows device action error', () => {
    render(<DevicesTab {...createProps({ deviceActionError: 'Save failed' })} />);
    expect(screen.getByText('Save failed')).toBeTruthy();
  });

  it('renders device activity table when devices exist', () => {
    const devices = [{ deviceId: 'd1', storeId: 's1', lastSeen: '2026-01-01', lastEventType: 'SALE', eventCount: 10 }];
    render(<DevicesTab {...createProps({ devices })} />);
    expect(screen.getByText('d1')).toBeTruthy();
    expect(screen.getByText('s1')).toBeTruthy();
  });
});
