/**
 * T-223: Observability Integration Tests
 * Verifies GCP Cloud Trace, Error Reporting, and Metrics Collector integration
 */
import { tracingMiddleware, TraceContext } from '../src/middleware/tracing';
import { errorReportingMiddleware, reportError } from '../src/services/errorReporter';
import { metricsMiddleware, getMetrics, resetMetrics, recordRequest } from '../src/services/metricsCollector';

describe('GCP Observability Integration', () => {
  describe('Tracing Middleware', () => {
    it('should parse valid GCP trace header', () => {
      const req: any = {
        headers: {
          'x-cloud-trace-context': '1234567890abcdef1234567890abcdef/12345;o=1',
        },
        path: '/api/v1/pos/scan',
        method: 'POST',
      };
      const res: any = {
        setHeader: jest.fn(),
        on: jest.fn(),
      };
      const next = jest.fn();

      tracingMiddleware(req, res, next);

      expect(req.traceContext).toBeDefined();
      expect(req.traceContext.traceId).toBe('1234567890abcdef1234567890abcdef');
      expect(req.traceContext.spanId).toBe('12345');
      expect(req.traceContext.sampled).toBe(true);
      expect(res.setHeader).toHaveBeenCalledWith('X-Trace-Id', '1234567890abcdef1234567890abcdef');
      expect(next).toHaveBeenCalled();
    });

    it('should handle missing trace header gracefully', () => {
      const req: any = {
        headers: {},
        path: '/health',
        method: 'GET',
      };
      const res: any = {
        setHeader: jest.fn(),
        on: jest.fn(),
      };
      const next = jest.fn();

      tracingMiddleware(req, res, next);

      expect(req.traceContext).toBeNull();
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Error Reporter', () => {
    let stderrSpy: jest.SpyInstance;

    beforeEach(() => {
      stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();
    });

    afterEach(() => {
      stderrSpy.mockRestore();
    });

    it('should format error for GCP Error Reporting', () => {
      const testError = new Error('Test error message');
      reportError(testError, {
        service: 'test-service',
        version: 'v1.0.0',
      });

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      const output = stderrSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed['@type']).toBe('type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent');
      expect(parsed.message).toContain('Test error message');
      expect(parsed.serviceContext.service).toBe('test-service');
      expect(parsed.serviceContext.version).toBe('v1.0.0');
    });

    it('should include HTTP context in error reports', () => {
      const testError = new Error('API error');
      reportError(testError, {
        httpRequest: {
          method: 'POST',
          url: '/api/v1/pos/sales',
          userAgent: 'Mozilla/5.0',
          responseStatusCode: 500,
        },
        user: 'test-user-123',
        traceId: 'trace-abc123',
      });

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.context.httpRequest.method).toBe('POST');
      expect(parsed.context.httpRequest.url).toBe('/api/v1/pos/sales');
      expect(parsed.context.user).toBe('test-user-123');
    });
  });

  describe('Metrics Collector', () => {
    beforeEach(() => {
      resetMetrics();
    });

    it('should record request metrics', () => {
      recordRequest('GET', '/api/v1/pos/inventory', 125, false);
      recordRequest('POST', '/api/v1/pos/sales', 250, false);
      recordRequest('GET', '/api/v1/pos/inventory', 150, false);

      const metrics = getMetrics();

      expect(metrics.totalRequests).toBe(3);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.endpoints.length).toBeGreaterThan(0);

      const inventoryEndpoint = metrics.endpoints.find(e => e.path === '/api/v1/pos/inventory');
      expect(inventoryEndpoint).toBeDefined();
      expect(inventoryEndpoint!.count).toBe(2);
      expect(inventoryEndpoint!.method).toBe('GET');
    });

    it('should track error counts', () => {
      recordRequest('POST', '/api/v1/pos/sales', 100, false);
      recordRequest('POST', '/api/v1/pos/sales', 200, true); // error
      recordRequest('POST', '/api/v1/pos/sales', 150, true); // error

      const metrics = getMetrics();

      expect(metrics.totalRequests).toBe(3);
      expect(metrics.totalErrors).toBe(2);
      expect(metrics.errorRate).toBeCloseTo(0.666, 2);
    });

    it('should normalize paths with IDs', () => {
      recordRequest('GET', '/api/v1/pos/products/123', 50, false);
      recordRequest('GET', '/api/v1/pos/products/456', 60, false);
      recordRequest('GET', '/api/v1/pos/products/abc123def456', 70, false);

      const metrics = getMetrics();
      const productEndpoint = metrics.endpoints.find(e => e.path.includes('products'));

      expect(productEndpoint).toBeDefined();
      expect(productEndpoint!.count).toBe(3); // All normalized to same endpoint
      expect(productEndpoint!.path).toBe('/api/v1/pos/products/:id');
    });

    it('should calculate p95 latency', () => {
      // Record 100 requests with latencies 1-100ms
      for (let i = 1; i <= 100; i++) {
        recordRequest('GET', '/api/v1/test', i, false);
      }

      const metrics = getMetrics();
      expect(metrics.p95LatencyMs).toBeGreaterThanOrEqual(95);
      expect(metrics.p95LatencyMs).toBeLessThanOrEqual(100);
    });

    it('should reset metrics on demand', () => {
      recordRequest('GET', '/api/v1/test', 100, false);
      recordRequest('POST', '/api/v1/test', 200, true);

      let metrics = getMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.totalErrors).toBe(1);

      resetMetrics();

      metrics = getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.endpoints.length).toBe(0);
    });
  });

  describe('Metrics Middleware', () => {
    beforeEach(() => {
      resetMetrics();
    });

    it('should auto-record request duration', (done) => {
      const req: any = {
        method: 'GET',
        path: '/api/v1/health',
      };
      const res: any = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            // Simulate request completion after 50ms
            setTimeout(() => {
              callback();

              const metrics = getMetrics();
              expect(metrics.totalRequests).toBe(1);
              expect(metrics.endpoints.length).toBeGreaterThan(0);
              done();
            }, 10);
          }
        }),
        statusCode: 200,
      };
      const next = jest.fn();

      metricsMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
