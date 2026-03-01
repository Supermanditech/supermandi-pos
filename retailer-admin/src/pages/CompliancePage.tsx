// GL-WF-032: Compliance Document Upload with real API integration
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
// T-112: Breadcrumb navigation
import Breadcrumb from '../components/Breadcrumb';
// REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001
import { MAX_DOCUMENT_SIZE_BYTES, MAX_DOCUMENT_SIZE_LABEL } from '../lib/fileLimits';
import { logger } from '../lib/logger';

interface Document {
  id: string;
  type: string;
  fileName: string;
  uploadedAt: string;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason?: string;
  fileUrl?: string;
}

const documentTypes = [
  { value: 'gstin', label: 'GSTIN Certificate' },
  { value: 'fssai', label: 'FSSAI License' },
  { value: 'shop_license', label: 'Shop License' },
  { value: 'pan', label: 'PAN Card' },
  { value: 'trade_license', label: 'Trade License' },
  { value: 'address_proof', label: 'Address Proof' },
];

export default function CompliancePage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();
  const [showUpload, setShowUpload] = useState(false);
  const [uploadEnabled, setUploadEnabled] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Fetch existing documents on mount — XWIRE-004: use correct endpoint /compliance
  useEffect(() => {
    if (!accessToken) return;

    const fetchDocuments = async () => {
      setIsLoading(true);
      try {
        const response = await authFetch('/api/v1/retailer-admin/compliance', accessToken);
        if (response.ok) {
          const data = await safeJson(response);
          setDocuments(data.data?.documents || []);
          setUploadEnabled(data.data?.uploadEnabled ?? false);
          if (data.data?.message) setStatusMessage(data.data.message);
        }
      } catch (err) {
        logger.error('Failed to fetch documents:', err);
        setError('Failed to load compliance documents. Please refresh the page.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [accessToken]);

  const getStatusBadge = (status: Document['status']) => {
    switch (status) {
      case 'verified':
        return <span className="badge badge-success">✓ Verified</span>;
      case 'pending':
        return <span className="badge badge-warning">⏳ Pending</span>;
      case 'rejected':
        return <span className="badge badge-danger">✗ Rejected</span>;
    }
  };

  // GL-WF-032: Real document upload handler
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !selectedType || !accessToken) {
      setError('Please select document type and file');
      return;
    }

    // Validate file size (REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001)
    if (selectedFile.size > MAX_DOCUMENT_SIZE_BYTES) {
      setError(`File size must be less than ${MAX_DOCUMENT_SIZE_LABEL}`);
      return;
    }

    setIsUploading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('document', selectedFile);
      formData.append('type', selectedType);

      const response = await authFetch('/api/v1/retailer-admin/compliance', accessToken, {
        method: 'POST',
        body: formData,
      });

      if (response.status === 401) return;

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error?.message || 'Upload failed');
      }

      // Add new document to the list
      if (data.data) {
        setDocuments(prev => [data.data, ...prev]);
      }

      setSuccess(`Document "${selectedFile.name}" uploaded successfully!`);
      setShowUpload(false);
      setSelectedType('');
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle document download
  const handleDownload = async (doc: Document) => {
    if (!doc.fileUrl || !accessToken) return;

    try {
      const response = await authFetch(doc.fileUrl, accessToken);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('Failed to download document');
    }
  };

  // Count documents by status
  const statusCounts = {
    verified: documents.filter(d => d.status === 'verified').length,
    pending: documents.filter(d => d.status === 'pending').length,
    rejected: documents.filter(d => d.status === 'rejected').length,
  };

  return (
    <>
      {/* T-112: Breadcrumb navigation */}
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Compliance' }]} />
      </div>
      <header className="page-header">
        <div className="flex-between">
          <h1 className="page-title">Compliance Documents</h1>
          {uploadEnabled && (
            <button className="btn btn-primary" onClick={() => setShowUpload(!showUpload)}>
              {showUpload ? 'Cancel' : 'Upload Document'}
            </button>
          )}
        </div>
      </header>

      <div className="page-content">
        {/* Success/Error Messages */}
        {success && (
          <div className="alert-success">
            {success}
          </div>
        )}
        {error && (
          <div className="alert-error">
            {error}
          </div>
        )}

        {/* Status Summary */}
        <div className="grid grid-3 grid-mb-lg">
          <div className="stat-card">
            <div className="stat-label">✓ Verified</div>
            <div className="stat-value stat-value--success">{statusCounts.verified}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">⏳ Pending</div>
            <div className="stat-value stat-value--warning">{statusCounts.pending}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">✗ Rejected</div>
            <div className="stat-value stat-value--danger">{statusCounts.rejected}</div>
          </div>
        </div>

        {/* Status Message from backend */}
        {statusMessage && !uploadEnabled && (
          <div className="alert-warning">
            {statusMessage}
          </div>
        )}

        {/* Upload Form */}
        {showUpload && uploadEnabled && (
          <div className="card card-mb-lg">
            <h3 className="card-title">Upload New Document</h3>
            <form onSubmit={handleUpload}>
              <div className="grid grid-2 grid-mb">
                <div className="form-group">
                  <label className="form-label" htmlFor="compliance-doc-type">Document Type *</label>
                  <select
                    id="compliance-doc-type"
                    className="form-input"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    required
                    disabled={isUploading}
                  >
                    <option value="">Select document type</option>
                    {documentTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="compliance-doc-file">File * (PDF, JPG, PNG - max {MAX_DOCUMENT_SIZE_LABEL})</label>
                  <input
                    id="compliance-doc-file"
                    type="file"
                    className="form-input"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    required
                    disabled={isUploading}
                  />
                </div>
              </div>
              {selectedFile && (
                <p className="file-info-text">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
              <div className="flex-row">
                <button type="submit" className="btn btn-primary" disabled={isUploading}>
                  {isUploading ? 'Uploading...' : 'Upload'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowUpload(false)}
                  disabled={isUploading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Documents List */}
        <div className="card card-no-padding">
          {isLoading ? (
            <div className="text-center-muted">
              Loading documents...
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center-muted">
              No documents uploaded yet. Click "Upload Document" to add your compliance documents.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Document Type</th>
                  <th>File Name</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="cell-bold">{documentTypes.find(dt => dt.value === doc.type)?.label || doc.type}</td>
                    <td className="cell-mono cell-sm">{doc.fileName}</td>
                    <td className="text-sm-muted">
                      {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}
                    </td>
                    <td>
                      {getStatusBadge(doc.status)}
                      {doc.rejectionReason && (
                        <p className="rejection-text">
                          {doc.rejectionReason}
                        </p>
                      )}
                    </td>
                    <td>
                      <div className="flex-row">
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => handleDownload(doc)}
                        >
                          Download
                        </button>
                        {doc.status === 'rejected' && (
                          <button
                            aria-label="Re-upload compliance document"
                            className="btn btn-primary btn-xs"
                            onClick={() => {
                              setSelectedType(doc.type);
                              setShowUpload(true);
                            }}
                          >
                            Re-upload
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Required Documents */}
        <div className="docs-section">
          <h4>Required Documents:</h4>
          <ul className="docs-list">
            <li>GSTIN Certificate (if registered)</li>
            <li>FSSAI License (for food products)</li>
            <li>Shop & Establishment License</li>
            <li>PAN Card</li>
            <li>Trade License (if applicable)</li>
          </ul>
        </div>
      </div>
    </>
  );
}
