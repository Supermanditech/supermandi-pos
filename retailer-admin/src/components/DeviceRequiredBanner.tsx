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
    <div className="device-banner">
      <div className="device-banner-content">
        <span className="device-banner-icon">&#9888;</span>
        <div>
          <div className="device-banner-title">
            Activate Your POS
          </div>
          <div className="device-banner-desc">
            Download the SuperMandi POS app and enter your phone number to activate and start billing.
          </div>
        </div>
      </div>

      <div className="device-banner-actions">
        <Link
          to={`/s/${storeCode}/devices`}
          className="device-banner-btn"
        >
          Activate Device
        </Link>

        <button
          onClick={() => setDismissed(true)}
          className="device-banner-dismiss"
          title="Dismiss (will show again on page reload)"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}
