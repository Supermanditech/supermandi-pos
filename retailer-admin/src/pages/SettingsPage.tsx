// STG-220: Replaced hardcoded hex colors with CSS variables for dark mode
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
import { logger } from '../lib/logger';

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
  // SA-P1-003: Due limits
  maxOutstandingDuesRupees: string; // stored as string for input control; empty = no limit
}

interface ValidationErrors {
  upiVpa?: string;
  taxRate?: string;
  phone?: string;
  gstNumber?: string;
  maxOutstandingDuesRupees?: string;
}

export default function SettingsPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  // STG-071: Destructure logout for password change session invalidation
  const { store, accessToken, logout } = useAuth();

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
    // SA-P1-003: Due limits (empty = no limit)
    maxOutstandingDuesRupees: '',
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
          if (!data) throw new Error('Invalid response from server');
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
            // SA-P1-003: Convert paise to rupees for display
            maxOutstandingDuesRupees: s.maxOutstandingDuesPaise != null
              ? String(Math.round(Number(s.maxOutstandingDuesPaise) / 100))
              : '',
          };
          setSettings(loaded);
          initialSettingsRef.current = JSON.stringify(loaded);
        }
      } catch (err) {
        logger.error('Failed to load settings:', err);
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

  // SA-P1-003: Validate due limit
  const validateDueLimit = (value: string): string | undefined => {
    if (!value) return undefined; // Empty = no limit, valid
    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) {
      return 'Due limit must be a positive whole number (in rupees)';
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
      maxOutstandingDuesRupees: validateDueLimit(settings.maxOutstandingDuesRupees),
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
      // SA-P1-003: Convert rupees to paise for backend
      const dueRupees = settings.maxOutstandingDuesRupees.trim();
      const maxOutstandingDuesPaise = dueRupees ? Number(dueRupees) * 100 : null;
      const payload = {
        ...settings,
        receiptSettings: {
          gstin: settings.receiptGstin,
          customFooter: settings.receiptCustomFooter,
          showTaxBreakdown: settings.showTaxBreakdown,
        },
        maxOutstandingDuesPaise,
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
        // STG-070: Extract message from error object instead of rendering [object Object]
        setSaveError(typeof data?.error === 'string' ? data.error : (data?.error?.message || 'Failed to save settings'));
      }
    } catch (err: any) {
      logger.error('Failed to save settings:', err);
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
        // STG-071: Password change invalidates all sessions server-side.
        // Show success message briefly, then log out and redirect to login.
        setPasswordSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          logout();
        }, 2000);
      } else {
        const data = await safeJson(response);
        setPasswordError(data?.error?.message || 'Failed to change password');
      }
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  };

  // STG-483: Auth loading guard
  if (!accessToken) return <div className="text-center-muted">Loading...</div>;

  if (loading) {
    return (
      <div className="set-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-muted">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="set-container">
      {/* T-112: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Settings' }]} />
      {/* Header */}
      <div className="set-header">
        <h1 className="set-title">Store Settings</h1>
        <p className="set-subtitle">Configure your store's payment, tax, and display preferences</p>
      </div>

      {/* Load Error Banner */}
      {loadError && (
        <div className="set-alert-load">{loadError}</div>
      )}

      {/* Success/Error Messages */}
      {saveSuccess && (
        <div className="set-alert-success" role="alert" aria-live="polite">
          <span className="set-alert-icon" aria-hidden="true">✅</span>
          Settings saved successfully!
        </div>
      )}

      {saveError && (
        <div className="set-alert-error" role="alert" aria-live="assertive">
          <span className="set-alert-icon" aria-hidden="true">❌</span>
          {saveError}
        </div>
      )}

      {/* Settings Form */}
      <div className="set-form">
        {/* Payment Settings */}
        <section className="card set-section">
          <h2 className="set-section-title">
            <span className="set-section-icon" aria-hidden="true">💳</span>
            Payment Settings
          </h2>

          <div className="set-grid">
            <div>
              <label className="set-label" htmlFor="set-upi-vpa">UPI VPA (Virtual Payment Address)</label>
              <input
                id="set-upi-vpa"
                type="text"
                className={`form-input set-input${errors.upiVpa ? ' set-input--error' : ''}`}
                value={settings.upiVpa}
                onChange={(e) => handleChange('upiVpa', e.target.value)}
                placeholder="yourstore@upi"
              />
              {errors.upiVpa && (
                <p className="set-error-text">{errors.upiVpa}</p>
              )}
              <p className="set-hint-text">
                This will be used for UPI payments in the POS app
              </p>
            </div>
          </div>
        </section>

        {/* Tax Settings */}
        <section className="card set-section">
          <h2 className="set-section-title">
            <span className="set-section-icon" aria-hidden="true">📊</span>
            Tax Settings
          </h2>

          <div className="set-grid-2">
            <div>
              <label className="set-label" htmlFor="set-tax-rate">GST Rate (%)</label>
              <input
                id="set-tax-rate"
                type="number"
                className={`form-input set-input${errors.taxRate ? ' set-input--error' : ''}`}
                value={settings.taxRate}
                onChange={(e) => handleChange('taxRate', parseFloat(e.target.value) || 0)}
                min="0"
                max="28"
                step="0.5"
              />
              {errors.taxRate && (
                <p className="set-error-text">{errors.taxRate}</p>
              )}
            </div>

            <div>
              <label className="set-label" htmlFor="set-gst-number">GST Number (GSTIN)</label>
              <input
                id="set-gst-number"
                type="text"
                className={`form-input set-input set-input--upper${errors.gstNumber ? ' set-input--error' : ''}`}
                value={settings.gstNumber}
                onChange={(e) => handleChange('gstNumber', e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
              />
              {errors.gstNumber && (
                <p className="set-error-text">{errors.gstNumber}</p>
              )}
            </div>
          </div>
        </section>

        {/* Store Information */}
        <section className="card set-section">
          <h2 className="set-section-title">
            <span className="set-section-icon" aria-hidden="true">🏪</span>
            Store Information
          </h2>

          <div className="set-grid-2">
            <div>
              <label className="set-label" htmlFor="set-store-name">Store Name</label>
              <input
                id="set-store-name"
                type="text"
                className="form-input set-input"
                value={settings.storeName}
                onChange={(e) => handleChange('storeName', e.target.value)}
              />
            </div>

            <div>
              <label className="set-label" htmlFor="set-phone">Phone Number</label>
              <input
                id="set-phone"
                type="tel"
                className={`form-input set-input${errors.phone ? ' set-input--error' : ''}`}
                value={settings.phone}
                onChange={(e) => handleChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                maxLength={10}
              />
              {errors.phone && (
                <p className="set-error-text">{errors.phone}</p>
              )}
            </div>

            <div className="set-full-col">
              <label className="set-label" htmlFor="set-address">Address</label>
              <textarea
                id="set-address"
                className="form-input set-input set-textarea"
                value={settings.address}
                onChange={(e) => handleChange('address', e.target.value)}
                rows={2}
              />
            </div>
          </div>
        </section>

        {/* Operating Hours & Receipt */}
        <section className="card set-section">
          <h2 className="set-section-title">
            <span className="set-section-icon" aria-hidden="true">⚙️</span>
            Preferences
          </h2>

          <div className="set-grid-pref">
            <div>
              <label className="set-label" htmlFor="set-open-time">Opening Time</label>
              <input
                id="set-open-time"
                type="time"
                className="form-input set-input"
                value={settings.operatingHours.open}
                onChange={(e) => handleOperatingHoursChange('open', e.target.value)}
              />
            </div>

            <div>
              <label className="set-label" htmlFor="set-close-time">Closing Time</label>
              <input
                id="set-close-time"
                type="time"
                className="form-input set-input"
                value={settings.operatingHours.close}
                onChange={(e) => handleOperatingHoursChange('close', e.target.value)}
              />
            </div>

            <div className="set-full-col">
              <label className="set-label" htmlFor="set-receipt-footer">Receipt Footer Message</label>
              <textarea
                id="set-receipt-footer"
                className="form-input set-input set-textarea"
                value={settings.receiptFooter}
                onChange={(e) => handleChange('receiptFooter', e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="Thank you for shopping with us!"
              />
              <p className="set-hint-text">
                This message will appear at the bottom of printed receipts ({settings.receiptFooter?.length || 0}/200 characters)
              </p>
            </div>
          </div>
        </section>

        {/* T-156: Receipt Customization */}
        <section className="card set-section">
          <h2 className="set-section-title">
            <span className="set-section-icon" aria-hidden="true">🧾</span>
            Receipt Customization
          </h2>

          <div className="set-grid-2">
            <div>
              <label className="set-label" htmlFor="set-receipt-gstin">Receipt GSTIN</label>
              <input
                id="set-receipt-gstin"
                type="text"
                className="form-input set-input set-input--upper"
                value={settings.receiptGstin}
                onChange={(e) => handleChange('receiptGstin', e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
              />
              <p className="set-hint-text">
                GSTIN printed on customer receipts. Leave blank to hide.
              </p>
            </div>

            <div className="set-checkbox-row">
              <label className="set-checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.showTaxBreakdown}
                  onChange={(e) => handleChange('showTaxBreakdown', e.target.checked)}
                  className="set-checkbox"
                />
                Show Tax Breakdown on Receipt
              </label>
              <p className="set-hint-text" style={{ margin: 0 }}>
                Print CGST/SGST split on each receipt
              </p>
            </div>

            <div className="set-full-col">
              <label className="set-label" htmlFor="set-custom-footer">Custom Receipt Footer</label>
              <textarea
                id="set-custom-footer"
                className="form-input set-input set-textarea"
                value={settings.receiptCustomFooter}
                onChange={(e) => handleChange('receiptCustomFooter', e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="e.g. Exchange within 7 days with receipt. No refunds on perishables."
              />
              <p className="set-hint-text">
                Additional text printed below the standard footer ({settings.receiptCustomFooter?.length || 0}/300 characters)
              </p>
            </div>
          </div>
        </section>

        {/* SA-P1-003: Due Limits */}
        <section className="card set-section">
          <h2 className="set-section-title">
            <span className="set-section-icon" aria-hidden="true">&#8377;</span>
            Due Limits
          </h2>

          <div className="set-grid">
            <div>
              <label className="set-label" htmlFor="set-due-limit">Maximum Outstanding Dues (Rupees)</label>
              <input
                id="set-due-limit"
                type="number"
                className={`form-input set-input${errors.maxOutstandingDuesRupees ? ' set-input--error' : ''}`}
                value={settings.maxOutstandingDuesRupees}
                onChange={(e) => handleChange('maxOutstandingDuesRupees', e.target.value)}
                placeholder="No limit"
                min="0"
                step="1"
              />
              {errors.maxOutstandingDuesRupees && (
                <p className="set-error-text">{errors.maxOutstandingDuesRupees}</p>
              )}
              <p className="set-hint-text">
                Maximum total unpaid dues allowed at any time. Leave empty for no limit.
                New due sales will be blocked when this limit is reached.
              </p>
            </div>
          </div>
        </section>

        {/* T-004: Change Password */}
        <section className="card set-section">
          <h2 className="set-section-title">
            <span className="set-section-icon" aria-hidden="true">🔒</span>
            Change Password
          </h2>

          {passwordSuccess && (
            <div className="set-pw-success" role="alert" aria-live="polite">Password changed successfully!</div>
          )}

          {passwordError && (
            <div className="set-pw-error" role="alert" aria-live="assertive">{passwordError}</div>
          )}

          <div className="set-password-grid">
            <div>
              <label className="set-label" htmlFor="set-current-password">Current Password</label>
              <input
                id="set-current-password"
                type="password"
                className="form-input set-input"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(null); }}
                placeholder="Enter current password"
              />
            </div>
            <div>
              <label className="set-label" htmlFor="set-new-password">New Password</label>
              <input
                id="set-new-password"
                type="password"
                className="form-input set-input"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                placeholder="Min 8 chars, 1 upper, 1 lower, 1 number"
              />
            </div>
            <div>
              <label className="set-label" htmlFor="set-confirm-password">Confirm New Password</label>
              <input
                id="set-confirm-password"
                type="password"
                className="form-input set-input"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }}
                placeholder="Re-enter new password"
              />
            </div>
            <div>
              <button
                onClick={handleChangePassword}
                disabled={passwordSaving}
                className="set-password-btn"
              >
                {passwordSaving ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="set-save-wrap">
          <button
            onClick={handleSave}
            disabled={saving}
            className="set-save-btn"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
