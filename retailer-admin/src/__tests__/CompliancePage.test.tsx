import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CompliancePage from '../pages/CompliancePage';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token', store: { id: 's1', name: 'Test', code: 'TEST' } }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/compliance']}>
      <Routes>
        <Route path="/s/:storeCode/compliance" element={<CompliancePage />} />
      </Routes>
    </MemoryRouter>
  );

describe('CompliancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Compliance Documents')).toBeInTheDocument();
  });

  it('shows empty state when no documents', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { documents: [], uploadEnabled: false } }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No documents uploaded/)).toBeInTheDocument();
    });
  });

  it('renders documents list', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          documents: [
            { id: 'd1', type: 'gstin', fileName: 'gstin.pdf', uploadedAt: '2026-01-01T00:00:00Z', status: 'verified' },
            { id: 'd2', type: 'fssai', fileName: 'fssai.pdf', uploadedAt: '2026-01-02T00:00:00Z', status: 'pending' },
          ],
          uploadEnabled: false,
        },
      }),
    });
    renderPage();
    await waitFor(() => {
      // Component renders label from documentTypes lookup, not raw type value
      expect(screen.getByText('GSTIN Certificate')).toBeInTheDocument();
      expect(screen.getByText('FSSAI License')).toBeInTheDocument();
    });
  });

  it('shows status counts', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          documents: [
            { id: 'd1', type: 'gstin', fileName: 'g.pdf', uploadedAt: '2026-01-01T00:00:00Z', status: 'verified' },
            { id: 'd2', type: 'pan', fileName: 'p.pdf', uploadedAt: '2026-01-01T00:00:00Z', status: 'pending' },
          ],
          uploadEnabled: false,
        },
      }),
    });
    renderPage();
    await waitFor(() => {
      const verifiedLabels = screen.getAllByText(/Verified/);
      expect(verifiedLabels.length).toBeGreaterThan(0);
    });
  });

  it('toggles upload form when button clicked', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { documents: [], uploadEnabled: true } }),
    });
    renderPage();
    await waitFor(() => {
      // Multiple elements match "Upload Document" - use getAllByText
      const uploadElems = screen.getAllByText(/Upload Document/);
      expect(uploadElems.length).toBeGreaterThan(0);
    });
    // Click the button specifically (first match is the button)
    const uploadElems = screen.getAllByText(/Upload Document/);
    fireEvent.click(uploadElems[0]);
    // After toggling, verify form elements appear
    expect(screen.getByText('Document Type *')).toBeInTheDocument();
  });

  it('shows required documents list', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { documents: [], uploadEnabled: false } }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Required Documents:')).toBeInTheDocument();
      expect(screen.getByText(/GSTIN Certificate/)).toBeInTheDocument();
      expect(screen.getByText(/FSSAI License/)).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { documents: [], uploadEnabled: false } }),
    });
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
