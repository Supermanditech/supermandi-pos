// SuperAdmin — Test SettingsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsTab } from '../../tabs/SettingsTab';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

vi.mock('../../api/featureFlags', () => ({
  fetchStoreFeatureFlags: vi.fn().mockResolvedValue([]),
  setStoreOverride: vi.fn().mockResolvedValue(undefined),
  removeStoreOverride: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../components/ConfirmDialog', () => ({
  ConfirmDialog: ({ title, onConfirm, onCancel }: any) => (
    <div data-testid="confirm-dialog">
      <span>{title}</span>
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

function createProps(overrides: Partial<Parameters<typeof SettingsTab>[0]> = {}) {
  return {
    systemSettings: null,
    systemStats: null,
    settingsLoading: false,
    settingsError: '',
    featureFlags: [],
    featureFlagsLoading: false,
    featureFlagSaving: {},
    featureFlagsError: '',
    refreshSettings: vi.fn(),
    refreshFeatureFlags: vi.fn(),
    handleToggleGlobalFlag: vi.fn(),
    storeDirectory: [],
    ...overrides,
  };
}

describe('SettingsTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Header ──────────────────────────────────────────────────

  it('renders header', () => {
    render(<SettingsTab {...createProps()} />);
    expect(screen.getByText('System Settings')).toBeTruthy();
  });

  it('renders subtitle description', () => {
    render(<SettingsTab {...createProps()} />);
    expect(screen.getByText('Platform configuration and statistics')).toBeTruthy();
  });

  // ── System Information ──────────────────────────────────────

  it('shows system info when settings available', () => {
    const settings = { version: '2.1.0', environment: 'production', features: { aiEnabled: true, analyticsEnabled: true }, database: { connected: true } };
    render(<SettingsTab {...createProps({ systemSettings: settings })} />);
    expect(screen.getByText('2.1.0')).toBeTruthy();
    expect(screen.getByText('production')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
  });

  it('shows Disconnected when database is not connected', () => {
    const settings = { version: '1.0.0', environment: 'staging', features: { aiEnabled: false, analyticsEnabled: false }, database: { connected: false } };
    render(<SettingsTab {...createProps({ systemSettings: settings })} />);
    expect(screen.getByText('Disconnected')).toBeTruthy();
  });

  it('shows AI feature status', () => {
    const settings = { version: '2.0.0', environment: 'production', features: { aiEnabled: true, analyticsEnabled: false }, database: { connected: true } };
    render(<SettingsTab {...createProps({ systemSettings: settings })} />);
    const enabledElements = screen.getAllByText('Enabled');
    expect(enabledElements.length).toBeGreaterThanOrEqual(1);
    const disabledElements = screen.getAllByText('Disabled');
    expect(disabledElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows section titles', () => {
    render(<SettingsTab {...createProps()} />);
    expect(screen.getByText('System Information')).toBeTruthy();
    expect(screen.getByText('Features')).toBeTruthy();
    expect(screen.getByText('Platform Statistics')).toBeTruthy();
  });

  // ── Stats ───────────────────────────────────────────────────

  it('shows stats when available', () => {
    const stats = { totalStores: 10, totalDevices: 25, totalUsers: 50 };
    render(<SettingsTab {...createProps({ systemStats: stats })} />);
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
    expect(screen.getByText('50')).toBeTruthy();
  });

  it('shows stat labels', () => {
    const stats = { totalStores: 1, totalDevices: 1, totalUsers: 1 };
    render(<SettingsTab {...createProps({ systemStats: stats })} />);
    expect(screen.getByText(/Total Stores/)).toBeTruthy();
    expect(screen.getByText(/Total Devices/)).toBeTruthy();
    expect(screen.getByText(/Total Users/)).toBeTruthy();
  });

  // ── Loading / Error ─────────────────────────────────────────

  it('shows Loading... on refresh button when loading', () => {
    render(<SettingsTab {...createProps({ settingsLoading: true })} />);
    // Multiple "Loading..." texts: refresh button + card placeholders
    const loadingElements = screen.getAllByText('Loading...');
    expect(loadingElements.length).toBeGreaterThanOrEqual(1);
  });

  it('disables refresh button when loading', () => {
    render(<SettingsTab {...createProps({ settingsLoading: true })} />);
    const loadingButtons = screen.getAllByText('Loading...');
    // The first one is the refresh button
    const refreshBtn = loadingButtons.find(el => el.tagName === 'BUTTON');
    expect(refreshBtn).toBeTruthy();
    expect((refreshBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows error state', () => {
    render(<SettingsTab {...createProps({ settingsError: 'Settings failed' })} />);
    expect(screen.getByText(/Settings failed/)).toBeTruthy();
  });

  it('shows error with role=alert', () => {
    render(<SettingsTab {...createProps({ settingsError: 'Connection error' })} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('shows Retry button in error state', () => {
    render(<SettingsTab {...createProps({ settingsError: 'Failed' })} />);
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('calls refreshSettings on click', () => {
    const refresh = vi.fn();
    render(<SettingsTab {...createProps({ refreshSettings: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  // ── Feature Kill Switch ─────────────────────────────────────

  it('renders Feature Kill Switch section', () => {
    render(<SettingsTab {...createProps()} />);
    expect(screen.getByText('Feature Kill Switch')).toBeTruthy();
  });

  it('renders feature flags table', () => {
    const flags = [{ flag_key: 'voice_mode', enabled: true, description: 'Voice search', updated_at: '2026-01-01' }];
    render(<SettingsTab {...createProps({ featureFlags: flags as any })} />);
    expect(screen.getByText('voice_mode')).toBeTruthy();
    expect(screen.getByText('ENABLED')).toBeTruthy();
  });

  it('shows DISABLED badge for disabled flags', () => {
    const flags = [{ flag_key: 'disabled_flag', enabled: false, description: 'Disabled', updated_at: null }];
    render(<SettingsTab {...createProps({ featureFlags: flags as any })} />);
    expect(screen.getByText('DISABLED')).toBeTruthy();
  });

  it('shows KILL button for enabled flags', () => {
    const flags = [{ flag_key: 'test_flag', enabled: true, description: 'Test', updated_at: null }];
    render(<SettingsTab {...createProps({ featureFlags: flags as any })} />);
    expect(screen.getByText('KILL')).toBeTruthy();
  });

  it('shows Enable button for disabled flags', () => {
    const flags = [{ flag_key: 'test_flag', enabled: false, description: 'Test', updated_at: null }];
    render(<SettingsTab {...createProps({ featureFlags: flags as any })} />);
    expect(screen.getByText('Enable')).toBeTruthy();
  });

  it('calls handleToggleGlobalFlag on kill button click', () => {
    const handleToggle = vi.fn();
    const flags = [{ flag_key: 'test_flag', enabled: true, description: 'Test', updated_at: null }];
    render(<SettingsTab {...createProps({ featureFlags: flags as any, handleToggleGlobalFlag: handleToggle })} />);
    fireEvent.click(screen.getByText('KILL'));
    expect(handleToggle).toHaveBeenCalledWith('test_flag', false);
  });

  it('calls handleToggleGlobalFlag on enable button click', () => {
    const handleToggle = vi.fn();
    const flags = [{ flag_key: 'test_flag', enabled: false, description: 'Test', updated_at: null }];
    render(<SettingsTab {...createProps({ featureFlags: flags as any, handleToggleGlobalFlag: handleToggle })} />);
    fireEvent.click(screen.getByText('Enable'));
    expect(handleToggle).toHaveBeenCalledWith('test_flag', true);
  });

  it('shows Saving... when flag is being saved', () => {
    const flags = [{ flag_key: 'test_flag', enabled: true, description: 'Test', updated_at: null }];
    render(<SettingsTab {...createProps({ featureFlags: flags as any, featureFlagSaving: { test_flag: true } })} />);
    expect(screen.getByText('Saving...')).toBeTruthy();
  });

  it('disables toggle button when saving', () => {
    const flags = [{ flag_key: 'test_flag', enabled: true, description: 'Test', updated_at: null }];
    render(<SettingsTab {...createProps({ featureFlags: flags as any, featureFlagSaving: { test_flag: true } })} />);
    expect((screen.getByText('Saving...') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows empty feature flags message', () => {
    render(<SettingsTab {...createProps({ featureFlags: [] })} />);
    expect(screen.getByText(/No feature flags found/)).toBeTruthy();
  });

  it('shows feature flags error', () => {
    render(<SettingsTab {...createProps({ featureFlagsError: 'Flags failed' })} />);
    expect(screen.getByText('Flags failed')).toBeTruthy();
  });

  it('renders Refresh Flags button', () => {
    render(<SettingsTab {...createProps()} />);
    expect(screen.getByText('Refresh Flags')).toBeTruthy();
  });

  it('calls refreshFeatureFlags on Refresh Flags click', () => {
    const refreshFlags = vi.fn();
    render(<SettingsTab {...createProps({ refreshFeatureFlags: refreshFlags })} />);
    fireEvent.click(screen.getByText('Refresh Flags'));
    expect(refreshFlags).toHaveBeenCalled();
  });

  it('shows feature flag table headers', () => {
    const flags = [{ flag_key: 'test', enabled: true, description: 'Test', updated_at: null }];
    render(<SettingsTab {...createProps({ featureFlags: flags as any })} />);
    expect(screen.getByText('Feature')).toBeTruthy();
    expect(screen.getByText('Description')).toBeTruthy();
    expect(screen.getByText('Action')).toBeTruthy();
    expect(screen.getByText('Last Changed')).toBeTruthy();
  });

  it('renders formatted last changed date for flags', () => {
    const flags = [{ flag_key: 'test', enabled: true, description: 'Test', updated_at: '2026-03-10T10:00:00Z' }];
    render(<SettingsTab {...createProps({ featureFlags: flags as any })} />);
    expect(screen.getByText('2026-03-10T10:00:00Z')).toBeTruthy();
  });

  // ── Per-Store Feature Overrides ─────────────────────────────

  it('renders per-store feature overrides section', () => {
    render(<SettingsTab {...createProps()} />);
    expect(screen.getByText('Per-Store Feature Overrides')).toBeTruthy();
  });

  it('shows store directory in dropdown', () => {
    const stores = [{ id: 's1', name: 'Store A' }];
    render(<SettingsTab {...createProps({ storeDirectory: stores as any })} />);
    expect(screen.getByText('Store A')).toBeTruthy();
  });

  it('renders store select dropdown with accessible label', () => {
    render(<SettingsTab {...createProps()} />);
    expect(screen.getByLabelText('Select store for feature flag overrides')).toBeTruthy();
  });

  it('shows default placeholder in store select', () => {
    render(<SettingsTab {...createProps()} />);
    expect(screen.getByDisplayValue('-- Select a store --')).toBeTruthy();
  });

  it('renders multiple feature flags', () => {
    const flags = [
      { flag_key: 'voice_mode', enabled: true, description: 'Voice', updated_at: null },
      { flag_key: 'scan_v2', enabled: false, description: 'Scan V2', updated_at: null },
    ];
    render(<SettingsTab {...createProps({ featureFlags: flags as any })} />);
    expect(screen.getByText('voice_mode')).toBeTruthy();
    expect(screen.getByText('scan_v2')).toBeTruthy();
  });
});
