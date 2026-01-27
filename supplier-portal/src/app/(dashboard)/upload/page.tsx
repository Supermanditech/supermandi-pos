'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { uploadProductsCsv, CsvUploadResult } from '@/lib/api';

export default function UploadPage() {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<CsvUploadResult | null>(null);

  const uploadMutation = useMutation({
    mutationFn: uploadProductsCsv,
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      if (data.imported > 0) {
        toast.success(`Successfully imported ${data.imported} products!`);
      }
      setSelectedFile(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Upload failed');
    },
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      setSelectedFile(file);
      setResult(null);
    } else {
      toast.error('Please upload a CSV file');
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        setResult(null);
      }
    },
    []
  );

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">CSV Upload</h1>
        <p className="text-slate-500 mt-1">
          Bulk import products from a CSV file. Download the template to get started.
        </p>
      </div>

      {/* Template Download */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-3">CSV Template</h2>
        <p className="text-slate-600 text-sm mb-4">
          Download the template and fill in your product data. Required fields
          are marked with *.
        </p>
        <div className="bg-slate-50 rounded-lg p-4 mb-4 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="px-3 py-1 text-left">name*</th>
                <th className="px-3 py-1 text-left">purchase_price*</th>
                <th className="px-3 py-1 text-left">mrp</th>
                <th className="px-3 py-1 text-left">barcode</th>
                <th className="px-3 py-1 text-left">sku</th>
                <th className="px-3 py-1 text-left">category</th>
                <th className="px-3 py-1 text-left">moq</th>
                <th className="px-3 py-1 text-left">unit</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-slate-700">
                <td className="px-3 py-1">Basmati Rice 5kg</td>
                <td className="px-3 py-1">450</td>
                <td className="px-3 py-1">520</td>
                <td className="px-3 py-1">8901234567890</td>
                <td className="px-3 py-1">RICE-BAS-5KG</td>
                <td className="px-3 py-1">Grocery</td>
                <td className="px-3 py-1">10</td>
                <td className="px-3 py-1">PCS</td>
              </tr>
            </tbody>
          </table>
        </div>
        <a
          href="/api/template/products.csv"
          download="products_template.csv"
          className="btn btn-secondary inline-flex items-center gap-2"
          onClick={(e) => {
            e.preventDefault();
            // Generate and download template
            const template =
              'name,purchase_price,mrp,barcode,sku,category,moq,unit\nBasmati Rice 5kg,450,520,8901234567890,RICE-BAS-5KG,Grocery,10,PCS\n';
            const blob = new Blob([template], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'products_template.csv';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <span>📄</span> Download Template
        </a>
      </div>

      {/* Upload Zone */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Upload CSV</h2>

        {!selectedFile && !result && (
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              isDragging
                ? 'border-primary-500 bg-primary-50'
                : 'border-slate-300 hover:border-primary-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="text-4xl mb-4">📁</div>
            <p className="text-slate-600 mb-2">
              Drag and drop your CSV file here, or
            </p>
            <label className="btn btn-primary cursor-pointer">
              Browse Files
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
            <p className="text-sm text-slate-400 mt-4">
              Supported format: CSV (max 10MB)
            </p>
          </div>
        )}

        {selectedFile && !result && (
          <div className="bg-slate-50 rounded-lg p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="text-3xl">📄</div>
              <div className="flex-1">
                <p className="font-medium text-slate-800">{selectedFile.name}</p>
                <p className="text-sm text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                onClick={handleReset}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <button
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
              className="btn btn-primary w-full"
            >
              {uploadMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Uploading...
                </span>
              ) : (
                'Upload & Import'
              )}
            </button>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {result.imported}
                </p>
                <p className="text-sm text-green-700">Imported</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-yellow-600">
                  {result.skipped}
                </p>
                <p className="text-sm text-yellow-700">Skipped</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-slate-600">
                  {result.totalRows}
                </p>
                <p className="text-sm text-slate-500">Total Rows</p>
              </div>
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="bg-red-50 rounded-lg p-4">
                <h3 className="font-medium text-red-800 mb-2">
                  Errors ({result.errors.length})
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {result.errors.map((error, i) => (
                    <p key={i} className="text-sm text-red-600">
                      Row {error.row}: {error.error}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={handleReset} className="btn btn-primary">
                Upload Another File
              </button>
              <a href="/products" className="btn btn-secondary">
                View Products
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Import Instructions</h2>
        <ul className="space-y-2 text-slate-600">
          <li className="flex items-start gap-2">
            <span className="text-green-500">✓</span>
            <span>
              <strong>name</strong> and <strong>purchase_price</strong> are
              required fields
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500">✓</span>
            <span>
              Prices should be in rupees (e.g., 450 for ₹450.00)
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500">✓</span>
            <span>
              Duplicate barcodes will be skipped to prevent duplicates
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500">✓</span>
            <span>
              New products will be in "Pending" status until approved
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500">✓</span>
            <span>
              Valid units: PCS, KG, GM, LTR, ML, PACK, BOX
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
