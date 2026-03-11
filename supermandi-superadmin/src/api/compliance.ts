// SA-P2-004: Compliance Status Aggregation API client
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

// Types
export interface ComplianceStoreDocs {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
}

export interface ComplianceStore {
  id: string;
  name: string;
  code: string;
  status: string;
  kycStatus: string;
  kycComplete: boolean;
  adminApproved: boolean;
  deviceBound: boolean;
  upiComplete: boolean;
  complianceStatus: 'compliant' | 'non_compliant' | 'pending';
  documents: ComplianceStoreDocs;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceSummary {
  totalStores: number;
  compliantCount: number;
  nonCompliantCount: number;
  pendingCount: number;
}

export interface ComplianceOverviewResponse {
  summary: ComplianceSummary;
  stores: ComplianceStore[];
}

function base(): string {
  return API_BASE || "";
}

export async function fetchComplianceOverview(): Promise<ComplianceOverviewResponse> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/compliance/overview`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 403
        ? "Access denied"
        : "Failed to load compliance overview"
    );
  }
  const json = await res.json();
  const raw = json.data || json;

  return {
    summary: {
      totalStores: raw.summary?.totalStores ?? 0,
      compliantCount: raw.summary?.compliantCount ?? 0,
      nonCompliantCount: raw.summary?.nonCompliantCount ?? 0,
      pendingCount: raw.summary?.pendingCount ?? 0,
    },
    stores: (raw.stores || []).map((s: Record<string, unknown>) => ({
      id: (s.id as string) || "",
      name: (s.name as string) || "",
      code: (s.code as string) || "",
      status: (s.status as string) || "",
      kycStatus: (s.kycStatus as string) || "none",
      kycComplete: !!s.kycComplete,
      adminApproved: !!s.adminApproved,
      deviceBound: !!s.deviceBound,
      upiComplete: !!s.upiComplete,
      complianceStatus: (s.complianceStatus as string) || "pending",
      documents: {
        total: ((s.documents as Record<string, unknown>)?.total as number) || 0,
        approved: ((s.documents as Record<string, unknown>)?.approved as number) || 0,
        pending: ((s.documents as Record<string, unknown>)?.pending as number) || 0,
        rejected: ((s.documents as Record<string, unknown>)?.rejected as number) || 0,
      },
      createdAt: (s.createdAt as string) || "",
      updatedAt: (s.updatedAt as string) || "",
    })),
  };
}
