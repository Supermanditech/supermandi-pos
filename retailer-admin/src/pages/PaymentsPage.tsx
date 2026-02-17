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

  // Load current settings on mount
  useEffect(() => {
    if (!accessToken) return;

    const loadSettings = async () => {
      setLoading(true);
      try {
        const response = await authFetch('/api/v1/retailer-admin/settings', accessToken);
        if (response.ok) {
          const data = await safeJson(response);
          setSettings({
            upiVpa: data.settings?.upiVpa || '',
            bankAccount: data.settings?.bankAccount || '',
            ifscCode: data.settings?.ifscCode || '',
          });
        }
      } catch (err) {
        console.error('Failed to load payment settings:', err);
        setLoadError('Failed to load payment settings. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
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

  // Validate form
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
        setSaveError(data.error?.message || 'Failed to save UPI settings');
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
          const errMsg = data.error?.errors?.bankAccount || data.error?.errors?.ifscCode || data.error?.message || 'Failed to save bank details';
          setSaveError(errMsg);
          setSaving(false);
          return;
        }
      }

      setSaveSuccess(true);
      setStatusTransitioned(upiData.statusTransitioned || false);

      setTimeout(() => {
        setSaveSuccess(false);
        setStatusTransitioned(false);
      }, 5000);
    } catch (err: any) {
      console.error('Failed to save payment settings:', err);
      setSaveError(err.message || 'Failed to save payment settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100%',
        background: 'linear-gradient(180deg, #f0f9ff 0%, #f8fafc 100%)',
        padding: '2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ color: '#64748b', fontSize: '1rem' }}>Loading payment settings...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100%',
      background: 'linear-gradient(180deg, #f0f9ff 0%, #f8fafc 100%)',
      padding: '2rem',
    }}>
      {/* T-112: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Settings', path: `/s/${storeCode}/settings` }, { label: 'Payments' }]} />
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          margin: '0 0 0.5rem',
          fontSize: '1.75rem',
          fontWeight: '700',
          color: '#1e293b',
        }}>
          Payment Settings
        </h1>
        <p style={{
          margin: 0,
          fontSize: '0.95rem',
          color: '#64748b',
        }}>
          Configure your payment methods to receive payments from customers
        </p>
      </div>

      {/* Load Error Banner */}
      {loadError && (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', color: '#991b1b', fontSize: '0.9rem' }}>
          {loadError}
        </div>
      )}

      {/* Success Message */}
      {saveSuccess && (
        <div style={{
          padding: '1rem 1.25rem',
          background: '#dcfce7',
          borderRadius: '10px',
          border: '1px solid #22c55e',
          color: '#166534',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.95rem',
        }}>
          <span style={{ fontSize: '1.25rem' }}>&#10003;</span>
          <div>
            <div style={{ fontWeight: '600' }}>Payment settings saved successfully!</div>
            {statusTransitioned && (
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Your store status has been updated to PAYMENTS_SUBMITTED.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {saveError && (
        <div style={{
          padding: '1rem 1.25rem',
          background: '#fee2e2',
          borderRadius: '10px',
          border: '1px solid #ef4444',
          color: '#dc2626',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.95rem',
        }}>
          <span style={{ fontSize: '1.25rem' }}>&#10007;</span>
          {saveError}
        </div>
      )}

      {/* Payment Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* UPI Settings */}
        <section style={{
          background: 'white',
          borderRadius: '16px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          border: '1px solid #e2e8f0',
        }}>
          <h2 style={{
            margin: '0 0 1.25rem',
            fontSize: '1rem',
            fontWeight: '600',
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1.2rem' }}>&#128179;</span>
            UPI Payment
          </h2>

          <div style={{ maxWidth: '400px' }}>
            <UpiInput
              value={settings.upiVpa}
              onChange={handleUpiChange}
              required={true}
            />
          </div>
        </section>

        {/* Bank Account Settings (Optional) */}
        <section style={{
          background: 'white',
          borderRadius: '16px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          border: '1px solid #e2e8f0',
        }}>
          <h2 style={{
            margin: '0 0 1.25rem',
            fontSize: '1rem',
            fontWeight: '600',
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1.2rem' }}>&#127974;</span>
            Bank Account (Optional)
          </h2>

          <p style={{
            margin: '0 0 1rem',
            fontSize: '0.85rem',
            color: '#64748b',
          }}>
            Provide bank account details for NEFT/IMPS settlements (optional)
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                Bank Account Number
              </label>
              <input
                type="text"
                value={settings.bankAccount}
                onChange={handleBankAccountChange}
                placeholder="Enter account number"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                IFSC Code
              </label>
              <input
                type="text"
                value={settings.ifscCode}
                onChange={handleIfscChange}
                placeholder="e.g., SBIN0001234"
                maxLength={11}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  textTransform: 'uppercase',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
              />
            </div>
          </div>

          <p style={{ margin: '1rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
            Bank details are used for NEFT/IMPS settlement processing.
          </p>
        </section>

        {/* Save Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
          <button
            onClick={handleSave}
            disabled={saving || !settings.upiVpa}
            style={{
              padding: '0.875rem 2rem',
              background: saving || !settings.upiVpa ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: saving || !settings.upiVpa ? 'not-allowed' : 'pointer',
              boxShadow: saving || !settings.upiVpa ? 'none' : '0 4px 14px rgba(59, 130, 246, 0.35)',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              if (!saving && settings.upiVpa) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (!saving && settings.upiVpa) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(59, 130, 246, 0.35)';
              }
            }}
          >
            {saving ? 'Saving...' : 'Save Payment Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
