// STG-216: Replaced hardcoded hex colors with CSS variables for dark mode
// RET-WEB-003: Payments Setup Page
// Route: /s/:storeCode/settings/payments
// Allows retailers to configure UPI VPA for receiving payments

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import UpiInput, { validateUpiVpa } from '../components/UpiInput';
// T-112: Breadcrumb navigation
import Breadcrumb from '../components/Breadcrumb';
import { logger } from '../lib/logger';

interface PaymentSettings {
  upiVpa: string;
  bankAccount: string;
  ifscCode: string;
}

export default function PaymentsPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();

  // Form state
  const [settings, setSettings] = useState<PaymentSettings>({
    upiVpa: '',
    bankAccount: '',
    ifscCode: '',
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusTransitioned, setStatusTransitioned] = useState(false);

  // RET-C3-013: Extract loadSettings so retry button can call it
  const fetchSettings = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await authFetch('/api/v1/retailer-admin/settings', accessToken);
      if (response.ok) {
        const data = await safeJson(response);
        setSettings({
          upiVpa: data?.settings?.upiVpa || '',
          bankAccount: data?.settings?.bankAccount || '',
          ifscCode: data?.settings?.ifscCode || '',
        });
      }
    } catch (err) {
      logger.error('Failed to load payment settings:', err);
      setLoadError('Failed to load payment settings.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  // Load current settings on mount
  useEffect(() => {
    fetchSettings();
  }, [accessToken]);

  // Handle UPI VPA change
  const handleUpiChange = useCallback((value: string) => {
    setSettings(prev => ({ ...prev, upiVpa: value }));
    setSaveSuccess(false);
    setSaveError(null);
    setStatusTransitioned(false);
  }, []);

  // Handle bank account change
  const handleBankAccountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings(prev => ({ ...prev, bankAccount: e.target.value }));
    setSaveSuccess(false);
    setSaveError(null);
  }, []);

  // Handle IFSC change
  const handleIfscChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings(prev => ({ ...prev, ifscCode: e.target.value.toUpperCase() }));
    setSaveSuccess(false);
    setSaveError(null);
  }, []);

  // Validate form — RET-C3-014: Add IFSC/bank account validation
  const validateForm = (): boolean => {
    const upiError = validateUpiVpa(settings.upiVpa);
    if (!settings.upiVpa) {
      setSaveError('UPI VPA is required');
      return false;
    }
    if (upiError) {
      setSaveError(upiError);
      return false;
    }
    if (settings.bankAccount && !settings.ifscCode) {
      setSaveError('IFSC code is required when bank account is provided');
      return false;
    }
    if (settings.ifscCode && settings.ifscCode.length !== 11) {
      setSaveError('IFSC code must be exactly 11 characters');
      return false;
    }
    return true;
  };

  // Handle save
  const handleSave = async () => {
    if (!accessToken || !validateForm()) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    setStatusTransitioned(false);

    try {
      // Save UPI via dedicated endpoint (handles status transitions)
      const upiResponse = await authFetch('/api/v1/retailer-admin/settings/upi', accessToken, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upiVpa: settings.upiVpa.trim().toLowerCase() }),
      });

      if (!upiResponse.ok) {
        const data = await safeJson(upiResponse);
        setSaveError(data?.error?.message || 'Failed to save UPI settings');
        setSaving(false);
        return;
      }

      const upiData = await safeJson(upiResponse);

      // T-202: Save bank account fields via PATCH (only if provided)
      if (settings.bankAccount || settings.ifscCode) {
        const bankResponse = await authFetch('/api/v1/retailer-admin/settings', accessToken, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bankAccount: settings.bankAccount.trim() || null,
            ifscCode: settings.ifscCode.trim().toUpperCase() || null,
          }),
        });

        if (!bankResponse.ok) {
          const data = await safeJson(bankResponse);
          const errMsg = data?.error?.errors?.bankAccount || data?.error?.errors?.ifscCode || data?.error?.message || 'Failed to save bank details';
          // RET-C3-012: Warn user that UPI was saved even though bank failed
          setSaveError(`UPI updated successfully, but bank details failed: ${errMsg}`);
          setSaving(false);
          return;
        }
      }

      setSaveSuccess(true);
      setStatusTransitioned(upiData?.statusTransitioned || false);

      setTimeout(() => {
        setSaveSuccess(false);
        setStatusTransitioned(false);
      }, 5000);
    } catch (err: any) {
      logger.error('Failed to save payment settings:', err);
      setSaveError(err.message || 'Failed to save payment settings');
    } finally {
      setSaving(false);
    }
  };

  // STG-483: Auth loading guard
  if (!accessToken) return <div className="text-center-muted">Loading...</div>;

  if (loading) {
    return (
      <div className="pay-container pay-loading">
        <div className="pay-loading-text">Loading payment settings...</div>
      </div>
    );
  }

  return (
    <div className="pay-container">
      {/* T-112: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Settings', path: `/s/${storeCode}/settings` }, { label: 'Payments' }]} />
      {/* Header */}
      <div className="pay-header">
        <h1 className="pay-title">
          Payment Settings
        </h1>
        <p className="pay-subtitle">
          Configure your payment methods to receive payments from customers
        </p>
      </div>

      {/* RET-C3-013: Load Error Banner with retry button */}
      {loadError && (
        <div className="pay-load-error">
          <span>{loadError}</span>
          <button aria-label="Retry loading payment settings" onClick={fetchSettings} className="btn btn-secondary btn-sm">Retry</button>
        </div>
      )}

      {/* Success Message */}
      {saveSuccess && (
        <div className="pay-alert-success">
          <span className="pay-alert-icon" aria-hidden="true">&#10003;</span>
          <div>
            <div className="pay-alert-bold">Payment settings saved successfully!</div>
            {statusTransitioned && (
              <div className="pay-alert-sub">
                Your store status has been updated to PAYMENTS_SUBMITTED.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {saveError && (
        <div className="pay-alert-error">
          <span className="pay-alert-icon" aria-hidden="true">&#10007;</span>
          {saveError}
        </div>
      )}

      {/* Payment Form */}
      <div className="pay-form">
        {/* UPI Settings */}
        <section className="card pay-section">
          <h2 className="pay-section-title">
            <span className="pay-section-icon" aria-hidden="true">&#128179;</span>
            UPI Payment
          </h2>

          {/* REQ.AUDIT.W5.RETAILER.PAYMENTS-PAGE-NO-EMPTY-STATE.001: guidance when UPI not set */}
          {!settings.upiVpa && (
            <p className="pay-section-hint">
              Enter your UPI address to start receiving digital payments from customers.
            </p>
          )}
          <div className="pay-input-wrap">
            <UpiInput
              value={settings.upiVpa}
              onChange={handleUpiChange}
              required={true}
            />
          </div>
        </section>

        {/* Bank Account Settings (Optional) */}
        <section className="card pay-section">
          <h2 className="pay-section-title">
            <span className="pay-section-icon" aria-hidden="true">&#127974;</span>
            Bank Account (Optional)
          </h2>

          <p className="pay-bank-desc">
            Provide bank account details for NEFT/IMPS settlements (optional)
          </p>

          <div className="pay-bank-grid">
            <div>
              <label className="pay-bank-label" htmlFor="pay-bank-account">
                Bank Account Number
              </label>
              <input
                id="pay-bank-account"
                type="text"
                value={settings.bankAccount}
                onChange={handleBankAccountChange}
                placeholder="Enter account number"
                className="pay-bank-input"
              />
            </div>

            <div>
              <label className="pay-bank-label" htmlFor="pay-ifsc-code">
                IFSC Code
              </label>
              <input
                id="pay-ifsc-code"
                type="text"
                value={settings.ifscCode}
                onChange={handleIfscChange}
                placeholder="e.g., SBIN0001234"
                maxLength={11}
                className="pay-bank-input pay-bank-input--upper"
              />
            </div>
          </div>

          <p className="pay-bank-hint">
            Bank details are used for NEFT/IMPS settlement processing.
          </p>
        </section>

        {/* Save Button */}
        <div className="pay-save-area">
          <button
            onClick={handleSave}
            disabled={saving || !settings.upiVpa}
            className="pay-save-btn"
          >
            {saving ? 'Saving...' : 'Save Payment Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
