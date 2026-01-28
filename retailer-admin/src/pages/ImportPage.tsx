import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch } from '../lib/api';

type ImportStep = 'upload' | 'validate' | 'review' | 'commit' | 'done';

interface ValidationResult {
  validCount: number;
  invalidCount: number;
  totalRows: number;
  errors: { row: number; field: string; error: string }[];
  previewRows: {
    row: number;
    name: string;
    barcode: string;
    brand: string;
    sellPrice: number;
    purchasePrice: number;
    mode: string;
    valid: boolean;
    errors: string[];
  }[];
}

interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

export default function ImportPage() {
  const { accessToken } = useAuth();
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === 'text/csv' || droppedFile?.name.endsWith('.csv')) {
      setFile(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  // RCAT-CSV-001: Download template
  const handleDownloadTemplate = async () => {
    try {
      const response = await authFetch('/api/v1/retailer-admin/products/import/template', accessToken);
      if (!response.ok) throw new Error('Failed to download template');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'supermandi_products_import_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download template');
    }
  };

  // RCAT-CSV-002: Upload + Validate
  const handleUploadAndValidate = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true);
    setStep('validate');

    try {
      // Read file content
      const csvContent = await file.text();

      // Step 1: Upload
      const uploadResp = await authFetch('/api/v1/retailer-admin/products/import/upload', accessToken, {
        method: 'POST',
        body: JSON.stringify({ csvContent, fileName: file.name }),
      });
      if (!uploadResp.ok) {
        const data = await uploadResp.json();
        throw new Error(data.error?.message || 'Upload failed');
      }
      const uploadData = await uploadResp.json();
      const newJobId = uploadData.data.jobId;
      setJobId(newJobId);

      // Step 2: Validate
      const validateResp = await authFetch(
        `/api/v1/retailer-admin/products/import/validate?jobId=${newJobId}`,
        accessToken,
        { method: 'POST' }
      );
      if (!validateResp.ok) {
        const data = await validateResp.json();
        // GL-CRIT-0102: Show specific error type and row number if available
        const errorDetails = data.error;
        if (errorDetails?.row !== undefined) {
          throw new Error(`Row ${errorDetails.row}: ${errorDetails.message || 'Invalid data'}`);
        }
        if (errorDetails?.errors && Array.isArray(errorDetails.errors) && errorDetails.errors.length > 0) {
          // Format multiple errors with row numbers
          const formattedErrors = errorDetails.errors.slice(0, 5).map((e: { row?: number; message?: string }) =>
            e.row !== undefined ? `Row ${e.row}: ${e.message}` : e.message
          ).join('\n');
          throw new Error(formattedErrors + (errorDetails.errors.length > 5 ? `\n...and ${errorDetails.errors.length - 5} more errors` : ''));
        }
        throw new Error(errorDetails?.message || 'Validation failed. Please check your file format.');
      }
      const validateData = await validateResp.json();
      setValidation(validateData.data);
      setStep('review');
    } catch (err) {
      // GL-CRIT-0102: Preserve detailed error messages
      setError(err instanceof Error ? err.message : 'Import failed. Please ensure your file is a valid CSV/Excel file.');
      setStep('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  // RCAT-CSV-002: Commit
  const handleCommit = async () => {
    if (!jobId) return;
    setError('');
    setIsProcessing(true);
    setStep('commit');

    try {
      const resp = await authFetch(
        `/api/v1/retailer-admin/products/import/commit?jobId=${jobId}`,
        accessToken,
        { method: 'POST' }
      );
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error?.message || 'Commit failed');
      }
      const data = await resp.json();
      setCommitResult(data.data);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed');
      setStep('review');
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setJobId(null);
    setValidation(null);
    setCommitResult(null);
    setError('');
  };

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Import Products (CSV)</h1>
      </header>

      <div className="page-content">
        {/* Progress Steps */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
          {(['upload', 'validate', 'review', 'commit', 'done'] as ImportStep[]).map((s, i) => (
            <div
              key={s}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: step === s ? 'var(--primary)' : i < ['upload', 'validate', 'review', 'commit', 'done'].indexOf(step) ? '#22c55e' : 'var(--border)',
                color: step === s || i < ['upload', 'validate', 'review', 'commit', 'done'].indexOf(step) ? 'white' : 'var(--text-muted)',
                borderRadius: '0.25rem',
                textAlign: 'center',
                fontSize: '0.875rem',
                textTransform: 'capitalize',
              }}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            background: '#fee2e2', color: '#991b1b',
            padding: '0.75rem 1rem', borderRadius: '0.375rem',
            marginBottom: '1rem', fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="card">
            <h3 className="card-title">Upload CSV File</h3>

            {/* RCAT-CSV-001: Download Template Button */}
            <div style={{ marginBottom: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
                Download CSV Template
              </button>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              style={{
                border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: '0.5rem',
                padding: '3rem',
                textAlign: 'center',
                background: isDragging ? '#eff6ff' : 'var(--background)',
                marginBottom: '1.5rem',
              }}
            >
              {file ? (
                <div>
                  <p style={{ fontSize: '1.125rem', fontWeight: '500' }}>📄 {file.name}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <button
                    className="btn btn-secondary"
                    style={{ marginTop: '1rem' }}
                    onClick={() => setFile(null)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📥</p>
                  <p style={{ marginBottom: '1rem' }}>Drag & drop your CSV file here</p>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                    Browse Files
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                  </label>
                </>
              )}
            </div>

            {file && (
              <button className="btn btn-primary" onClick={handleUploadAndValidate} disabled={isProcessing}>
                Validate & Continue
              </button>
            )}

            {/* CSV Format Info */}
            <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--background)', borderRadius: '0.5rem' }}>
              <h4 style={{ marginBottom: '0.75rem' }}>Expected CSV Format:</h4>
              <code style={{ fontSize: '0.75rem', display: 'block', overflow: 'auto' }}>
                name,barcode,brand,unit,sell_price,purchase_price,mrp,stock,mode
                <br />
                Parle-G 100g,8901030865432,Parle,PCS,10.00,8.50,10.00,100,PACKAGED
                <br />
                Loose Rice,,Local,KG,85.00,75.00,,25,LOOSE_BULK
              </code>
            </div>
          </div>
        )}

        {/* Step: Validate */}
        {step === 'validate' && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
            <h3>Validating CSV...</h3>
            <p style={{ color: 'var(--text-muted)' }}>Checking rows, formats, and data integrity</p>
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && validation && (
          <div className="card">
            <h3 className="card-title">Review Import</h3>

            <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card">
                <div className="stat-label">Total Rows</div>
                <div className="stat-value">{validation.totalRows}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Valid Rows</div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>{validation.validCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Errors</div>
                <div className="stat-value" style={{ color: validation.invalidCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {validation.invalidCount}
                </div>
              </div>
            </div>

            {/* Validation Errors */}
            {validation.errors.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.75rem' }}>Validation Errors:</h4>
                <div style={{ background: '#fee2e2', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.875rem', maxHeight: '200px', overflow: 'auto' }}>
                  {validation.errors.slice(0, 20).map((err, i) => (
                    <p key={i} style={{ margin: '0.25rem 0' }}>Row {err.row}: {err.error}</p>
                  ))}
                  {validation.errors.length > 20 && (
                    <p style={{ fontStyle: 'italic' }}>...and {validation.errors.length - 20} more</p>
                  )}
                </div>
              </div>
            )}

            {/* Preview Table */}
            {validation.previewRows.length > 0 && (
              <div style={{ marginBottom: '1.5rem', maxHeight: '300px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '0.375rem' }}>
                <table className="table" style={{ fontSize: '0.75rem' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Barcode</th>
                      <th>Brand</th>
                      <th>Sell ₹</th>
                      <th>Mode</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.previewRows.map((row) => (
                      <tr key={row.row} style={{ background: row.valid ? undefined : '#fef2f2' }}>
                        <td>{row.row}</td>
                        <td>{row.name}</td>
                        <td style={{ fontFamily: 'monospace' }}>{row.barcode || <em style={{ color: 'var(--text-muted)' }}>auto</em>}</td>
                        <td>{row.brand || '-'}</td>
                        <td>₹{(row.sellPrice / 100).toFixed(2)}</td>
                        <td><span className={`badge ${row.mode === 'PACKAGED' ? 'badge-info' : 'badge-secondary'}`}>{row.mode === 'PACKAGED' ? 'Packaged' : 'Loose'}</span></td>
                        <td>{row.valid ? '✅' : '❌'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleCommit}
                disabled={validation.validCount === 0 || isProcessing}
              >
                Import {validation.validCount} Valid Rows
              </button>
              <button className="btn btn-secondary" onClick={reset}>
                Upload Different File
              </button>
            </div>
          </div>
        )}

        {/* Step: Commit */}
        {step === 'commit' && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📥</div>
            <h3>Importing Products...</h3>
            <p style={{ color: 'var(--text-muted)' }}>Creating products and updating inventory</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && commitResult && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h3 style={{ color: 'var(--success)', marginBottom: '0.5rem' }}>Import Complete!</h3>
            <p style={{ marginBottom: '1.5rem' }}>
              <strong>{commitResult.created}</strong> products imported successfully.
              {commitResult.skipped > 0 && (
                <><br /><strong>{commitResult.skipped}</strong> skipped.</>
              )}
            </p>
            {commitResult.warnings.length > 0 && (
              <div style={{ textAlign: 'left', background: '#fef3c7', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {commitResult.warnings.map((w, i) => <p key={i} style={{ margin: '0.25rem 0' }}>{w}</p>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <a href="products" className="btn btn-primary">View Products</a>
              <button className="btn btn-secondary" onClick={reset}>
                Import More
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
