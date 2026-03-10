import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import UploadPage from '../../../app/(dashboard)/upload/page';

// Mock next/link
jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: any) =>
      React.createElement('a', { href, ...props }, children),
  };
});

// Mock react-hot-toast — use jest.requireMock to access after hoisting
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Configurable useMutation mock
let mutateFn: jest.Mock;
let mutationState: { isPending: boolean };
let mutationCallbacks: { onSuccess?: Function; onError?: Function };
const mockInvalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useMutation: (opts: any) => {
    mutationCallbacks = { onSuccess: opts.onSuccess, onError: opts.onError };
    return {
      mutate: mutateFn,
      mutateAsync: mutateFn,
      isPending: mutationState.isPending,
    };
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// Mock API
jest.mock('../../../lib/api', () => ({
  uploadProductsCsv: jest.fn(),
}));

// Mock fileLimits
jest.mock('../../../lib/fileLimits', () => ({
  MAX_CSV_UPLOAD_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_CSV_UPLOAD_SIZE_LABEL: '5MB',
}));

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ items }: any) =>
      React.createElement('nav', { 'data-testid': 'breadcrumb' },
        items.map((item: any, i: number) =>
          React.createElement('span', { key: i }, item.label)
        )
      ),
  };
});

// URL mock
const originalCreateObjectURL = window.URL.createObjectURL;
const originalRevokeObjectURL = window.URL.revokeObjectURL;

describe('UploadPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutateFn = jest.fn();
    mutationState = { isPending: false };
    mutationCallbacks = {};
    window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    window.URL.revokeObjectURL = jest.fn();
  });

  afterAll(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  // ── Initial Render ──────────────────────────────────────────

  it('renders the page heading', () => {
    render(<UploadPage />);
    expect(screen.getByRole('heading', { name: 'CSV Upload', level: 1 })).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<UploadPage />);
    expect(screen.getByText(/Bulk import products from a CSV file/)).toBeInTheDocument();
  });

  it('renders breadcrumb with Dashboard and CSV Upload', () => {
    render(<UploadPage />);
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toBeInTheDocument();
    expect(breadcrumb).toHaveTextContent('Dashboard');
    expect(breadcrumb).toHaveTextContent('CSV Upload');
  });

  // ── CSV Template Section ────────────────────────────────────

  it('renders CSV Template section heading', () => {
    render(<UploadPage />);
    expect(screen.getByText('CSV Template')).toBeInTheDocument();
  });

  it('renders template description text', () => {
    render(<UploadPage />);
    expect(screen.getByText(/Download the template and fill in your product data/)).toBeInTheDocument();
  });

  it('renders Download Template button', () => {
    render(<UploadPage />);
    expect(screen.getByText('Download Template')).toBeInTheDocument();
  });

  it('renders template table with all column headers', () => {
    render(<UploadPage />);
    expect(screen.getByText('name*')).toBeInTheDocument();
    expect(screen.getByText('purchase_price*')).toBeInTheDocument();
    expect(screen.getByText('mrp')).toBeInTheDocument();
    expect(screen.getByText('barcode')).toBeInTheDocument();
    expect(screen.getByText('sku')).toBeInTheDocument();
    expect(screen.getByText('category')).toBeInTheDocument();
    expect(screen.getByText('moq')).toBeInTheDocument();
    expect(screen.getByText('unit')).toBeInTheDocument();
  });

  it('renders template example row data', () => {
    render(<UploadPage />);
    expect(screen.getByText('Basmati Rice 5kg')).toBeInTheDocument();
    expect(screen.getByText('450')).toBeInTheDocument();
    expect(screen.getByText('520')).toBeInTheDocument();
    expect(screen.getByText('8901234567890')).toBeInTheDocument();
    expect(screen.getByText('RICE-BAS-5KG')).toBeInTheDocument();
    expect(screen.getByText('Chawal')).toBeInTheDocument();
  });

  it('generates and downloads CSV template on button click', () => {
    render(<UploadPage />);
    const mockClick = jest.fn();
    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = mockClick;
      }
      return el;
    });

    fireEvent.click(screen.getByText('Download Template'));

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    (document.createElement as jest.Mock).mockRestore();
  });

  // ── Upload Zone (Drag-and-Drop) ─────────────────────────────

  it('renders Upload CSV section heading', () => {
    render(<UploadPage />);
    expect(screen.getByText('Upload CSV')).toBeInTheDocument();
  });

  it('renders drag-and-drop zone', () => {
    render(<UploadPage />);
    expect(screen.getByText(/Drag and drop your CSV file/)).toBeInTheDocument();
    expect(screen.getByText('Browse Files')).toBeInTheDocument();
  });

  it('renders file format and size info', () => {
    render(<UploadPage />);
    expect(screen.getByText(/Supported format: CSV \(max 5MB\)/)).toBeInTheDocument();
  });

  it('renders hidden file input with CSV accept attribute', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]');
    expect(input).toHaveAttribute('accept', '.csv,text/csv');
    expect(input).toHaveClass('hidden');
  });

  it('accepts CSV file via file input', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['name,price\nTest,100'], 'products.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('products.csv')).toBeInTheDocument();
  });

  it('shows file size in KB after file selection', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const content = 'name,price\nTest,100';
    const file = new File([content], 'products.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'size', { value: 2048 });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('shows Upload & Import button after file selection', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['name,price\nTest,100'], 'products.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('Upload & Import')).toBeInTheDocument();
  });

  it('shows close button (✕) in file preview', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByLabelText('Close upload preview')).toBeInTheDocument();
  });

  it('resets file selection on close button click', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('test.csv')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close upload preview'));
    expect(screen.queryByText('test.csv')).not.toBeInTheDocument();
    expect(screen.getByText(/Drag and drop your CSV file/)).toBeInTheDocument();
  });

  it('hides drag-drop zone after file selection', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.queryByText(/Drag and drop your CSV file/)).not.toBeInTheDocument();
  });

  // ── Drag Events ─────────────────────────────────────────────

  it('accepts CSV file via drag-and-drop', () => {
    render(<UploadPage />);
    const dropZone = screen.getByText(/Drag and drop your CSV file/).closest('div[class*="border-dashed"]')!;
    const file = new File(['name,price\nTest,100'], 'drop.csv', { type: 'text/csv' });

    fireEvent.dragOver(dropZone, { dataTransfer: { files: [file] } });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(screen.getByText('drop.csv')).toBeInTheDocument();
  });

  it('accepts file with .csv extension even without csv mime type', () => {
    render(<UploadPage />);
    const dropZone = screen.getByText(/Drag and drop your CSV file/).closest('div[class*="border-dashed"]')!;
    const file = new File(['data'], 'import.csv', { type: '' });
    // File name check: file.name.endsWith('.csv')
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    expect(screen.getByText('import.csv')).toBeInTheDocument();
  });

  it('rejects non-CSV file via drag-and-drop', () => {
    render(<UploadPage />);
    const dropZone = screen.getByText(/Drag and drop your CSV file/).closest('div[class*="border-dashed"]')!;
    const file = new File(['data'], 'image.png', { type: 'image/png' });

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(jest.requireMock('react-hot-toast').default.error).toHaveBeenCalledWith('Please upload a CSV file');
    expect(screen.queryByText('image.png')).not.toBeInTheDocument();
  });

  // ── File Size Validation ────────────────────────────────────

  it('rejects oversized file via drag-and-drop', () => {
    render(<UploadPage />);
    const dropZone = screen.getByText(/Drag and drop your CSV file/).closest('div[class*="border-dashed"]')!;
    const file = new File(['data'], 'big.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 }); // 6MB > 5MB limit

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(jest.requireMock('react-hot-toast').default.error).toHaveBeenCalledWith('File size must be less than 5MB');
    expect(screen.queryByText('big.csv')).not.toBeInTheDocument();
  });

  it('rejects oversized file via file input', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'huge.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [file] } });

    expect(jest.requireMock('react-hot-toast').default.error).toHaveBeenCalledWith('File size must be less than 5MB');
    expect(screen.queryByText('huge.csv')).not.toBeInTheDocument();
  });

  it('accepts file exactly at size limit', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'exact.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 }); // exactly 5MB

    fireEvent.change(input, { target: { files: [file] } });

    // 5MB is NOT > 5MB, so it should be accepted
    expect(screen.getByText('exact.csv')).toBeInTheDocument();
  });

  // ── Upload Mutation ─────────────────────────────────────────

  it('calls mutate with selected file on Upload & Import click', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['name,price\nTest,100'], 'upload.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByText('Upload & Import'));
    expect(mutateFn).toHaveBeenCalledWith(file);
  });

  it('shows uploading state with spinner when isPending', () => {
    mutationState.isPending = true;
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('Uploading...')).toBeInTheDocument();
    // Check spinner element exists
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows indeterminate progress bar when uploading', () => {
    mutationState.isPending = true;
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText(/Uploading & processing/)).toBeInTheDocument();
    expect(document.querySelector('.progress-indeterminate')).toBeInTheDocument();
  });

  it('disables Upload & Import button when isPending', () => {
    mutationState.isPending = true;
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    const uploadBtn = screen.getByText('Uploading...').closest('button');
    expect(uploadBtn).toBeDisabled();
  });

  // ── Upload Results ──────────────────────────────────────────

  it('shows result summary after successful upload', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    act(() => {
      mutationCallbacks.onSuccess?.({
        imported: 15,
        skipped: 3,
        totalRows: 18,
        errors: [],
      });
    });

    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('Total Rows')).toBeInTheDocument();
  });

  it('shows success toast when imported > 0', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    act(() => {
      mutationCallbacks.onSuccess?.({
        imported: 10,
        skipped: 0,
        totalRows: 10,
        errors: [],
      });
    });

    expect(jest.requireMock('react-hot-toast').default.success).toHaveBeenCalledWith('Successfully imported 10 products!');
  });

  it('does not show success toast when imported is 0', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    act(() => {
      mutationCallbacks.onSuccess?.({
        imported: 0,
        skipped: 5,
        totalRows: 5,
        errors: [],
      });
    });

    expect(jest.requireMock('react-hot-toast').default.success).not.toHaveBeenCalled();
  });

  it('invalidates products query on success', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    act(() => {
      mutationCallbacks.onSuccess?.({
        imported: 5,
        skipped: 0,
        totalRows: 5,
        errors: [],
      });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['products'] });
  });

  it('displays per-row errors in results', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    act(() => {
      mutationCallbacks.onSuccess?.({
        imported: 2,
        skipped: 1,
        totalRows: 5,
        errors: [
          { row: 3, error: 'Missing required field: name' },
          { row: 5, error: 'Invalid price format' },
        ],
      });
    });

    expect(screen.getByText('Errors (2)')).toBeInTheDocument();
    expect(screen.getByText('Row 3: Missing required field: name')).toBeInTheDocument();
    expect(screen.getByText('Row 5: Invalid price format')).toBeInTheDocument();
  });

  it('does not show errors section when no errors', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    act(() => {
      mutationCallbacks.onSuccess?.({
        imported: 5,
        skipped: 0,
        totalRows: 5,
        errors: [],
      });
    });

    expect(screen.queryByText(/Errors \(/)).not.toBeInTheDocument();
  });

  it('shows Upload Another File button in results', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    act(() => {
      mutationCallbacks.onSuccess?.({
        imported: 5,
        skipped: 0,
        totalRows: 5,
        errors: [],
      });
    });

    expect(screen.getByText('Upload Another File')).toBeInTheDocument();
  });

  it('shows View Products link in results', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    act(() => {
      mutationCallbacks.onSuccess?.({
        imported: 5,
        skipped: 0,
        totalRows: 5,
        errors: [],
      });
    });

    const viewLink = screen.getByText('View Products');
    expect(viewLink).toHaveAttribute('href', '/products');
  });

  it('resets to upload zone on Upload Another File click', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    act(() => {
      mutationCallbacks.onSuccess?.({
        imported: 5,
        skipped: 0,
        totalRows: 5,
        errors: [],
      });
    });

    fireEvent.click(screen.getByText('Upload Another File'));
    expect(screen.getByText(/Drag and drop your CSV file/)).toBeInTheDocument();
    expect(screen.queryByText('Imported')).not.toBeInTheDocument();
  });

  // ── Error Handling ──────────────────────────────────────────

  it('shows error toast on upload failure', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    act(() => { mutationCallbacks.onError?.(new Error('Network error')); });

    expect(jest.requireMock('react-hot-toast').default.error).toHaveBeenCalledWith('Network error');
  });

  it('shows fallback error message when error has no message', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    act(() => { mutationCallbacks.onError?.(new Error('')); });

    expect(jest.requireMock('react-hot-toast').default.error).toHaveBeenCalledWith('Upload failed');
  });

  // ── Import Instructions ─────────────────────────────────────

  it('renders Import Instructions section', () => {
    render(<UploadPage />);
    expect(screen.getByText('Import Instructions')).toBeInTheDocument();
  });

  it('renders required fields instruction', () => {
    render(<UploadPage />);
    expect(screen.getByText((content, element) =>
      element?.tagName === 'SPAN' &&
      element?.textContent?.includes('name') === true &&
      element?.textContent?.includes('purchase_price') === true &&
      element?.textContent?.includes('required fields') === true
    )).toBeInTheDocument();
  });

  it('renders prices instruction', () => {
    render(<UploadPage />);
    expect(screen.getByText(/Prices should be in rupees/)).toBeInTheDocument();
  });

  it('renders duplicate barcodes instruction', () => {
    render(<UploadPage />);
    expect(screen.getByText(/Duplicate barcodes will be skipped/)).toBeInTheDocument();
  });

  it('renders pending status instruction', () => {
    render(<UploadPage />);
    expect(screen.getByText(/New products will be in "Pending" status/)).toBeInTheDocument();
  });

  it('renders valid units instruction', () => {
    render(<UploadPage />);
    expect(screen.getByText(/Valid units: PCS, KG, GM, LTR, ML, PACK, BOX/)).toBeInTheDocument();
  });

  it('renders five green checkmark instruction items', () => {
    render(<UploadPage />);
    const checks = screen.getAllByText('✓');
    expect(checks.length).toBe(5);
  });

  // ── Edge Cases ──────────────────────────────────────────────

  it('does not call mutate when no file is selected', () => {
    render(<UploadPage />);
    // No file selected, no Upload & Import button visible
    expect(screen.queryByText('Upload & Import')).not.toBeInTheDocument();
  });

  it('handles file input with no files gracefully', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    // Should still show drag-drop zone
    expect(screen.getByText(/Drag and drop your CSV file/)).toBeInTheDocument();
  });

  it('clears selectedFile on success (prevents double upload)', () => {
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('test.csv')).toBeInTheDocument();

    act(() => {
      mutationCallbacks.onSuccess?.({
        imported: 1,
        skipped: 0,
        totalRows: 1,
        errors: [],
      });
    });

    // File preview should be gone, replaced by results
    expect(screen.queryByText('test.csv')).not.toBeInTheDocument();
  });
});
