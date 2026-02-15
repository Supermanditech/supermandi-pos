// SuperAdmin — Test DocumentsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentsTab } from '../../tabs/DocumentsTab';
import type { DocumentRecord } from '../../api/documents';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

vi.mock('../../api/documents', () => ({
  fetchDocumentBlob: vi.fn().mockResolvedValue('blob:http://localhost/mock'),
}));

vi.mock('../../components/TableSkeleton', () => ({
  TableSkeleton: () => <div data-testid="skeleton">Loading skeleton</div>,
}));

const makeDoc = (overrides: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'doc-1',
  entity_type: 'store',
  entity_id: 'e1',
  entity_name: 'Test Store',
  owner_name: 'Owner',
  document_type: 'GST_CERTIFICATE',
  file_name: 'gst.pdf',
  file_size: 102400,
  content_type: 'application/pdf',
  status: 'pending',
  uploaded_at: '2026-01-01T00:00:00Z',
  ...overrides,
} as DocumentRecord);

function createProps(overrides: Partial<Parameters<typeof DocumentsTab>[0]> = {}) {
  return {
    pendingDocuments: [],
    pendingDocsTotal: 0,
    documentsLoading: false,
    documentsError: '',
    documentsPage: 0,
    documentsEntityFilter: '' as const,
    selectedDocument: null,
    docRejectReason: '',
    documentActionLoading: null,
    setDocumentsPage: vi.fn(),
    setDocumentsEntityFilter: vi.fn(),
    setSelectedDocument: vi.fn(),
    handleOpenDocument: vi.fn(),
    handleCloseDocument: vi.fn(),
    onModalDirty: vi.fn(),
    setDocRejectReason: vi.fn(),
    refreshDocuments: vi.fn(),
    handleApproveDocument: vi.fn(),
    handleRejectDocument: vi.fn(),
    ...overrides,
  };
}

describe('DocumentsTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders header', () => {
    render(<DocumentsTab {...createProps()} />);
    expect(screen.getByText('Document Verification Queue')).toBeTruthy();
  });

  it('shows empty state', () => {
    render(<DocumentsTab {...createProps()} />);
    expect(screen.getByText('No pending documents to review.')).toBeTruthy();
  });

  it('shows loading skeleton', () => {
    render(<DocumentsTab {...createProps({ documentsLoading: true })} />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });

  it('shows error', () => {
    render(<DocumentsTab {...createProps({ documentsError: 'Load failed' })} />);
    expect(screen.getByText('Load failed')).toBeTruthy();
  });

  it('renders document rows', () => {
    const docs = [makeDoc()];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText('GST_CERTIFICATE')).toBeTruthy();
    expect(screen.getByText('gst.pdf')).toBeTruthy();
  });

  it('calls handleOpenDocument on Review click', () => {
    const handleOpen = vi.fn();
    const docs = [makeDoc()];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1, handleOpenDocument: handleOpen })} />);
    fireEvent.click(screen.getByText('Review'));
    expect(handleOpen).toHaveBeenCalledWith(docs[0]);
  });

  it('renders document review modal when selectedDocument is set', () => {
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    expect(screen.getByText('Review Document')).toBeTruthy();
    expect(screen.getByText('GST_CERTIFICATE')).toBeTruthy();
  });

  it('shows pagination controls', () => {
    render(<DocumentsTab {...createProps({ pendingDocsTotal: 100 })} />);
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
  });

  it('calls refreshDocuments on button click', () => {
    const refresh = vi.fn();
    render(<DocumentsTab {...createProps({ refreshDocuments: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });
});
