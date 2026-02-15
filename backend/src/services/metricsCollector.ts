/**
 * In-memory performance metrics collector
 * Tracks request latency, error rates, and throughput per endpoint.
 * Queryable via /admin/quality/metrics endpoint.
 */

interface EndpointMetric {
  path: string;
  method: string;
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
  minMs: number;
  p95Ms: number;
  lastSeen: string;
  latencies: number[]; // circular buffer for p95 calculation
}

interface SystemMetrics {
  startedAt: string;
  uptimeSeconds: number;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  activeConnections: number;
  memoryUsageMB: number;
  cpuUsagePercent: number;
  endpoints: EndpointMetric[];
}

const BUFFER_SIZE = 1000; // Keep last 1000 latencies per endpoint
const metrics = new Map<string, EndpointMetric>();
const startedAt = new Date().toISOString();
let totalRequests = 0;
let totalErrors = 0;
let activeConnections = 0;

function getKey(method: string, path: string): string {
  // Normalize path: replace UUIDs and IDs with :param
  const normalized = path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
  return `${method} ${normalized}`;
}

function calculateP95(latencies: number[]): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

export function recordRequest(method: string, path: string, durationMs: number, isError: boolean): void {
  totalRequests++;
  if (isError) totalErrors++;

  const key = getKey(method, path);
  let metric = metrics.get(key);

  if (!metric) {
    metric = {
      path: key.split(' ')[1],
      method,
      count: 0,
      errorCount: 0,
      totalMs: 0,
      maxMs: 0,
      minMs: Infinity,
      p95Ms: 0,
      lastSeen: new Date().toISOString(),
      latencies: [],
    };
    metrics.set(key, metric);
  }

  metric.count++;
  if (isError) metric.errorCount++;
  metric.totalMs += durationMs;
  metric.maxMs = Math.max(metric.maxMs, durationMs);
  metric.minMs = Math.min(metric.minMs, durationMs);
  metric.lastSeen = new Date().toISOString();

  // Circular buffer for p95
  if (metric.latencies.length >= BUFFER_SIZE) {
    metric.latencies.shift();
  }
  metric.latencies.push(durationMs);
  metric.p95Ms = calculateP95(metric.latencies);
}

export function incrementConnections(): void { activeConnections++; }
export function decrementConnections(): void { activeConnections = Math.max(0, activeConnections - 1); }

export function getMetrics(): SystemMetrics {
  const uptime = (Date.now() - new Date(startedAt).getTime()) / 1000;
  const mem = process.memoryUsage();
  const allLatencies: number[] = [];

  const endpoints = Array.from(metrics.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 50) // Top 50 endpoints
    .map(m => {
      allLatencies.push(...m.latencies);
      return { ...m, latencies: undefined as any }; // Don't send raw buffer
    });

  return {
    startedAt,
    uptimeSeconds: Math.round(uptime),
    totalRequests,
    totalErrors,
    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    avgLatencyMs: totalRequests > 0
      ? Math.round(Array.from(metrics.values()).reduce((sum, m) => sum + m.totalMs, 0) / totalRequests)
      : 0,
    p95LatencyMs: calculateP95(allLatencies),
    activeConnections,
    memoryUsageMB: Math.round(mem.heapUsed / 1024 / 1024),
    cpuUsagePercent: 0, // Populated by Cloud Monitoring
    endpoints,
  };
}

export function resetMetrics(): void {
  metrics.clear();
  totalRequests = 0;
  totalErrors = 0;
}

/**
 * Express middleware that auto-records metrics for every request
 */
export function metricsMiddleware(req: any, res: any, next: any): void {
  incrementConnections();
  const start = Date.now();

  res.on('finish', () => {
    decrementConnections();
    const duration = Date.now() - start;
    const isError = res.statusCode >= 500;
    recordRequest(req.method, req.path, duration, isError);
  });

  next();
}
