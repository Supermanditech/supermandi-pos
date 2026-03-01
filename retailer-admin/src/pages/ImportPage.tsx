import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
// T-112: Breadcrumb navigation
import Breadcrumb from '../components/Breadcrumb';
// REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001
import { MAX_CSV_IMPORT_SIZE_BYTES, MAX_CSV_IMPORT_SIZE_LABEL } from '../lib/fileLimits';

// REQ.AUDIT.W5.RETAILER.IMPORT-POLL-INTERVAL-HARDCODED.001: named constant for polling interval
const IMPORT_POLL_INTERVAL_MS = 2000;

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
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  // RET-POS-SYNC-003: Async commit progress
  const [commitProgress, setCommitProgress] = useState<{ created: number; total: number } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // FIX-016: Mounted ref to prevent state updates after unmount
  const mountedRef = useRef(true);

  // AUDIT-RET-022 / REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001
  const validateFile = (f: File): boolean => {
    if (f.size > MAX_CSV_IMPORT_SIZE_BYTES) {
      setError(`File too large (${(f.size / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_CSV_IMPORT_SIZE_LABEL}.`);
      return false;
    }
    setError('');
    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === 'text/csv' || droppedFile?.name.endsWith('.csv')) {
      if (validateFile(droppedFile)) setFile(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (validateFile(selectedFile)) setFile(selectedFile);
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

  // RET-POS-SYNC-002: Download error report as CSV
  const handleDownloadErrors = async () => {
    if (!jobId) return;
    try {
      const response = await authFetch(
        `/api/v1/retailer-admin/products/import/errors?jobId=${jobId}`,
        accessToken
      );
      if (!response.ok) throw new Error('Failed to download errors');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import_errors_${jobId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download error report');
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
        const data = await safeJson(uploadResp) as any;
        throw new Error(data?.error?.message || 'Upload failed');
      }
      const uploadData = await safeJson(uploadResp) as any;
      const newJobId = uploadData.data.jobId;
      setJobId(newJobId);

      // Step 2: Validate
      const validateResp = await authFetch(
        `/api/v1/retailer-admin/products/import/validate?jobId=${newJobId}`,
        accessToken,
        { method: 'POST' }
      );
      if (!validateResp.ok) {
        const data = await safeJson(validateResp) as any;
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
      const validateData = await safeJson(validateResp) as any;
      setValidation(validateData.data);
      setStep('review');
    } catch (err) {
      // IMPORT-TIMEOUT-NO-UI-FEEDBACK: detect timeout/network errors for specific messaging
      const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.message.toLowerCase().includes('timeout'));
      const isNetwork = err instanceof TypeError && err.message.includes('fetch');
      if (isTimeout) {
        setError('Upload timed out. Your file may be too large or your connection too slow. Please try again.');
      } else if (isNetwork) {
        setError('Network error during upload. Please check your internet connection and try again.');
      } else {
        // GL-CRIT-0102: Preserve detailed error messages
        setError(err instanceof Error ? err.message : 'Import failed. Please ensure your file is a valid CSV/Excel file.');
      }
      setStep('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  // RET-POS-SYNC-003 + FIX-016: Stop polling on unmount + prevent stale state updates
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, []);

  // STBT-184.12: Warn user before closing tab during import
  useEffect(() => {
    if (!isProcessing) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isProcessing]);

  // RET-POS-SYNC-003: Poll commit status
  // STBT-184.11: Max polling timeout (10 minutes) to prevent infinite spinner
  const POLLING_TIMEOUT_MS = 10 * 60 * 1000;
  const startPolling = (pollJobId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    const startedAt = Date.now();
    pollingRef.current = setInterval(async () => {
      // FIX-016: Skip if component unmounted
      if (!mountedRef.current) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        return;
      }
      // STBT-184.11: Timeout guard
      if (Date.now() - startedAt > POLLING_TIMEOUT_MS) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        if (!mountedRef.current) return;
        setError('Import is taking longer than expected. Please check back later or contact support.');
        setIsProcessing(false);
        setStep('review');
        return;
      }
      try {
        const resp = await authFetch(
          `/api/v1/retailer-admin/products/import/status?jobId=${pollJobId}`,
          accessToken
        );
        // FIX-016: Guard after async — component may have unmounted during fetch
        if (!mountedRef.current) return;
        if (!resp.ok) return;
        const data = await safeJson(resp) as any;
        if (!mountedRef.current) return;
        if (!data?.data) return;
        const { status, progress, commitResult: result } = data.data;
        setCommitProgress(progress);

        if (status === 'committed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setCommitResult(result || { created: progress.created, updated: 0, skipped: 0, warnings: [] });
          setIsProcessing(false);
          setStep('done');
        } else if (status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setError('Commit failed on server. Please retry.');
          setIsProcessing(false);
          setStep('review');
        }
      } catch {
        // Polling errors are transient; keep retrying
      }
    }, IMPORT_POLL_INTERVAL_MS);
  };

  // RCAT-CSV-002 + RET-POS-SYNC-003: Commit (async with polling)
  const handleCommit = async () => {
    if (!jobId) return;
    setError('');
    setIsProcessing(true);
    setCommitProgress(null);
    setStep('commit');

    try {
      const resp = await authFetch(
        `/api/v1/retailer-admin/products/import/commit?jobId=${jobId}`,
        accessToken,
        { method: 'POST' }
      );
      const data = await safeJson(resp) as any;

      if (resp.status === 202) {
        // Async commit started — poll for progress
        setCommitProgress(data.data?.progress || { created: 0, total: 0 });
        startPolling(jobId);
        return; // keep isProcessing=true until polling completes
      }

      if (!resp.ok) {
        throw new Error(data.error?.message || 'Commit failed');
      }

      // Synchronous completion (e.g., already committed / idempotent)
      setCommitResult(data.data);
      setStep('done');
      setIsProcessing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed');
      setStep('review');
      setIsProcessing(false);
    }
  };

  const reset = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = null;
    setStep('upload');
    setFile(null);
    setJobId(null);
    setValidation(null);
    setCommitResult(null);
    setCommitProgress(null);
    setError('');
  };

  return (
    <>
      {/* T-112: Breadcrumb navigation */}
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Import' }]} />
      </div>
      <header className="page-header">
        <h1 className="page-title">Import Products (CSV)</h1>
      </header>

      <div className="page-content">
        {/* Progress Steps */}
        <div className="imp-steps">
          {(['upload', 'validate', 'review', 'commit', 'done'] as ImportStep[]).map((s, i) => (
            <div
              key={s}
              className="imp-step"
              style={{
                background: step === s ? 'var(--primary)' : i < ['upload', 'validate', 'review', 'commit', 'done'].indexOf(step) ? 'var(--step-completed-bg)' : 'var(--border)',
                color: step === s || i < ['upload', 'validate', 'review', 'commit', 'done'].indexOf(step) ? 'var(--step-completed-text)' : 'var(--text-muted)',
              }}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="alert-error-inline">
            {error}
          </div>
        )}

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="card">
            <h3 className="card-title">Upload CSV File</h3>

            {/* RCAT-CSV-001: Download Template Button */}
            <div className="imp-template-mb">
              <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
                Download CSV Template
              </button>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              className={`imp-dropzone${isDragging ? ' imp-dropzone--active' : ''}`}
            >
              {file ? (
                <div>
                  <p className="imp-file-name">📄 {file.name}</p>
                  <p className="text-sm-muted">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <button
                    aria-label="Remove selected CSV file"
                    className="btn btn-secondary imp-remove-btn-mt"
                    onClick={() => setFile(null)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <p className="imp-drop-icon">📥</p>
                  <p className="imp-drop-text">Drag & drop your CSV file here</p>
                  <label className="btn btn-secondary">
                    Browse Files
                    <input
                      aria-label="Select CSV file for import"
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      className="imp-file-hidden"
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
            <div className="imp-format-info">
              <h4 className="imp-format-title">Expected CSV Format:</h4>
              <code className="imp-format-code">
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
          <div className="card imp-center-card">
            <div className="imp-step-icon">⏳</div>
            <h3>Validating CSV...</h3>
            <p className="text-muted">Checking rows, formats, and data integrity</p>
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && validation && (
          <div className="card">
            <h3 className="card-title">Review Import</h3>

            <div className="grid grid-3 grid-mb-lg">
              <div className="stat-card">
                <div className="stat-label">Total Rows</div>
                <div className="stat-value">{validation.totalRows}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Valid Rows</div>
                <div className="stat-value stat-value--success">{validation.validCount}</div>
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
              <div className="imp-errors-section">
                <h4 className="imp-errors-title">Validation Errors:</h4>
                <div className="imp-errors-box">
                  {validation.errors.slice(0, 20).map((err, i) => (
                    <p key={i} className="imp-errors-row">Row {err.row}: {err.error}</p>
                  ))}
                  {validation.errors.length > 20 && (
                    <p className="imp-errors-more">...and {validation.errors.length - 20} more</p>
                  )}
                </div>
                {/* RET-POS-SYNC-002: Download error report */}
                {jobId && (
                  <button className="btn btn-secondary imp-download-btn-mt" onClick={handleDownloadErrors}>
                    Download Error Report (CSV)
                  </button>
                )}
              </div>
            )}

            {/* Preview Table */}
            {validation.previewRows.length > 0 && (
              <div className="imp-preview-container">
                <table className="table imp-preview-table">
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
                      <tr key={row.row} style={{ background: row.valid ? undefined : 'var(--row-error-bg)' }}>
                        <td>{row.row}</td>
                        <td>{row.name}</td>
                        <td className="cell-mono">{row.barcode || <em className="text-muted">auto</em>}</td>
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

            <div className="imp-actions">
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
          <div className="card imp-center-card">
            <div className="imp-step-icon">📥</div>
            <h3>Importing Products...</h3>
            {commitProgress && commitProgress.total > 0 ? (
              <>
                <p className="text-muted" style={{ marginBottom: '1rem' }}>
                  Creating products... {commitProgress.created}/{commitProgress.total}
                </p>
                <div className="imp-progress-track">
                  <div className="imp-progress-fill" style={{ width: `${Math.round((commitProgress.created / commitProgress.total) * 100)}%` }} />
                </div>
              </>
            ) : (
              <p className="text-muted">Creating products and updating inventory</p>
            )}
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && commitResult && (
          <div className="card imp-center-card">
            <div className="imp-step-icon">✅</div>
            <h3 className="imp-success-title">Import Complete!</h3>
            <p className="imp-result-text">
              <strong>{commitResult.created}</strong> products imported successfully.
              {commitResult.updated > 0 && (
                <><br /><strong>{commitResult.updated}</strong> existing products updated.</>
              )}
              {commitResult.skipped > 0 && (
                <><br /><strong>{commitResult.skipped}</strong> skipped.</>
              )}
            </p>
            {commitResult.warnings.length > 0 && (
              <div className="imp-warnings">
                {commitResult.warnings.map((w, i) => <p key={i}>{w}</p>)}
                {/* RET-POS-SYNC-002: Download error report */}
                {jobId && (
                  <button className="btn btn-secondary imp-download-btn-mt" onClick={handleDownloadErrors}>
                    Download Error Report (CSV)
                  </button>
                )}
              </div>
            )}
            <div className="imp-actions-center">
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
