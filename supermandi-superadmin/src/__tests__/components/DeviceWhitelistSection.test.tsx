// SA-P2-009: Test DeviceWhitelistSection component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeviceWhitelistSection } from '../../components/DeviceWhitelistSection';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

const mockFetchWhitelistRules = vi.fn();
const mockCreateWhitelistRule = vi.fn();
const mockDeleteWhitelistRule = vi.fn();
const mockToggleWhitelistRule = vi.fn();

vi.mock('../../api/devices', () => ({
  fetchWhitelistRules: (...args: unknown[]) => mockFetchWhitelistRules(...args),
  createWhitelistRule: (...args: unknown[]) => mockCreateWhitelistRule(...args),
  deleteWhitelistRule: (...args: unknown[]) => mockDeleteWhitelistRule(...args),
  toggleWhitelistRule: (...args: unknown[]) => mockToggleWhitelistRule(...args),
}));

describe('DeviceWhitelistSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no rules exist', async () => {
    mockFetchWhitelistRules.mockResolvedValue([]);

    render(<DeviceWhitelistSection />);

    await waitFor(() => {
      expect(screen.getByText(/No whitelist rules defined/i)).toBeTruthy();
    });
  });

  it('renders loading state initially', () => {
    mockFetchWhitelistRules.mockReturnValue(new Promise(() => {}));

    render(<DeviceWhitelistSection />);

    expect(screen.getByText(/Loading whitelist rules/i)).toBeTruthy();
  });

  it('renders rules in a table', async () => {
    mockFetchWhitelistRules.mockResolvedValue([
      { id: 'r1', manufacturer: 'Samsung', model: 'Galaxy*', min_android_version: '12', notes: 'Test', active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]);

    render(<DeviceWhitelistSection />);

    await waitFor(() => {
      expect(screen.getByText('Samsung')).toBeTruthy();
      expect(screen.getByText('Galaxy*')).toBeTruthy();
      expect(screen.getByText('12')).toBeTruthy();
      expect(screen.getByText('Test')).toBeTruthy();
    });
  });

  it('shows error state on fetch failure', async () => {
    mockFetchWhitelistRules.mockRejectedValue(new Error('Network error'));

    render(<DeviceWhitelistSection />);

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeTruthy();
    });
  });

  it('renders header with Hardware Whitelist title', async () => {
    mockFetchWhitelistRules.mockResolvedValue([]);

    render(<DeviceWhitelistSection />);

    await waitFor(() => {
      expect(screen.getByText('Hardware Whitelist')).toBeTruthy();
    });
  });

  it('renders add rule form fields', async () => {
    mockFetchWhitelistRules.mockResolvedValue([]);

    render(<DeviceWhitelistSection />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Samsung/i)).toBeTruthy();
      expect(screen.getByPlaceholderText(/Galaxy/i)).toBeTruthy();
      expect(screen.getByPlaceholderText(/e\.g\. 12/i)).toBeTruthy();
    });
  });

  it('renders Add Rule button', async () => {
    mockFetchWhitelistRules.mockResolvedValue([]);

    render(<DeviceWhitelistSection />);

    await waitFor(() => {
      expect(screen.getByText('Add Rule')).toBeTruthy();
    });
  });

  it('renders delete button for each rule', async () => {
    mockFetchWhitelistRules.mockResolvedValue([
      { id: 'r1', manufacturer: 'Samsung', model: null, min_android_version: null, notes: null, active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]);

    render(<DeviceWhitelistSection />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeTruthy();
    });
  });

  it('shows active rule count in description', async () => {
    mockFetchWhitelistRules.mockResolvedValue([
      { id: 'r1', manufacturer: 'Samsung', model: null, min_android_version: null, notes: null, active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'r2', manufacturer: 'Google', model: null, min_android_version: null, notes: null, active: false, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]);

    render(<DeviceWhitelistSection />);

    await waitFor(() => {
      expect(screen.getByText(/1 active rule/i)).toBeTruthy();
    });
  });

  it('renders wildcard markers for empty fields', async () => {
    mockFetchWhitelistRules.mockResolvedValue([
      { id: 'r1', manufacturer: null, model: null, min_android_version: '12', notes: null, active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]);

    render(<DeviceWhitelistSection />);

    await waitFor(() => {
      const asterisks = screen.getAllByText('*');
      // manufacturer and model should show *
      expect(asterisks.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows validation error when adding rule with no criteria', async () => {
    mockFetchWhitelistRules.mockResolvedValue([]);

    render(<DeviceWhitelistSection />);

    await waitFor(() => {
      expect(screen.getByText('Add Rule')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Add Rule'));

    await waitFor(() => {
      expect(screen.getByText(/At least one of/i)).toBeTruthy();
    });
  });
});
