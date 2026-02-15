# GCP Observability Integration

This document describes the GCP-native observability tools integrated into the SuperMandi backend for production monitoring and debugging.

## Overview

The backend integrates with three GCP observability services:

1. **Cloud Trace** - Request tracing and performance monitoring
2. **Cloud Error Reporting** - Automatic error grouping and alerting
3. **Metrics Collector** - In-memory performance metrics for the Quality Dashboard

## Architecture

### 1. Cloud Trace Integration

**File**: `backend/src/middleware/tracing.ts`

Automatically extracts trace context from Cloud Run's `X-Cloud-Trace-Context` header and makes it available throughout the request lifecycle.

**Features**:
- Parses GCP trace headers (format: `TRACE_ID/SPAN_ID;o=TRACE_TRUE`)
- Attaches trace context to `req.traceContext` for downstream use
- Adds `X-Trace-Id` response header for client-side correlation
- Logs slow requests (>1000ms) with trace ID for debugging

**Usage**:
```typescript
// Access trace context in route handlers
app.get('/api/v1/some-route', (req, res) => {
  const trace = (req as any).traceContext;
  if (trace) {
    console.log(`Processing request with trace ID: ${trace.traceId}`);
  }
});
```

**GCP Console**:
- View traces: Cloud Console → Trace → Trace List
- Filter by trace ID to see full request path across services
- Analyze latency breakdown by service/function

### 2. Error Reporting Integration

**File**: `backend/src/services/errorReporter.ts`

Formats errors for GCP Error Reporting, which automatically groups similar errors and sends alerts.

**Features**:
- Formats errors in GCP Error Reporting's expected JSON schema
- Includes HTTP context (method, URL, status code, user agent)
- Correlates errors with Cloud Trace via `traceId`
- Writes to stderr, which Cloud Run forwards to Cloud Logging

**Usage**:
```typescript
import { reportError } from '../services/errorReporter';

// Manual error reporting
try {
  await riskyOperation();
} catch (error) {
  reportError(error as Error, {
    httpRequest: {
      method: req.method,
      url: req.originalUrl,
      responseStatusCode: 500,
    },
    user: req.user?.id,
    traceId: req.traceContext?.traceId,
  });
  throw error;
}
```

**Automatic Reporting**:
The `errorReportingMiddleware` is registered in `app.ts` and automatically reports all uncaught errors in Express routes.

**GCP Console**:
- View errors: Cloud Console → Error Reporting
- Errors are grouped by stack trace similarity
- Set up alerting policies to notify on new error types

### 3. Metrics Collector

**File**: `backend/src/services/metricsCollector.ts`

In-memory performance metrics collector that tracks request latency, error rates, and throughput per endpoint.

**Features**:
- Records request count, latency (min/max/avg/p95), and error count per endpoint
- Normalizes paths (replaces IDs with `:id` parameter)
- Circular buffer (1000 samples per endpoint) for p95 calculation
- Tracks active connections and memory usage
- Queryable via `/admin/quality/metrics` endpoint

**Metrics Tracked**:
- Total requests/errors
- Error rate (%)
- Average latency (ms)
- p95 latency (ms)
- Active connections
- Memory usage (MB)
- Per-endpoint stats (top 50 by traffic)

**Usage**:
```typescript
import { recordRequest, getMetrics } from '../services/metricsCollector';

// Manual recording (middleware does this automatically)
recordRequest('POST', '/api/v1/pos/sales', 125, false);

// Retrieve current metrics
const metrics = getMetrics();
console.log(`Total requests: ${metrics.totalRequests}`);
console.log(`Error rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
console.log(`p95 latency: ${metrics.p95LatencyMs}ms`);
```

**Automatic Collection**:
The `metricsMiddleware` is registered in `app.ts` and automatically records metrics for every request.

## Quality Dashboard API

**File**: `backend/src/routes/v1/admin/qualityDashboard.ts`

Provides aggregated system health, test results, and GCP monitoring status for the SuperAdmin Quality Dashboard.

### Endpoints

#### GET /api/v1/admin/quality/overview
Main dashboard data including:
- System metrics (uptime, memory, request stats)
- Database health (status, latency, active connections, migration count)
- Service health (all 6 services)
- Test tool status (Vitest, Jest, Playwright, Maestro, k6, contract tests, security scans)
- GCP monitoring status (alert policies, uptime checks, enabled services)
- Top 20 endpoints by traffic
- CI/CD gate summary (178 gates across 14 categories)

**Auth**: Requires `X-Admin-Token` header

**Example Response**:
```json
{
  "timestamp": "2026-02-16T12:00:00.000Z",
  "system": {
    "uptime": 3600,
    "memoryMB": 128,
    "totalRequests": 10000,
    "totalErrors": 5,
    "errorRate": "0.05%",
    "avgLatencyMs": 45,
    "p95LatencyMs": 120,
    "activeConnections": 3
  },
  "database": {
    "status": "healthy",
    "latencyMs": 12,
    "activeConnections": 5,
    "migrations": 150,
    "latestMigration": "150_add_quality_dashboard.sql",
    "tableStats": {
      "stores": 50,
      "users": 200,
      "products": 5000,
      "orders": 10000
    }
  },
  "services": [...],
  "tools": {...},
  "gcp": {...},
  "topEndpoints": [...],
  "gates": {...}
}
```

#### GET /api/v1/admin/quality/metrics
Raw performance metrics from the metrics collector.

**Auth**: Requires `X-Admin-Token` header

#### POST /api/v1/admin/quality/metrics/reset
Reset all metrics counters (admin action, for testing).

**Auth**: Requires `X-Admin-Token` header

#### GET /api/v1/admin/quality/test-results
Latest test run results (currently mock data, will integrate with GitHub Actions API).

**Auth**: Requires `X-Admin-Token` header

## Integration Points

### Express Middleware Chain (app.ts)

```typescript
app.use(cors(corsOptions));
app.use(correlationIdMiddleware);      // T-210: Correlation IDs
app.use(tracingMiddleware);            // T-223: Cloud Trace
app.use(metricsMiddleware);            // T-223: Metrics collection
app.use(perEndpointBodyLimit());       // Body size limits
app.use(express.json({ limit: "1mb" }));
app.use("/api", noCacheHeaders, apiRouter);
app.use(notFoundHandler);
app.use(errorReportingMiddleware);     // T-223: Error Reporting
app.use(errorHandler);
```

**Order matters**:
1. CORS and correlation ID first
2. Tracing extracts Cloud Run headers
3. Metrics starts timing before route processing
4. Routes execute
5. Error reporting catches errors before final error handler

### Routes Registration (routes/v1/index.ts)

```typescript
import { qualityDashboardRouter } from "./admin/qualityDashboard";
v1Router.use("/admin/quality", qualityDashboardRouter);
```

## Testing

**File**: `backend/tests/observability.unit.test.ts`

Unit tests cover:
- Trace header parsing (valid and missing headers)
- Error formatting for GCP Error Reporting
- Metrics collection (request tracking, error counts, path normalization, p95 calculation)
- Middleware integration

**Run tests**:
```bash
cd backend
pnpm test observability.unit.test.ts
```

## GCP Console Setup

### Cloud Trace
1. Navigate to Cloud Console → Trace
2. Select your project (`supermandi-backend`)
3. View trace list filtered by:
   - Service name: `main-backend`, `api-gateway`
   - Time range
   - Latency threshold

### Cloud Error Reporting
1. Navigate to Cloud Console → Error Reporting
2. Errors automatically appear when logged to stderr
3. Set up notification channels (email, Slack, PagerDuty)
4. Create alert policies for:
   - New error types
   - Error spike (>10 errors/minute)
   - Critical error patterns

### Cloud Monitoring (Future)
The Quality Dashboard will eventually integrate with Cloud Monitoring API to fetch:
- Alert policy status
- Uptime check results
- Service SLOs
- Real-time error rates
- Resource utilization (CPU, memory, disk)

## Performance Impact

- **Tracing middleware**: <1ms overhead per request
- **Metrics middleware**: <2ms overhead per request
- **Error reporting**: Only on error path, no impact on happy path
- **Memory usage**: ~5KB per unique endpoint (max 50 tracked)

## Maintenance

### Metrics Reset
Metrics are in-memory and reset on container restart. For long-running services, use the admin reset endpoint:

```bash
curl -X POST https://api.supermandi.com/api/v1/admin/quality/metrics/reset \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

### Trace Sampling
Cloud Run automatically sets trace sampling via the `o=` flag in the trace header. Current default: 10% sampling.

To increase sampling rate (not recommended for production):
```bash
gcloud run services update main-backend \
  --set-env-vars="TRACE_SAMPLING_RATE=1.0"
```

### Error Alert Tuning
If Error Reporting is too noisy:
1. Add error codes to ignore list (e.g., expected 404s)
2. Adjust alert thresholds
3. Use error grouping to suppress known issues

## Future Enhancements

1. **OpenTelemetry SDK**: Replace custom tracing with full OpenTelemetry instrumentation
2. **Cloud Profiler**: Add continuous CPU/memory profiling
3. **Custom Metrics**: Export metrics to Cloud Monitoring for dashboards/alerting
4. **Distributed Tracing**: Correlate traces across all 6 services (gateway → backend → DB)
5. **SLO Tracking**: Define and monitor Service Level Objectives (e.g., p99 latency <500ms)
6. **GitHub Actions Integration**: Fetch real test results from CI/CD pipelines

## Troubleshooting

### Traces not appearing in GCP
- Verify `X-Cloud-Trace-Context` header is present in Cloud Run requests
- Check Cloud Logging for trace correlation
- Ensure trace sampling is enabled (check `o=` flag in header)

### Errors not reported
- Verify stderr output in Cloud Logging (filter by `severity >= ERROR`)
- Check Error Reporting is enabled for the project
- Ensure service account has `roles/errorreporting.writer` permission

### Metrics API returns empty data
- Metrics are in-memory — resets on container restart
- Check container uptime in Cloud Run console
- Verify requests are hitting the backend (check `/health` endpoint)

## References

- [Cloud Trace Documentation](https://cloud.google.com/trace/docs)
- [Cloud Error Reporting Documentation](https://cloud.google.com/error-reporting/docs)
- [Cloud Monitoring Documentation](https://cloud.google.com/monitoring/docs)
- [OpenTelemetry for Node.js](https://opentelemetry.io/docs/instrumentation/js/)
