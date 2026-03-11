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

  // ── Header ──────────────────────────────────────────────────

  it('renders header', () => {
    render(<DocumentsTab {...createProps()} />);
    expect(screen.getByText('Document Verification Queue')).toBeTruthy();
  });

  it('renders subtitle with pending count', () => {
    render(<DocumentsTab {...createProps({ pendingDocsTotal: 15 })} />);
    expect(screen.getByText(/15 pending/)).toBeTruthy();
  });

  it('renders subtitle description', () => {
    render(<DocumentsTab {...createProps()} />);
    expect(screen.getByText(/Review and approve\/reject KYC documents/)).toBeTruthy();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state', () => {
    render(<DocumentsTab {...createProps()} />);
    expect(screen.getByText('No pending documents to review.')).toBeTruthy();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows loading skeleton', () => {
    render(<DocumentsTab {...createProps({ documentsLoading: true })} />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });

  it('shows Loading... on button when loading', () => {
    render(<DocumentsTab {...createProps({ documentsLoading: true })} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('disables refresh button when loading', () => {
    render(<DocumentsTab {...createProps({ documentsLoading: true })} />);
    expect((screen.getByText('Loading...') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error', () => {
    render(<DocumentsTab {...createProps({ documentsError: 'Load failed' })} />);
    expect(screen.getByText('Load failed')).toBeTruthy();
  });

  it('shows error with role=alert', () => {
    render(<DocumentsTab {...createProps({ documentsError: 'Server error' })} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  // ── Entity Filter ──────────────────────────────────────────

  it('renders entity filter with All Entities option', () => {
    render(<DocumentsTab {...createProps()} />);
    expect(screen.getByDisplayValue('All Entities')).toBeTruthy();
  });

  it('calls setDocumentsEntityFilter on filter change', () => {
    const setFilter = vi.fn();
    const setPage = vi.fn();
    render(<DocumentsTab {...createProps({ setDocumentsEntityFilter: setFilter, setDocumentsPage: setPage })} />);
    fireEvent.change(screen.getByDisplayValue('All Entities'), { target: { value: 'store' } });
    expect(setFilter).toHaveBeenCalledWith('store');
  });

  it('resets page to 0 on filter change', () => {
    const setPage = vi.fn();
    render(<DocumentsTab {...createProps({ setDocumentsPage: setPage })} />);
    fireEvent.change(screen.getByDisplayValue('All Entities'), { target: { value: 'supplier' } });
    expect(setPage).toHaveBeenCalled();
  });

  // ── Table ───────────────────────────────────────────────────

  it('renders table column headers', () => {
    const docs = [makeDoc()];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText('Entity')).toBeTruthy();
    expect(screen.getByText('Document Type')).toBeTruthy();
    expect(screen.getByText('File')).toBeTruthy();
    expect(screen.getByText('Uploaded')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();
  });

  it('renders document rows', () => {
    const docs = [makeDoc()];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText('GST_CERTIFICATE')).toBeTruthy();
    expect(screen.getByText('gst.pdf')).toBeTruthy();
  });

  it('renders entity type and name', () => {
    const docs = [makeDoc({ entity_type: 'supplier', entity_name: 'Fresh Farms' })];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText('supplier')).toBeTruthy();
    expect(screen.getByText('Fresh Farms')).toBeTruthy();
  });

  it('renders owner name', () => {
    const docs = [makeDoc({ owner_name: 'Rajesh Kumar' })];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText('Rajesh Kumar')).toBeTruthy();
  });

  it('renders file size in KB', () => {
    const docs = [makeDoc({ file_size: 204800 })];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText(/200\.0 KB/)).toBeTruthy();
  });

  it('renders status badge', () => {
    const docs = [makeDoc({ status: 'pending' })];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText('pending')).toBeTruthy();
  });

  it('renders formatted upload timestamp', () => {
    const docs = [makeDoc({ uploaded_at: '2026-03-10T10:00:00Z' })];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText('2026-03-10T10:00:00Z')).toBeTruthy();
  });

  it('falls back to entity_id slice when entity_name is empty', () => {
    const docs = [makeDoc({ entity_name: '', entity_id: 'abcdefghij' })];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText('abcdefgh')).toBeTruthy();
  });

  it('renders multiple document rows', () => {
    const docs = [
      makeDoc({ id: 'd1', document_type: 'GST_CERTIFICATE', file_name: 'gst.pdf' }),
      makeDoc({ id: 'd2', document_type: 'PAN_CARD', file_name: 'pan.jpg' }),
    ];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 2 })} />);
    expect(screen.getByText('GST_CERTIFICATE')).toBeTruthy();
    expect(screen.getByText('PAN_CARD')).toBeTruthy();
    expect(screen.getByText('pan.jpg')).toBeTruthy();
  });

  // ── Review Button ───────────────────────────────────────────

  it('calls handleOpenDocument on Review click', () => {
    const handleOpen = vi.fn();
    const docs = [makeDoc()];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1, handleOpenDocument: handleOpen })} />);
    fireEvent.click(screen.getByText('Review'));
    expect(handleOpen).toHaveBeenCalledWith(docs[0]);
  });

  // ── Document Review Modal ───────────────────────────────────

  it('renders document review modal when selectedDocument is set', () => {
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    expect(screen.getByText('Review Document')).toBeTruthy();
  });

  it('shows document type in modal', () => {
    const doc = makeDoc({ document_type: 'AADHAAR_CARD' });
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    const elements = screen.getAllByText('AADHAAR_CARD');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows file info in modal', () => {
    const doc = makeDoc({ file_name: 'doc.pdf', file_size: 51200 });
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    expect(screen.getByText(/50\.0 KB/)).toBeTruthy();
  });

  it('shows Approve Document button in modal', () => {
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    expect(screen.getByText(/Approve Document/)).toBeTruthy();
  });

  it('shows Reject button in modal', () => {
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    expect(screen.getByText(/Reject/)).toBeTruthy();
  });

  it('calls handleApproveDocument on approve click', () => {
    const handleApprove = vi.fn();
    const doc = makeDoc({ id: 'doc-x' });
    render(<DocumentsTab {...createProps({ selectedDocument: doc, handleApproveDocument: handleApprove })} />);
    fireEvent.click(screen.getByText(/Approve Document/));
    expect(handleApprove).toHaveBeenCalledWith('doc-x');
  });

  it('shows rejection reason input in modal', () => {
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    expect(screen.getByPlaceholderText(/Rejection reason/)).toBeTruthy();
  });

  it('calls setDocRejectReason on reason input change', () => {
    const setReason = vi.fn();
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc, setDocRejectReason: setReason })} />);
    fireEvent.change(screen.getByPlaceholderText(/Rejection reason/), { target: { value: 'Blurry image' } });
    expect(setReason).toHaveBeenCalledWith('Blurry image');
  });

  it('disables reject button when reason is too short', () => {
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc, docRejectReason: 'short' })} />);
    const rejectBtn = screen.getByText(/Reject/);
    expect((rejectBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows Processing... when document action is loading', () => {
    const doc = makeDoc({ id: 'doc-y' });
    render(<DocumentsTab {...createProps({ selectedDocument: doc, documentActionLoading: 'doc-y' })} />);
    expect(screen.getByText('Processing...')).toBeTruthy();
  });

  it('shows close button in modal', () => {
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    expect(screen.getByLabelText('Close document review')).toBeTruthy();
  });

  // ── Refresh ─────────────────────────────────────────────────

  it('calls refreshDocuments on button click', () => {
    const refresh = vi.fn();
    render(<DocumentsTab {...createProps({ refreshDocuments: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  // ── Pagination ──────────────────────────────────────────────

  it('shows pagination controls', () => {
    render(<DocumentsTab {...createProps({ pendingDocsTotal: 100 })} />);
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
  });

  it('shows Page 1 of 1 for small datasets', () => {
    render(<DocumentsTab {...createProps({ pendingDocsTotal: 10 })} />);
    expect(screen.getByText('Page 1 of 1')).toBeTruthy();
  });

  it('disables Prev on first page', () => {
    render(<DocumentsTab {...createProps({ pendingDocsTotal: 100, documentsPage: 0 })} />);
    expect(screen.getByLabelText('Previous page')).toHaveProperty('disabled', true);
  });

  it('disables Next on last page', () => {
    render(<DocumentsTab {...createProps({ pendingDocsTotal: 100, documentsPage: 1 })} />);
    expect(screen.getByLabelText('Next page')).toHaveProperty('disabled', true);
  });

  it('calls setDocumentsPage on Next click', () => {
    const setPage = vi.fn();
    render(<DocumentsTab {...createProps({ pendingDocsTotal: 100, documentsPage: 0, setDocumentsPage: setPage })} />);
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(setPage).toHaveBeenCalled();
  });

  it('calls setDocumentsPage on Prev click', () => {
    const setPage = vi.fn();
    render(<DocumentsTab {...createProps({ pendingDocsTotal: 100, documentsPage: 1, setDocumentsPage: setPage })} />);
    fireEvent.click(screen.getByLabelText('Previous page'));
    expect(setPage).toHaveBeenCalled();
  });

  // ── Error banner edge case ────────────────────────────────

  it('does not show error banner when no error', () => {
    render(<DocumentsTab {...createProps()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // ── Content type display ──────────────────────────────────

  it('renders content type in file info', () => {
    const docs = [makeDoc({ content_type: 'image/jpeg', file_size: 51200 })];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText(/image\/jpeg/)).toBeTruthy();
  });

  // ── Modal interactions ────────────────────────────────────

  it('calls handleCloseDocument on close button click', () => {
    const handleClose = vi.fn();
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc, handleCloseDocument: handleClose })} />);
    fireEvent.click(screen.getByLabelText('Close document review'));
    expect(handleClose).toHaveBeenCalled();
  });

  it('calls onModalDirty when reject reason is typed', () => {
    const onDirty = vi.fn();
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc, onModalDirty: onDirty })} />);
    fireEvent.change(screen.getByPlaceholderText(/Rejection reason/), { target: { value: 'Blurry image uploaded' } });
    expect(onDirty).toHaveBeenCalledWith(true);
  });

  it('calls onModalDirty(false) on approve click', () => {
    const onDirty = vi.fn();
    const handleApprove = vi.fn();
    const doc = makeDoc({ id: 'doc-md' });
    render(<DocumentsTab {...createProps({ selectedDocument: doc, onModalDirty: onDirty, handleApproveDocument: handleApprove })} />);
    fireEvent.click(screen.getByText(/Approve Document/));
    expect(onDirty).toHaveBeenCalledWith(false);
  });

  it('enables reject button when reason has 10+ characters', () => {
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc, docRejectReason: 'Very blurry image that needs fixing' })} />);
    const rejectBtn = screen.getByText(/Reject/);
    expect((rejectBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls handleRejectDocument with reason on reject click', () => {
    const handleReject = vi.fn();
    const doc = makeDoc({ id: 'doc-rej' });
    render(<DocumentsTab {...createProps({ selectedDocument: doc, docRejectReason: 'Image is completely blurry', handleRejectDocument: handleReject })} />);
    fireEvent.click(screen.getByText(/Reject/));
    expect(handleReject).toHaveBeenCalledWith('doc-rej', 'Image is completely blurry');
  });

  it('disables approve button for non-pending document', () => {
    const doc = makeDoc({ status: 'approved' });
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    const approveBtn = screen.getByText(/Approve Document/);
    expect((approveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables rejection input for non-pending document', () => {
    const doc = makeDoc({ status: 'approved' });
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    const input = screen.getByPlaceholderText(/Rejection reason/);
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it('does not render entity owner_name when missing', () => {
    const docs = [makeDoc({ owner_name: '' })];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.queryByText('Owner')).toBeNull();
  });

  it('renders approved status badge', () => {
    const docs = [makeDoc({ status: 'approved' })];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText('approved')).toBeTruthy();
  });

  it('does not show empty state when loading', () => {
    render(<DocumentsTab {...createProps({ documentsLoading: true })} />);
    expect(screen.queryByText('No pending documents to review.')).toBeNull();
  });

  it('shows entity info in modal', () => {
    const doc = makeDoc({ entity_type: 'store', entity_name: 'My Shop' });
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    expect(screen.getByText(/store - My Shop/)).toBeTruthy();
  });

  it('shows document loading preview text', () => {
    const doc = makeDoc();
    render(<DocumentsTab {...createProps({ selectedDocument: doc })} />);
    // fetchDocumentBlob is mocked to resolve, but on initial render blobLoading is true
    expect(screen.getByText('Loading document preview...')).toBeTruthy();
  });

  it('renders Status column header in table', () => {
    const docs = [makeDoc()];
    render(<DocumentsTab {...createProps({ pendingDocuments: docs, pendingDocsTotal: 1 })} />);
    expect(screen.getByText('Status')).toBeTruthy();
  });
});
