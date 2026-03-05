// Quality Dashboard API client
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

function base(): string {
  return API_BASE || "";
}

export interface SystemMetrics {
  uptime: number;
  memoryMB: number;
  totalRequests: number;
  totalErrors: number;
  errorRate: string;
  avgLatencyMs: number;
  p95LatencyMs: number;
  activeConnections: number;
}

export interface DatabaseHealth {
  status: string;
  latencyMs: number;
  activeConnections: number;
  migrations: number;
  latestMigration: string;
  tableStats: Record<string, number>;
}

export interface ServiceInfo {
  name: string;
  status: string;
  port: number;
  framework: string;
}

export interface ToolStatus {
  installed: boolean;
  portals?: string[];
  specs?: number;
  flows?: number;
  scripts?: number;
  suites?: number;
  gates?: number;
  baselines?: number;
  status: string;
}

export interface GcpStatus {
  project: string;
  region: string;
  alertPolicies: number;
  uptimeChecks: number;
  errorReporting: string;
  cloudTrace: string;
  cloudProfiler: string;
}

export interface EndpointMetric {
  path: string;
  method: string;
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
  minMs: number;
  p95Ms: number;
  lastSeen: string;
}

export interface GateCategory {
  [key: string]: number;
}

export interface TestSuiteResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
}

export interface CoverageResult {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface QualityOverview {
  timestamp: string;
  system: SystemMetrics;
  database: DatabaseHealth;
  services: ServiceInfo[];
  tools: Record<string, ToolStatus>;
  gcp: GcpStatus;
  topEndpoints: EndpointMetric[];
  gates: { total: number; categories: GateCategory };
}

export interface TestResults {
  lastRun: string;
  suites: Record<string, TestSuiteResult>;
  coverage: Record<string, CoverageResult>;
}

export async function fetchQualityOverview(): Promise<QualityOverview> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/quality/overview`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Quality overview failed: ${res.status}`);
  return res.json();
}

export async function fetchTestResults(): Promise<TestResults> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/quality/test-results`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Test results failed: ${res.status}`);
  return res.json();
}

export async function resetMetrics(): Promise<void> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/quality/metrics/reset`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Metrics reset failed: ${res.status}`);
}
