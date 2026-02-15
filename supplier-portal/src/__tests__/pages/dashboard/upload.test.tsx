import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import UploadPage from '../../../app/(dashboard)/upload/page';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock react-query
jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
  }),
}));

// Mock API
jest.mock('../../../lib/api', () => ({
  uploadProductsCsv: jest.fn(),
}));

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('nav', { 'data-testid': 'breadcrumb' }),
  };
});

describe('UploadPage', () => {
  it('renders the page heading', () => {
    render(<UploadPage />);
    expect(screen.getByText('CSV Upload')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<UploadPage />);
    expect(screen.getByText(/Bulk import products from a CSV file/)).toBeInTheDocument();
  });

  it('renders CSV Template section', () => {
    render(<UploadPage />);
    expect(screen.getByText('CSV Template')).toBeInTheDocument();
    expect(screen.getByText('Download Template')).toBeInTheDocument();
  });

  it('renders template table with column headers', () => {
    render(<UploadPage />);
    expect(screen.getByText('name*')).toBeInTheDocument();
    expect(screen.getByText('purchase_price*')).toBeInTheDocument();
  });

  it('renders Upload CSV section', () => {
    render(<UploadPage />);
    expect(screen.getByText('Upload CSV')).toBeInTheDocument();
  });

  it('renders drag-and-drop zone', () => {
    render(<UploadPage />);
    expect(screen.getByText(/Drag and drop your CSV file/)).toBeInTheDocument();
    expect(screen.getByText('Browse Files')).toBeInTheDocument();
  });

  it('renders file format info', () => {
    render(<UploadPage />);
    expect(screen.getByText(/Supported format: CSV/)).toBeInTheDocument();
  });

  it('renders Import Instructions section', () => {
    render(<UploadPage />);
    expect(screen.getByText('Import Instructions')).toBeInTheDocument();
  });

  it('renders instruction items', () => {
    render(<UploadPage />);
    // The first instruction has text split across <strong> elements:
    // <strong>name</strong> and <strong>purchase_price</strong> are required fields
    // Use a function matcher to find it by textContent
    expect(screen.getByText((content, element) =>
      element?.tagName === 'SPAN' &&
      element?.textContent?.includes('name') === true &&
      element?.textContent?.includes('purchase_price') === true &&
      element?.textContent?.includes('required fields') === true
    )).toBeInTheDocument();
    expect(screen.getByText(/Prices should be in rupees/)).toBeInTheDocument();
    expect(screen.getByText(/Duplicate barcodes will be skipped/)).toBeInTheDocument();
  });

  it('renders breadcrumb', () => {
    render(<UploadPage />);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
