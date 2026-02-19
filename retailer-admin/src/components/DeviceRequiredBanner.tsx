// FLOW-001: Device Required Banner
// Shows warning when store is in DRAFT status or has no devices bound
// Persistent banner at top of dashboard until device is activated

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';

interface DeviceRequiredBannerProps {
  onStatusLoaded?: (hasBoundDevices: boolean) => void;
}

export default function DeviceRequiredBanner({ onStatusLoaded }: DeviceRequiredBannerProps) {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [hasDevices, setHasDevices] = useState(true); // Assume has devices until proven otherwise
  const [dismissed, setDismissed] = useState(false);

  // Check if devices are bound to this store
  useEffect(() => {
    if (!accessToken) return;

    const checkDevices = async () => {
      setLoading(true);
      try {
        const response = await authFetch('/api/v1/retailer-admin/devices', accessToken);
        if (response.ok) {
          // AUDIT-RET-041: Use safeJson instead of bare response.json()
          const data = await safeJson(response) as Record<string, unknown[]>;
          const devices = data.devices || [];
          const hasBoundDevices = devices.length > 0;
          setHasDevices(hasBoundDevices);
          onStatusLoaded?.(hasBoundDevices);
        }
      } catch (err) {
        console.error('Failed to check device status:', err);
        // On error, don't show banner to avoid false positives
        setHasDevices(true);
      } finally {
        setLoading(false);
      }
    };

    checkDevices();
  }, [accessToken, onStatusLoaded]);

  // Don't show anything while loading
  if (loading) return null;

  // Don't show if devices are bound
  if (hasDevices) return null;

  // Don't show if dismissed (temporary, until page refresh)
  if (dismissed) return null;

  return (
    <div style={{
      padding: '1rem 1.5rem',
      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
      borderBottom: '1px solid #f59e0b',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      flexWrap: 'wrap',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}>
        <span style={{ fontSize: '1.5rem' }}>&#9888;</span>
        <div>
          <div style={{
            fontWeight: '600',
            color: '#92400e',
            fontSize: '0.95rem',
          }}>
            Activate Your POS
          </div>
          <div style={{
            color: '#a16207',
            fontSize: '0.85rem',
            marginTop: '0.25rem',
          }}>
            Download the SuperMandi POS app and enter your activation code to start billing.
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}>
        <Link
          to={`/s/${storeCode}/devices`}
          style={{
            padding: '0.5rem 1rem',
            background: '#f59e0b',
            color: 'white',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '500',
            fontSize: '0.9rem',
            boxShadow: '0 2px 4px rgba(245, 158, 11, 0.3)',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = '#d97706';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = '#f59e0b';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Activate Device
        </Link>

        <button
          onClick={() => setDismissed(true)}
          style={{
            padding: '0.5rem',
            background: 'transparent',
            border: 'none',
            color: '#92400e',
            cursor: 'pointer',
            fontSize: '1.2rem',
            lineHeight: 1,
            opacity: 0.6,
            transition: 'opacity 0.2s',
          }}
          onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
          onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
          title="Dismiss (will show again on page reload)"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}
