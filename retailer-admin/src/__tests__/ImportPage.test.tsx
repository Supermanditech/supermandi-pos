import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

// Helper: create a mock CSV File with .text() support for jsdom
function createCsvFile(content = 'name,barcode\nTest,123', name = 'test.csv', sizeOverride?: number) {
  const file = new File([content], name, { type: 'text/csv' });
  // jsdom File doesn't have .text() — polyfill it
  if (typeof file.text !== 'function') {
    (file as any).text = () => Promise.resolve(content);
  }
  if (sizeOverride !== undefined) {
    Object.defineProperty(file, 'size', { value: sizeOverride });
  }
  return file;
}

// Helper: select a file via the file input
async function selectFile(file: File) {
  const input = screen.getByLabelText('Select CSV file for import') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

// Helper: mock successful upload + validate flow
function mockUploadAndValidateSuccess(validationData: Record<string, unknown>) {
  let callCount = 0;
  mockAuthFetch.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      // Upload response
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { jobId: 'job-123' } }),
      });
    }
    // Validate response
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: validationData }),
    });
  });
}

// ── Upload Step (existing smoke tests preserved) ─────────────────────────

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

// ── File Selection & Validation (J21-TEST-001) ──────────────────────────

describe('File selection and validation (J21-TEST-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Validate & Continue button after selecting a file', async () => {
    renderPage();
    await selectFile(createCsvFile());
    expect(screen.getByText('Validate & Continue')).toBeInTheDocument();
  });

  it('shows file name and size after selection', async () => {
    renderPage();
    await selectFile(createCsvFile('name,barcode\nTest,123', 'products.csv'));
    expect(screen.getByText(/products\.csv/)).toBeInTheDocument();
  });

  it('shows Remove button after file selection', async () => {
    renderPage();
    await selectFile(createCsvFile());
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('clears file when Remove is clicked', async () => {
    renderPage();
    await selectFile(createCsvFile());
    expect(screen.getByText('Validate & Continue')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Remove'));
    });

    expect(screen.queryByText('Validate & Continue')).not.toBeInTheDocument();
    expect(screen.getByText(/Drag & drop/)).toBeInTheDocument();
  });

  it('rejects files larger than 5MB', async () => {
    renderPage();
    const largeFile = createCsvFile('x', 'big.csv', 6 * 1024 * 1024);
    await selectFile(largeFile);

    // Error should appear, validate button should NOT appear
    expect(screen.getByText(/File too large/)).toBeInTheDocument();
    expect(screen.getByText(/Maximum is/)).toBeInTheDocument();
    expect(screen.queryByText('Validate & Continue')).not.toBeInTheDocument();
  });

  it('accepts files within 5MB limit', async () => {
    renderPage();
    const okFile = createCsvFile('x', 'ok.csv', 4 * 1024 * 1024);
    await selectFile(okFile);

    expect(screen.queryByText(/File too large/)).not.toBeInTheDocument();
    expect(screen.getByText('Validate & Continue')).toBeInTheDocument();
  });
});

// ── Upload & Validate Flow (J21-TEST-001) ───────────────────────────────

describe('Upload and validate flow (J21-TEST-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions to validate step and then review step on success', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockUploadAndValidateSuccess({
      validCount: 5,
      invalidCount: 1,
      totalRows: 6,
      errors: [{ row: 3, field: 'barcode', error: 'Duplicate barcode' }],
      previewRows: [
        { row: 1, name: 'Product A', barcode: '123', brand: 'Brand', sellPrice: 1000, purchasePrice: 800, mode: 'PACKAGED', valid: true, errors: [] },
      ],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    // Should land on review step
    await waitFor(() => {
      expect(screen.getByText('Review Import')).toBeInTheDocument();
    });
  });

  it('shows validation summary cards on review step', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockUploadAndValidateSuccess({
      validCount: 8,
      invalidCount: 2,
      totalRows: 10,
      errors: [],
      previewRows: [],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Total Rows')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('Valid Rows')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('Errors')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('shows error list when validation has errors', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockUploadAndValidateSuccess({
      validCount: 3,
      invalidCount: 2,
      totalRows: 5,
      errors: [
        { row: 2, field: 'name', error: 'Name is required' },
        { row: 4, field: 'barcode', error: 'Invalid barcode format' },
      ],
      previewRows: [],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Validation Errors:')).toBeInTheDocument();
      expect(screen.getByText(/Row 2: Name is required/)).toBeInTheDocument();
      expect(screen.getByText(/Row 4: Invalid barcode format/)).toBeInTheDocument();
    });
  });

  it('shows preview table with product rows', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockUploadAndValidateSuccess({
      validCount: 1,
      invalidCount: 0,
      totalRows: 1,
      errors: [],
      previewRows: [
        { row: 1, name: 'Parle-G', barcode: '890123', brand: 'Parle', sellPrice: 1000, purchasePrice: 850, mode: 'PACKAGED', valid: true, errors: [] },
      ],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Parle-G')).toBeInTheDocument();
      expect(screen.getByText('890123')).toBeInTheDocument();
      expect(screen.getByText('Parle')).toBeInTheDocument();
      expect(screen.getByText('Packaged')).toBeInTheDocument();
    });
  });

  it('shows Import N Valid Rows button on review step', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockUploadAndValidateSuccess({
      validCount: 7,
      invalidCount: 0,
      totalRows: 7,
      errors: [],
      previewRows: [],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Import 7 Valid Rows')).toBeInTheDocument();
    });
  });

  it('disables Import button when validCount is 0', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockUploadAndValidateSuccess({
      validCount: 0,
      invalidCount: 3,
      totalRows: 3,
      errors: [{ row: 1, field: 'name', error: 'Required' }],
      previewRows: [],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      const importBtn = screen.getByText('Import 0 Valid Rows');
      expect(importBtn).toBeDisabled();
    });
  });

  it('shows Upload Different File button on review step', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockUploadAndValidateSuccess({
      validCount: 1, invalidCount: 0, totalRows: 1, errors: [], previewRows: [],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Upload Different File')).toBeInTheDocument();
    });
  });

  it('resets to upload step when Upload Different File is clicked', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockUploadAndValidateSuccess({
      validCount: 1, invalidCount: 0, totalRows: 1, errors: [], previewRows: [],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Upload Different File')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Upload Different File'));
    });

    expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop/)).toBeInTheDocument();
  });
});

// ── Upload Error Handling (J21-TEST-001) ────────────────────────────────

describe('Upload error handling (J21-TEST-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error and returns to upload step on upload failure', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockAuthFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
      expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    });
  });

  it('shows error when upload succeeds but no jobId returned', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText(/no job ID returned/)).toBeInTheDocument();
      expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    });
  });

  it('shows error when validate step fails with row-level error', async () => {
    renderPage();
    await selectFile(createCsvFile());

    let callCount = 0;
    mockAuthFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { jobId: 'job-err' } }),
        });
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: { row: 5, message: 'Invalid price format' } }),
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText(/Row 5: Invalid price format/)).toBeInTheDocument();
    });
  });

  it('shows network error message on TypeError fetch failure', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockAuthFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it('shows timeout error message on AbortError', async () => {
    renderPage();
    await selectFile(createCsvFile());

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockAuthFetch.mockRejectedValue(abortError);

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText(/timed out/i)).toBeInTheDocument();
    });
  });
});

// ── Commit Flow (J21-TEST-001) ──────────────────────────────────────────

describe('Commit flow (J21-TEST-001)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function reachReviewStep() {
    renderPage();
    await selectFile(createCsvFile());
    mockUploadAndValidateSuccess({
      validCount: 5,
      invalidCount: 0,
      totalRows: 5,
      errors: [],
      previewRows: [],
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });
    await waitFor(() => {
      expect(screen.getByText('Import 5 Valid Rows')).toBeInTheDocument();
    });
  }

  it('transitions to commit step and shows progress on async commit (202)', async () => {
    await reachReviewStep();

    // Mock commit returning 202 (async)
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ data: { progress: { created: 0, total: 5 } } }),
    });

    // Mock first poll returning in-progress
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { status: 'processing', progress: { created: 3, total: 5 } },
      }),
    });

    // Mock second poll returning completed
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          status: 'committed',
          progress: { created: 5, total: 5 },
          commitResult: { created: 5, updated: 0, skipped: 0, warnings: [] },
        },
      }),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Import 5 Valid Rows'));
    });

    // Should show commit step
    await waitFor(() => {
      expect(screen.getByText('Importing Products...')).toBeInTheDocument();
    });

    // Advance to first poll
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Advance to second poll (committed)
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Should reach done step
    await waitFor(() => {
      expect(screen.getByText('Import Complete!')).toBeInTheDocument();
      expect(screen.getByText(/5/)).toBeInTheDocument();
    });
  });

  it('shows done step with created/updated/skipped counts', async () => {
    await reachReviewStep();

    // Synchronous commit (direct success)
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { created: 3, updated: 1, skipped: 1, warnings: [] },
      }),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Import 5 Valid Rows'));
    });

    await waitFor(() => {
      expect(screen.getByText('Import Complete!')).toBeInTheDocument();
      // created count in <strong>
      expect(screen.getByText('3')).toBeInTheDocument();
      // updated and skipped text
      expect(screen.getByText(/existing products updated/)).toBeInTheDocument();
      expect(screen.getByText(/skipped/)).toBeInTheDocument();
    });
  });

  it('shows View Products and Import More buttons on done step', async () => {
    await reachReviewStep();

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { created: 5, updated: 0, skipped: 0, warnings: [] },
      }),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Import 5 Valid Rows'));
    });

    await waitFor(() => {
      expect(screen.getByText('View Products')).toBeInTheDocument();
      expect(screen.getByText('Import More')).toBeInTheDocument();
    });
  });

  it('resets to upload step when Import More is clicked', async () => {
    await reachReviewStep();

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { created: 5, updated: 0, skipped: 0, warnings: [] },
      }),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Import 5 Valid Rows'));
    });

    await waitFor(() => {
      expect(screen.getByText('Import More')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Import More'));
    });

    expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop/)).toBeInTheDocument();
  });

  it('shows error and returns to review on commit failure', async () => {
    await reachReviewStep();

    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'Server error during commit' } }),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Import 5 Valid Rows'));
    });

    await waitFor(() => {
      expect(screen.getByText('Server error during commit')).toBeInTheDocument();
      expect(screen.getByText('Review Import')).toBeInTheDocument();
    });
  });

  it('shows error and returns to review when polling reports failed status', async () => {
    await reachReviewStep();

    // Async commit
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ data: { progress: { created: 0, total: 5 } } }),
    });

    // Poll returns failed
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { status: 'failed', progress: { created: 2, total: 5 } },
      }),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Import 5 Valid Rows'));
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.getByText(/Commit failed on server/)).toBeInTheDocument();
      expect(screen.getByText('Review Import')).toBeInTheDocument();
    });
  });
});

// ── Warnings & Error Report Download (J21-TEST-001) ─────────────────────

describe('Warnings and error report download (J21-TEST-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows warnings and Download Error Report button on done step', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockUploadAndValidateSuccess({
      validCount: 3, invalidCount: 0, totalRows: 3, errors: [], previewRows: [],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Import 3 Valid Rows')).toBeInTheDocument();
    });

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { created: 2, updated: 0, skipped: 1, warnings: ['Row 3: Barcode conflict, product skipped'] },
      }),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Import 3 Valid Rows'));
    });

    await waitFor(() => {
      expect(screen.getByText('Import Complete!')).toBeInTheDocument();
      expect(screen.getByText('Row 3: Barcode conflict, product skipped')).toBeInTheDocument();
      expect(screen.getByText('Download Error Report (CSV)')).toBeInTheDocument();
    });
  });

  it('shows Download Error Report button on review step when errors exist', async () => {
    renderPage();
    await selectFile(createCsvFile());

    mockUploadAndValidateSuccess({
      validCount: 2,
      invalidCount: 1,
      totalRows: 3,
      errors: [{ row: 2, field: 'name', error: 'Required' }],
      previewRows: [],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Download Error Report (CSV)')).toBeInTheDocument();
    });
  });
});

// ── Download Template (J21-TEST-001) ────────────────────────────────────

describe('Download template (J21-TEST-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls authFetch for template download', async () => {
    renderPage();

    // Mock blob download
    mockAuthFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['csv-content'])),
    });

    // Mock URL.createObjectURL and revokeObjectURL
    const mockCreateObjectURL = vi.fn(() => 'blob:url');
    const mockRevokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

    await act(async () => {
      fireEvent.click(screen.getByText('Download CSV Template'));
    });

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/v1/retailer-admin/products/import/template',
      'test-token'
    );
  });

  it('shows error when template download fails', async () => {
    renderPage();

    mockAuthFetch.mockResolvedValue({
      ok: false,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Download CSV Template'));
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to download template')).toBeInTheDocument();
    });
  });
});

// ── Drag and Drop (J21-TEST-001) ────────────────────────────────────────

describe('Drag and drop (J21-TEST-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts CSV file via drag and drop', async () => {
    renderPage();

    const csvFile = createCsvFile('name,barcode\nA,1', 'dropped.csv');
    const dropZone = screen.getByText(/Drag & drop/).closest('div')!;

    await act(async () => {
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [csvFile] },
      });
    });

    expect(screen.getByText(/dropped\.csv/)).toBeInTheDocument();
    expect(screen.getByText('Validate & Continue')).toBeInTheDocument();
  });

  it('rejects oversized file via drag and drop', async () => {
    renderPage();

    const bigFile = createCsvFile('x', 'huge.csv', 10 * 1024 * 1024);
    const dropZone = screen.getByText(/Drag & drop/).closest('div')!;

    await act(async () => {
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [bigFile] },
      });
    });

    expect(screen.getByText(/File too large/)).toBeInTheDocument();
    expect(screen.queryByText('Validate & Continue')).not.toBeInTheDocument();
  });
});

// ── Errors with >20 truncation (J21-TEST-001) ──────────────────────────

describe('Error truncation (J21-TEST-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "and N more" when >20 validation errors exist', async () => {
    renderPage();
    await selectFile(createCsvFile());

    const manyErrors = Array.from({ length: 25 }, (_, i) => ({
      row: i + 1,
      field: 'name',
      error: `Error on row ${i + 1}`,
    }));

    mockUploadAndValidateSuccess({
      validCount: 0,
      invalidCount: 25,
      totalRows: 25,
      errors: manyErrors,
      previewRows: [],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText(/\.\.\.and 5 more/)).toBeInTheDocument();
    });
  });
});

// ── Validate step multiple errors format (J21-TEST-001) ─────────────────

describe('Validate step error formatting (J21-TEST-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows multiple error details from validate API failure', async () => {
    renderPage();
    await selectFile(createCsvFile());

    let callCount = 0;
    mockAuthFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { jobId: 'job-multi' } }),
        });
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({
          error: {
            errors: [
              { row: 1, message: 'Missing name' },
              { row: 3, message: 'Invalid price' },
            ],
          },
        }),
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Validate & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText(/Row 1: Missing name/)).toBeInTheDocument();
    });
  });
});
