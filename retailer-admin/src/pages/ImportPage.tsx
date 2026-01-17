import { useState } from 'react';

type ImportStep = 'upload' | 'validate' | 'review' | 'commit' | 'done';

export default function ImportPage() {
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  const simulateImport = async () => {
    setStep('validate');
    await new Promise(r => setTimeout(r, 1500));
    setStep('review');
  };

  const commitImport = async () => {
    setStep('commit');
    await new Promise(r => setTimeout(r, 2000));
    setStep('done');
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

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="card">
            <h3 className="card-title">Upload CSV File</h3>

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
              <button className="btn btn-primary" onClick={simulateImport}>
                Validate & Continue
              </button>
            )}

            {/* CSV Format */}
            <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--background)', borderRadius: '0.5rem' }}>
              <h4 style={{ marginBottom: '0.75rem' }}>Expected CSV Format:</h4>
              <code style={{ fontSize: '0.75rem', display: 'block', overflow: 'auto' }}>
                barcode,name,description,type,unit,purchase_price,sell_price,mrp,stock,supplier_name,supplier_phone
                <br />
                8901030865432,Parle-G 100g,Glucose biscuits,branded,pcs,8.00,10.00,10.00,100,Parle Distributor,9876543210
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
        {step === 'review' && (
          <div className="card">
            <h3 className="card-title">Review Import</h3>

            <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card">
                <div className="stat-label">Total Rows</div>
                <div className="stat-value">156</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Valid Rows</div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>152</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Errors</div>
                <div className="stat-value" style={{ color: 'var(--danger)' }}>4</div>
              </div>
            </div>

            {/* Sample Errors */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.75rem' }}>Validation Errors:</h4>
              <div style={{ background: '#fee2e2', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                <p>Row 23: sell_price is required</p>
                <p>Row 45: invalid unit "pack" (use pcs, kg, g, l, ml)</p>
                <p>Row 78: barcode already exists</p>
                <p>Row 120: supplier_phone invalid format</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={commitImport}>
                Import 152 Valid Rows
              </button>
              <button className="btn btn-secondary" onClick={() => { setStep('upload'); setFile(null); }}>
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
        {step === 'done' && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h3 style={{ color: 'var(--success)', marginBottom: '0.5rem' }}>Import Complete!</h3>
            <p style={{ marginBottom: '1.5rem' }}>
              <strong>152</strong> products imported successfully.
              <br />
              <strong>12</strong> new suppliers created.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <a href="products" className="btn btn-primary">View Products</a>
              <button className="btn btn-secondary" onClick={() => { setStep('upload'); setFile(null); }}>
                Import More
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
