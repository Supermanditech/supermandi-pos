import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { parseError } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export type DeviceRecord = {
  id: string;
  store_id?: string | null;
  store_name?: string | null;
  active: boolean;
  label?: string | null;
  device_type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  android_version?: string | null;
  app_version?: string | null;
  printing_mode?: string | null;
  scan_lookup_v2_enabled?: boolean | null; // P1-SADM-001: V2 scan lookup toggle
  last_seen_online: string | null;
  last_sync_at: string | null;
  pending_outbox_count: number;
  created_at?: string | null;
  updated_at?: string | null;
};

// ADMIN-PAGINATION-001: Paginated response type
export type PaginatedResponse<T> = { items: T[]; total: number; limit: number; offset: number };

export async function fetchDevices(params?: { storeId?: string; deviceId?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<DeviceRecord>> {
  const url = new URL(`${API_BASE}/api/v1/admin/devices`, window.location.origin);
  if (params?.storeId?.trim()) url.searchParams.set("storeId", params.storeId.trim());
  if (params?.deviceId?.trim()) url.searchParams.set("deviceId", params.deviceId.trim());
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  // R3-API-003: offset=0 is falsy but valid
  if (params?.offset != null) url.searchParams.set("offset", String(params.offset));

  const res = await fetchWithTimeout(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { devices?: DeviceRecord[]; total?: number; limit?: number; offset?: number };
  return {
    items: Array.isArray(data.devices) ? data.devices : [],
    total: data.total ?? 0,
    limit: data.limit ?? 50,
    offset: data.offset ?? 0,
  };
}

export type DevicePatchInput = {
  label?: string;
  deviceType?: string;
  printingMode?: string;
  scanLookupV2Enabled?: boolean; // P1-SADM-001: V2 scan lookup toggle
  active?: boolean;
  resetToken?: boolean;
};

export async function patchDevice(deviceId: string, input: DevicePatchInput): Promise<DeviceRecord> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/${encodeURIComponent(deviceId)}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { device?: DeviceRecord };
  if (!data.device) {
    throw new Error("Device response missing");
  }
  return data.device;
}

// SA-P2-002: Push config to a specific device
export type ConfigPushInput = {
  configKey: string;
  configValue: string;
  message?: string;
};

export type ConfigPushResult = {
  queued: boolean;
  method: "fcm" | "poll";
  pushId?: string;
  createdAt?: string;
};

export type BroadcastConfigResult = {
  queued: boolean;
  method: "fcm" | "poll";
  deviceCount: number;
};

export type ConfigPushRecord = {
  id: string;
  device_id: string | null;
  store_id: string | null;
  config_key: string;
  config_value: string;
  message: string | null;
  method: "fcm" | "poll";
  status: "pending" | "delivered" | "failed";
  delivered_at: string | null;
  created_at: string;
};

export async function pushConfigToDevice(deviceId: string, config: ConfigPushInput): Promise<ConfigPushResult> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/${encodeURIComponent(deviceId)}/push-config`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as ConfigPushResult;
  return {
    queued: Boolean(data.queued),
    method: data.method || "poll",
    pushId: data.pushId,
    createdAt: data.createdAt,
  };
}

export async function broadcastConfig(config: ConfigPushInput): Promise<BroadcastConfigResult> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/broadcast-config`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as BroadcastConfigResult;
  return {
    queued: Boolean(data.queued),
    method: data.method || "poll",
    deviceCount: data.deviceCount ?? 0,
  };
}

export async function fetchConfigPushHistory(params?: { deviceId?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<ConfigPushRecord>> {
  const url = new URL(`${API_BASE}/api/v1/admin/devices/config-push-history`, window.location.origin);
  if (params?.deviceId?.trim()) url.searchParams.set("deviceId", params.deviceId.trim());
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset != null) url.searchParams.set("offset", String(params.offset));

  const res = await fetchWithTimeout(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { pushes?: ConfigPushRecord[]; total?: number; limit?: number; offset?: number };
  return {
    items: Array.isArray(data.pushes) ? data.pushes : [],
    total: data.total ?? 0,
    limit: data.limit ?? 50,
    offset: data.offset ?? 0,
  };
}

// SA-P1-013: Revoke device token (without forcing re-enrollment)
export async function revokeDeviceToken(deviceId: string, reason?: string): Promise<{ success: boolean; revokedAt: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/${encodeURIComponent(deviceId)}/revoke-token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ reason: reason || "" }),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { success?: boolean; revokedAt?: string };
  return {
    success: Boolean(data.success),
    revokedAt: data.revokedAt || new Date().toISOString(),
  };
}

// SA-P2-001: Force device re-enrollment
export async function forceReEnrollDevice(deviceId: string, reason?: string): Promise<{ success: boolean; message: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/${encodeURIComponent(deviceId)}/force-re-enroll`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ reason: reason || "" }),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
  return {
    success: Boolean(data.success),
    message: data.message || "Device has been deregistered.",
  };
}

// SA-P2-005: Force sync a device
export async function forceSyncDevice(deviceId: string, reason?: string): Promise<{ success: boolean; message: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/${encodeURIComponent(deviceId)}/force-sync`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ reason: reason || "" }),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
  return {
    success: Boolean(data.success),
    message: data.message || "Force sync has been queued.",
  };
}

// SA-P2-005: Get device sync status
export type DeviceSyncStatus = {
  device_id: string;
  last_sync_at: string | null;
  last_seen_online: string | null;
  pending_outbox_count: number;
  pending_sync_request: { id: string; reason: string; requested_at: string } | null;
  recent_sync_requests: Array<{
    id: string;
    reason: string;
    status: string;
    requested_at: string | null;
    completed_at: string | null;
  }>;
};

export async function fetchDeviceSyncStatus(deviceId: string): Promise<DeviceSyncStatus> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/${encodeURIComponent(deviceId)}/sync-status`, {
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as DeviceSyncStatus;
  return data;
}

// SA-P2-009: Device Hardware Whitelist
// =============================================================================

export type WhitelistRule = {
  id: string;
  manufacturer?: string | null;
  model?: string | null;
  min_android_version?: string | null;
  notes?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type WhitelistRuleInput = {
  manufacturer?: string;
  model?: string;
  minAndroidVersion?: string;
  notes?: string;
};

export async function fetchWhitelistRules(): Promise<WhitelistRule[]> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/whitelist`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { rules?: WhitelistRule[] };
  return Array.isArray(data.rules) ? data.rules : [];
}

export async function createWhitelistRule(input: WhitelistRuleInput): Promise<WhitelistRule> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/whitelist`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { rule?: WhitelistRule };
  if (!data.rule) throw new Error("Rule response missing");
  return data.rule;
}

export async function deleteWhitelistRule(ruleId: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/whitelist/${encodeURIComponent(ruleId)}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }
}

export async function toggleWhitelistRule(ruleId: string, active: boolean): Promise<WhitelistRule> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/whitelist/${encodeURIComponent(ruleId)}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ active }),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { rule?: WhitelistRule };
  if (!data.rule) throw new Error("Rule response missing");
  return data.rule;
}
