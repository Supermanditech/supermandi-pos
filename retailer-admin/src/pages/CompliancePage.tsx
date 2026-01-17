import { useState } from 'react';

interface Document {
  id: string;
  type: string;
  fileName: string;
  uploadedAt: string;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason?: string;
}

// Mock data
const mockDocuments: Document[] = [
  { id: '1', type: 'GSTIN Certificate', fileName: 'gstin_certificate.pdf', uploadedAt: '2024-01-10', status: 'verified' },
  { id: '2', type: 'FSSAI License', fileName: 'fssai_license.pdf', uploadedAt: '2024-01-12', status: 'verified' },
  { id: '3', type: 'Shop License', fileName: 'shop_license.pdf', uploadedAt: '2024-01-14', status: 'pending' },
  { id: '4', type: 'PAN Card', fileName: 'pan_card.jpg', uploadedAt: '2024-01-15', status: 'rejected', rejectionReason: 'Image is blurry, please upload a clear copy' },
];

const documentTypes = [
  { value: 'gstin', label: 'GSTIN Certificate' },
  { value: 'fssai', label: 'FSSAI License' },
  { value: 'shop_license', label: 'Shop License' },
  { value: 'pan', label: 'PAN Card' },
  { value: 'trade_license', label: 'Trade License' },
];

export default function CompliancePage() {
  const [showUpload, setShowUpload] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate upload
    setShowUpload(false);
    setSelectedType('');
    setSelectedFile(null);
  };

  return (
    <>
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="page-title">Compliance Documents</h1>
          <button className="btn btn-primary" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? 'Cancel' : '📤 Upload Document'}
          </button>
        </div>
      </header>

      <div className="page-content">
        {/* Status Summary */}
        <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <div className="stat-label">✓ Verified</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>2</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">⏳ Pending</div>
            <div className="stat-value" style={{ color: 'var(--warning)' }}>1</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">✗ Rejected</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>1</div>
          </div>
        </div>

        {/* Upload Form */}
        {showUpload && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="card-title">Upload New Document</h3>
            <form onSubmit={handleUpload}>
              <div className="grid grid-2" style={{ marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Document Type *</label>
                  <select
                    className="form-input"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    required
                  >
                    <option value="">Select document type</option>
                    {documentTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">File *</label>
                  <input
                    type="file"
                    className="form-input"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>
              </div>
              {selectedFile && (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary">Upload</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowUpload(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Documents List */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
              {mockDocuments.map((doc) => (
                <tr key={doc.id}>
                  <td style={{ fontWeight: '500' }}>{doc.type}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{doc.fileName}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{doc.uploadedAt}</td>
                  <td>
                    {getStatusBadge(doc.status)}
                    {doc.rejectionReason && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem' }}>
                        {doc.rejectionReason}
                      </p>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                        Download
                      </button>
                      {doc.status === 'rejected' && (
                        <button className="btn btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                          Re-upload
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Required Documents */}
        <div style={{ marginTop: '1.5rem' }}>
          <h4 style={{ marginBottom: '0.75rem' }}>Required Documents:</h4>
          <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
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
