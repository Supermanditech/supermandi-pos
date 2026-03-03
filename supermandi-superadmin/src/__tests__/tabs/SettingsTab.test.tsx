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

  it('renders header', () => {
    render(<SettingsTab {...createProps()} />);
    expect(screen.getByText('System Settings')).toBeTruthy();
  });

  it('shows system info when settings available', () => {
    const settings = { version: '2.1.0', environment: 'production', features: { aiEnabled: true, analyticsEnabled: true }, database: { connected: true } };
    render(<SettingsTab {...createProps({ systemSettings: settings })} />);
    expect(screen.getByText('2.1.0')).toBeTruthy();
    expect(screen.getByText('production')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
  });

  it('shows stats when available', () => {
    const stats = { totalStores: 10, totalDevices: 25, totalUsers: 50 };
    render(<SettingsTab {...createProps({ systemStats: stats })} />);
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
    expect(screen.getByText('50')).toBeTruthy();
  });

  it('shows error state', () => {
    render(<SettingsTab {...createProps({ settingsError: 'Settings failed' })} />);
    expect(screen.getByText(/Settings failed/)).toBeTruthy();
  });

  it('calls refreshSettings on click', () => {
    const refresh = vi.fn();
    render(<SettingsTab {...createProps({ refreshSettings: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  it('renders feature flags table', () => {
    const flags = [{ flag_key: 'voice_mode', enabled: true, description: 'Voice search', updated_at: '2026-01-01' }];
    render(<SettingsTab {...createProps({ featureFlags: flags as any })} />);
    expect(screen.getByText('voice_mode')).toBeTruthy();
    expect(screen.getByText('ENABLED')).toBeTruthy();
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

  it('renders per-store feature overrides section', () => {
    render(<SettingsTab {...createProps()} />);
    expect(screen.getByText('Per-Store Feature Overrides')).toBeTruthy();
  });

  it('shows store directory in dropdown', () => {
    const stores = [{ id: 's1', name: 'Store A' }];
    render(<SettingsTab {...createProps({ storeDirectory: stores as any })} />);
    expect(screen.getByText('Store A')).toBeTruthy();
  });
});
