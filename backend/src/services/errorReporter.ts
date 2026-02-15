/**
 * GCP Error Reporting integration
 * Formats errors so Cloud Error Reporting auto-groups and tracks them.
 * On Cloud Run, anything written to stderr with proper format is captured.
 */

interface ErrorReport {
  message: string;
  stack?: string;
  context: {
    service: string;
    version: string;
    httpRequest?: {
      method: string;
      url: string;
      userAgent?: string;
      responseStatusCode?: number;
    };
    user?: string;
    traceId?: string;
  };
}

const SERVICE_NAME = process.env.K_SERVICE || 'supermandi-backend';
const VERSION = process.env.K_REVISION || 'unknown';

/**
 * Report an error to GCP Error Reporting via structured stderr logging.
 * Cloud Run automatically forwards stderr to Cloud Logging, which feeds Error Reporting.
 */
export function reportError(
  error: Error | string,
  context?: Partial<ErrorReport['context']>
): void {
  const err = typeof error === 'string' ? new Error(error) : error;

  const report: ErrorReport = {
    message: err.message,
    stack: err.stack,
    context: {
      service: SERVICE_NAME,
      version: VERSION,
      ...context,
    },
  };

  // GCP Error Reporting format: JSON with @type field
  const gcpError = {
    '@type': 'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent',
    message: `${err.stack || err.message}`,
    serviceContext: {
      service: report.context.service,
      version: report.context.version,
    },
    context: {
      httpRequest: report.context.httpRequest,
      user: report.context.user,
      reportLocation: {
        functionName: err.stack?.split('\n')[1]?.trim() || 'unknown',
      },
    },
  };

  // Write to stderr — Cloud Run forwards to Cloud Logging → Error Reporting
  process.stderr.write(JSON.stringify(gcpError) + '\n');
}

/**
 * Express error handler that reports to GCP Error Reporting
 */
export function errorReportingMiddleware(
  err: Error,
  req: any,
  res: any,
  next: any
): void {
  reportError(err, {
    httpRequest: {
      method: req.method,
      url: req.originalUrl || req.url,
      userAgent: req.headers['user-agent'],
      responseStatusCode: res.statusCode || 500,
    },
    user: req.user?.id || req.adminId || undefined,
    traceId: (req as any).traceContext?.traceId,
  });

  // Don't swallow the error — pass to next handler
  next(err);
}
