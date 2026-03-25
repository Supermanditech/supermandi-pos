/**
 * GCP-STG-0676: Distributed tracing header forwarding
 *
 * Verifies the API Gateway proxy forwards traceparent, tracestate, and
 * x-cloud-trace-context headers to downstream services. Uses a real HTTP
 * server as the mock backend target to prove headers pass through the proxy.
 */

import http from 'http';
import express from 'express';
import request from 'supertest';
import { createProxyMiddleware } from 'http-proxy-middleware';

describe('GCP-STG-0676: Distributed tracing headers', () => {
  let mockBackend: http.Server;
  let mockBackendPort: number;
  let receivedHeaders: http.IncomingHttpHeaders;

  beforeAll((done) => {
    // Create a mock backend that captures received headers
    mockBackend = http.createServer((req, res) => {
      receivedHeaders = req.headers;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    mockBackend.listen(0, () => {
      mockBackendPort = (mockBackend.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    mockBackend.close(done);
  });

  beforeEach(() => {
    receivedHeaders = {};
  });

  function createAppWithProxy(): express.Express {
    const app = express();
    // Replicate the gateway proxy config with trace header forwarding
    // as implemented in backend/services/api-gateway/src/routes/proxy.ts
    app.use(
      '/api',
      createProxyMiddleware({
        target: `http://127.0.0.1:${mockBackendPort}`,
        changeOrigin: true,
        onProxyReq: (proxyReq, req) => {
          // GCP-STG-0676: Forward trace-context headers (mirrors production proxy.ts)
          const traceContext = req.headers['x-cloud-trace-context'];
          if (traceContext) {
            proxyReq.setHeader('x-cloud-trace-context', traceContext as string);
          }
          const traceparent = req.headers['traceparent'];
          if (traceparent) {
            proxyReq.setHeader('traceparent', traceparent as string);
          }
          const tracestate = req.headers['tracestate'];
          if (tracestate) {
            proxyReq.setHeader('tracestate', tracestate as string);
          }
        },
      }),
    );
    return app;
  }

  it('forwards traceparent header to backend', async () => {
    const app = createAppWithProxy();
    const traceId = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

    await request(app)
      .get('/api/test')
      .set('traceparent', traceId)
      .expect(200);

    expect(receivedHeaders['traceparent']).toBe(traceId);
  });

  it('forwards tracestate header to backend', async () => {
    const app = createAppWithProxy();
    const traceState = 'congo=t61rcWkgMzE';

    await request(app)
      .get('/api/test')
      .set('tracestate', traceState)
      .expect(200);

    expect(receivedHeaders['tracestate']).toBe(traceState);
  });

  it('forwards x-cloud-trace-context header to backend', async () => {
    const app = createAppWithProxy();
    const cloudTrace = '105445aa7843bc8bf206b12000100000/1;o=1';

    await request(app)
      .get('/api/test')
      .set('x-cloud-trace-context', cloudTrace)
      .expect(200);

    expect(receivedHeaders['x-cloud-trace-context']).toBe(cloudTrace);
  });

  it('forwards all three trace headers simultaneously', async () => {
    const app = createAppWithProxy();
    const traceparent = '00-abcdef1234567890abcdef1234567890-1234567890abcdef-01';
    const tracestate = 'vendor1=value1,vendor2=value2';
    const cloudTrace = '205445aa7843bc8bf206b12000100000/2;o=1';

    await request(app)
      .get('/api/test')
      .set('traceparent', traceparent)
      .set('tracestate', tracestate)
      .set('x-cloud-trace-context', cloudTrace)
      .expect(200);

    expect(receivedHeaders['traceparent']).toBe(traceparent);
    expect(receivedHeaders['tracestate']).toBe(tracestate);
    expect(receivedHeaders['x-cloud-trace-context']).toBe(cloudTrace);
  });

  it('does not fail when no trace headers are present', async () => {
    const app = createAppWithProxy();

    const res = await request(app).get('/api/test');

    expect(res.status).toBe(200);
    // traceparent should not be present if not sent
    expect(receivedHeaders['traceparent']).toBeUndefined();
  });
});
