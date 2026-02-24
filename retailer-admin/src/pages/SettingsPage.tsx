// GL-RJ-005: Store Settings Page
// Allows retailers to configure UPI VPA, tax rates, and store preferences

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
// T-112: Breadcrumb navigation
import Breadcrumb from '../components/Breadcrumb';
// RET-005: Import shared UPI validation (single source of truth)
import { validateUpiVpa } from '../components/UpiInput';
import { useUnsavedChanges } from '../hooks/useNavigationSafety';

interface StoreSettings {
  upiVpa: string;
  taxRate: number;
  storeName: string;
  operatingHours: { open: string; close: string };
  receiptFooter: string;
  gstNumber: string;
  address: string;
  phone: string;
  // T-156: Receipt customization settings
  receiptGstin: string;
  receiptCustomFooter: string;
  showTaxBreakdown: boolean;
}

interface ValidationErrors {
  upiVpa?: string;
  taxRate?: string;
  phone?: string;
  gstNumber?: string;
}

export default function SettingsPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { store, accessToken } = useAuth();

  // Form state
  const [settings, setSettings] = useState<StoreSettings>({
    upiVpa: '',
    taxRate: 18,
    storeName: '',
    operatingHours: { open: '09:00', close: '21:00' },
    receiptFooter: 'Thank you for shopping with us!',
    gstNumber: '',
    address: '',
    phone: '',
    // T-156: Receipt customization defaults
    receiptGstin: '',
    receiptCustomFooter: '',
    showTaxBreakdown: false,
  });

  // Track loaded settings for dirty detection
  const initialSettingsRef = useRef<string>('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});

  // T-004: Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Dirty detection: settings changed from loaded state or password fields have content
  const isDirty = useMemo(() => {
    const settingsChanged = initialSettingsRef.current !== '' &&
      JSON.stringify(settings) !== initialSettingsRef.current;
    const passwordStarted = currentPassword !== '' || newPassword !== '' || confirmPassword !== '';
    return settingsChanged || passwordStarted;
  }, [settings, currentPassword, newPassword, confirmPassword]);

  useUnsavedChanges(isDirty);

  // Load settings on mount
  useEffect(() => {
    if (!accessToken) return;

    const loadSettings = async () => {
      setLoading(true);
      try {
        const response = await authFetch('/api/v1/retailer-admin/settings', accessToken);
        if (response.ok) {
          const data = await safeJson(response);
          // RET-C5-001: Backend returns { success, settings: { ... } } — unwrap envelope
          const s = data.settings || data || {};
          // T-156: Extract receipt settings from nested JSONB or top-level
          const rs = s.receiptSettings || s.receipt_settings || {};
          const loaded: StoreSettings = {
            upiVpa: s.upiVpa || '',
            taxRate: s.taxRate ?? 18,
            storeName: s.storeName || store?.name || '',
            operatingHours: s.operatingHours || { open: '09:00', close: '21:00' },
            receiptFooter: s.receiptFooter || 'Thank you for shopping with us!',
            gstNumber: s.gstNumber || '',
            address: s.address || '',
            phone: s.phone || '',
            // T-156: Receipt customization
            receiptGstin: rs.gstin || '',
            receiptCustomFooter: rs.customFooter || '',
            showTaxBreakdown: rs.showTaxBreakdown ?? false,
          };
          setSettings(loaded);
          initialSettingsRef.current = JSON.stringify(loaded);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
        setLoadError('Failed to load settings. Some fields may show defaults.');
        // Use store defaults
        setSettings(prev => ({
          ...prev,
          storeName: store?.name || '',
        }));
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [accessToken, store?.name]);

  // RET-005: validateUpiVpa imported from UpiInput (single source of truth)

  // Validate tax rate
  const validateTaxRate = (rate: number): string | undefined => {
    if (rate < 0 || rate > 28) {
      return 'Tax rate must be between 0% and 28%';
    }
    return undefined;
  };

  // Validate phone
  const validatePhone = (phone: string): string | undefined => {
    if (!phone) return undefined; // Optional
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
      return 'Invalid phone number (10 digits starting with 6-9)';
    }
    return undefined;
  };

  // Validate GST number
  const validateGst = (gst: string): string | undefined => {
    if (!gst) return undefined; // Optional
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstRegex.test(gst)) {
      return 'Invalid GST number format';
    }
    return undefined;
  };

  // Handle field changes
  const handleChange = useCallback((field: keyof StoreSettings, value: string | number | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
    setSaveError(null);

    // Clear errors for this field
    setErrors(prev => ({ ...prev, [field]: undefined }));
  }, []);

  // Handle operating hours change
  const handleOperatingHoursChange = useCallback((type: 'open' | 'close', value: string) => {
    setSettings(prev => ({
      ...prev,
      operatingHours: { ...prev.operatingHours, [type]: value },
    }));
    setSaveSuccess(false);
    setSaveError(null);
  }, []);

  // Validate all fields
  const validateAll = (): boolean => {
    const newErrors: ValidationErrors = {
      upiVpa: validateUpiVpa(settings.upiVpa),
      taxRate: validateTaxRate(settings.taxRate),
      phone: validatePhone(settings.phone),
      gstNumber: validateGst(settings.gstNumber),
    };

    setErrors(newErrors);
    return !Object.values(newErrors).some(Boolean);
  };

  // Handle save
  const handleSave = async () => {
    if (!accessToken || !validateAll()) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // T-156: Include receiptSettings JSONB in the save payload
      const payload = {
        ...settings,
        receiptSettings: {
          gstin: settings.receiptGstin,
          customFooter: settings.receiptCustomFooter,
          showTaxBreakdown: settings.showTaxBreakdown,
        },
      };
      // R6.RET.007: Removed redundant Content-Type header — authFetch sets it automatically
      const response = await authFetch('/api/v1/retailer-admin/settings', accessToken, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSaveSuccess(true);
        initialSettingsRef.current = JSON.stringify(settings);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = await safeJson(response);
        setSaveError(data.error || 'Failed to save settings');
      }
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      setSaveError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // T-004: Change Password handler
  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!currentPassword) {
      setPasswordError('Please enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      setPasswordError('Password must contain at least one uppercase letter, one lowercase letter, and one number');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await authFetch('/api/v1/retailer-admin/auth/change-password', accessToken!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (response.ok) {
        setPasswordSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordSuccess(false), 3000);
      } else {
        const data = await safeJson(response);
        setPasswordError(data.error?.message || 'Failed to change password');
      }
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setPasswordSaving(false);
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
        <div style={{ color: '#64748b', fontSize: '1rem' }}>Loading settings...</div>
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
      <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Settings' }]} />
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          margin: '0 0 0.5rem',
          fontSize: '1.75rem',
          fontWeight: '700',
          color: '#1e293b',
        }}>
          Store Settings
        </h1>
        <p style={{
          margin: 0,
          fontSize: '0.95rem',
          color: '#64748b',
        }}>
          Configure your store's payment, tax, and display preferences
        </p>
      </div>

      {/* Load Error Banner */}
      {loadError && (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', color: '#991b1b', fontSize: '0.9rem' }}>
          {loadError}
        </div>
      )}

      {/* Success/Error Messages */}
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
          <span style={{ fontSize: '1.25rem' }}>✅</span>
          Settings saved successfully!
        </div>
      )}

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
          <span style={{ fontSize: '1.25rem' }}>❌</span>
          {saveError}
        </div>
      )}

      {/* Settings Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Payment Settings */}
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
            <span style={{ fontSize: '1.2rem' }}>💳</span>
            Payment Settings
          </h2>

          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                UPI VPA (Virtual Payment Address)
              </label>
              <input
                type="text"
                value={settings.upiVpa}
                onChange={(e) => handleChange('upiVpa', e.target.value)}
                placeholder="yourstore@upi"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: `1px solid ${errors.upiVpa ? '#ef4444' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.currentTarget.style.borderColor = errors.upiVpa ? '#ef4444' : '#e2e8f0'}
              />
              {errors.upiVpa && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#ef4444' }}>
                  {errors.upiVpa}
                </p>
              )}
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                This will be used for UPI payments in the POS app
              </p>
            </div>
          </div>
        </section>

        {/* Tax Settings */}
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
            <span style={{ fontSize: '1.2rem' }}>📊</span>
            Tax Settings
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                GST Rate (%)
              </label>
              <input
                type="number"
                value={settings.taxRate}
                onChange={(e) => handleChange('taxRate', parseFloat(e.target.value) || 0)}
                min="0"
                max="28"
                step="0.5"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: `1px solid ${errors.taxRate ? '#ef4444' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {errors.taxRate && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#ef4444' }}>
                  {errors.taxRate}
                </p>
              )}
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                GST Number (GSTIN)
              </label>
              <input
                type="text"
                value={settings.gstNumber}
                onChange={(e) => handleChange('gstNumber', e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: `1px solid ${errors.gstNumber ? '#ef4444' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  textTransform: 'uppercase',
                }}
              />
              {errors.gstNumber && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#ef4444' }}>
                  {errors.gstNumber}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Store Information */}
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
            <span style={{ fontSize: '1.2rem' }}>🏪</span>
            Store Information
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                Store Name
              </label>
              <input
                type="text"
                value={settings.storeName}
                onChange={(e) => handleChange('storeName', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
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
                Phone Number
              </label>
              <input
                type="tel"
                value={settings.phone}
                onChange={(e) => handleChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                maxLength={10}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: `1px solid ${errors.phone ? '#ef4444' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {errors.phone && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#ef4444' }}>
                  {errors.phone}
                </p>
              )}
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                Address
              </label>
              <textarea
                value={settings.address}
                onChange={(e) => handleChange('address', e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>
        </section>

        {/* Operating Hours & Receipt */}
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
            <span style={{ fontSize: '1.2rem' }}>⚙️</span>
            Preferences
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                Opening Time
              </label>
              <input
                type="time"
                value={settings.operatingHours.open}
                onChange={(e) => handleOperatingHoursChange('open', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
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
                Closing Time
              </label>
              <input
                type="time"
                value={settings.operatingHours.close}
                onChange={(e) => handleOperatingHoursChange('close', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                Receipt Footer Message
              </label>
              <textarea
                value={settings.receiptFooter}
                onChange={(e) => handleChange('receiptFooter', e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="Thank you for shopping with us!"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                This message will appear at the bottom of printed receipts ({settings.receiptFooter?.length || 0}/200 characters)
              </p>
            </div>
          </div>
        </section>

        {/* T-156: Receipt Customization */}
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
            <span style={{ fontSize: '1.2rem' }}>🧾</span>
            Receipt Customization
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                Receipt GSTIN
              </label>
              <input
                type="text"
                value={settings.receiptGstin}
                onChange={(e) => handleChange('receiptGstin', e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
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
              />
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                GSTIN printed on customer receipts. Leave blank to hide.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1.5rem' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={settings.showTaxBreakdown}
                  onChange={(e) => handleChange('showTaxBreakdown', e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#3b82f6', cursor: 'pointer' }}
                />
                Show Tax Breakdown on Receipt
              </label>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                Print CGST/SGST split on each receipt
              </p>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                Custom Receipt Footer
              </label>
              <textarea
                value={settings.receiptCustomFooter}
                onChange={(e) => handleChange('receiptCustomFooter', e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="e.g. Exchange within 7 days with receipt. No refunds on perishables."
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                Additional text printed below the standard footer ({settings.receiptCustomFooter?.length || 0}/300 characters)
              </p>
            </div>
          </div>
        </section>

        {/* T-004: Change Password */}
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
            <span style={{ fontSize: '1.2rem' }}>🔒</span>
            Change Password
          </h2>

          {passwordSuccess && (
            <div style={{
              padding: '0.75rem 1rem',
              background: '#dcfce7',
              borderRadius: '8px',
              border: '1px solid #22c55e',
              color: '#166534',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}>
              Password changed successfully!
            </div>
          )}

          {passwordError && (
            <div style={{
              padding: '0.75rem 1rem',
              background: '#fee2e2',
              borderRadius: '8px',
              border: '1px solid #ef4444',
              color: '#dc2626',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}>
              {passwordError}
            </div>
          )}

          <div style={{ display: 'grid', gap: '1rem', maxWidth: '400px' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: '#475569',
                marginBottom: '0.5rem',
              }}>
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(null); }}
                placeholder="Enter current password"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
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
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                placeholder="Min 8 chars, 1 upper, 1 lower, 1 number"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
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
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }}
                placeholder="Re-enter new password"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <button
                onClick={handleChangePassword}
                disabled={passwordSaving}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: passwordSaving ? '#94a3b8' : '#1e293b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: passwordSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {passwordSaving ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '0.875rem 2rem',
              background: saving ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: saving ? 'not-allowed' : 'pointer',
              boxShadow: saving ? 'none' : '0 4px 14px rgba(59, 130, 246, 0.35)',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              if (!saving) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (!saving) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(59, 130, 246, 0.35)';
              }
            }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
