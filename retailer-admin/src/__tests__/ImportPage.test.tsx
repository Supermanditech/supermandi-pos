import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ImportPage from '../pages/ImportPage';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
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
    <MemoryRouter initialEntries={['/s/TEST/import']}>
      <Routes>
        <Route path="/s/:storeCode/import" element={<ImportPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('ImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders upload step initially', () => {
    renderPage();
    expect(screen.getByText('Import Products (CSV)')).toBeInTheDocument();
    expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    expect(screen.getByText('Download CSV Template')).toBeInTheDocument();
  });

  it('shows progress steps', () => {
    renderPage();
    expect(screen.getByText('upload')).toBeInTheDocument();
    expect(screen.getByText('validate')).toBeInTheDocument();
    expect(screen.getByText('review')).toBeInTheDocument();
    expect(screen.getByText('commit')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  it('shows drag and drop area', () => {
    renderPage();
    expect(screen.getByText(/Drag & drop your CSV file/)).toBeInTheDocument();
    expect(screen.getByText('Browse Files')).toBeInTheDocument();
  });

  it('shows expected CSV format info', () => {
    renderPage();
    expect(screen.getByText('Expected CSV Format:')).toBeInTheDocument();
    expect(screen.getByText(/name,barcode,brand/)).toBeInTheDocument();
  });

  it('renders breadcrumb', () => {
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  it('does not show validate button without file', () => {
    renderPage();
    expect(screen.queryByText('Validate & Continue')).not.toBeInTheDocument();
  });
});
