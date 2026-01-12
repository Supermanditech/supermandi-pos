// Health Dashboard - V3.0.9 compliant
// Service health checks and metrics endpoint

import { Request, Response, Router } from 'express';
import { Pool } from 'pg';

// =============================================================================
// TYPES
// =============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  responseTimeMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface HealthConfig {
  service: string;
  version?: string;
  checks?: HealthCheckConfig[];
}

export interface HealthCheckConfig {
  name: string;
  check: () => Promise<HealthCheck>;
  critical?: boolean;
}

// =============================================================================
// HEALTH CHECKER
// =============================================================================

export class HealthChecker {
  private service: string;
  private version: string;
  private startTime: number;
  private checks: HealthCheckConfig[] = [];

  constructor(config: HealthConfig) {
    this.service = config.service;
    this.version = config.version || process.env.VERSION || '1.0.0';
    this.startTime = Date.now();
    this.checks = config.checks || [];
  }

  /**
   * Add a health check.
   */
  addCheck(check: HealthCheckConfig): void {
    this.checks.push(check);
  }

  /**
   * Add PostgreSQL health check.
   */
  addPostgresCheck(pool: Pool, name: string = 'postgres'): void {
    this.addCheck({
      name,
      critical: true,
      check: async () => {
        const start = Date.now();
        try {
          await pool.query('SELECT 1');
          return {
            name,
            status: 'pass',
            responseTimeMs: Date.now() - start,
          };
        } catch (error) {
          return {
            name,
            status: 'fail',
            responseTimeMs: Date.now() - start,
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });
  }

  /**
   * Add Redis health check.
   */
  addRedisCheck(
    redis: { ping: () => Promise<string> },
    name: string = 'redis'
  ): void {
    this.addCheck({
      name,
      critical: true,
      check: async () => {
        const start = Date.now();
        try {
          const result = await redis.ping();
          return {
            name,
            status: result === 'PONG' ? 'pass' : 'warn',
            responseTimeMs: Date.now() - start,
          };
        } catch (error) {
          return {
            name,
            status: 'fail',
            responseTimeMs: Date.now() - start,
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });
  }

  /**
   * Add custom HTTP endpoint health check.
   */
  addHttpCheck(
    name: string,
    url: string,
    options: { timeoutMs?: number; critical?: boolean } = {}
  ): void {
    this.addCheck({
      name,
      critical: options.critical ?? false,
      check: async () => {
        const start = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          options.timeoutMs || 5000
        );

        try {
          const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
          });
          clearTimeout(timeout);

          return {
            name,
            status: response.ok ? 'pass' : 'fail',
            responseTimeMs: Date.now() - start,
            details: { statusCode: response.status },
          };
        } catch (error) {
          clearTimeout(timeout);
          return {
            name,
            status: 'fail',
            responseTimeMs: Date.now() - start,
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });
  }

  /**
   * Run all health checks and return status.
   */
  async getHealth(): Promise<HealthStatus> {
    const results: HealthCheck[] = [];
    let hasFailure = false;
    let hasWarning = false;

    for (const checkConfig of this.checks) {
      try {
        const result = await checkConfig.check();
        results.push(result);

        if (result.status === 'fail' && checkConfig.critical) {
          hasFailure = true;
        } else if (result.status === 'warn' || result.status === 'fail') {
          hasWarning = true;
        }
      } catch (error) {
        results.push({
          name: checkConfig.name,
          status: 'fail',
          message: error instanceof Error ? error.message : 'Check threw error',
        });
        if (checkConfig.critical) {
          hasFailure = true;
        }
      }
    }

    return {
      status: hasFailure ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      service: this.service,
      version: this.version,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: results,
    };
  }

  /**
   * Simple liveness check (is the process running?).
   */
  getLiveness(): { status: 'ok'; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness check (is the service ready to receive traffic?).
   */
  async getReadiness(): Promise<{ ready: boolean; checks: HealthCheck[] }> {
    const health = await this.getHealth();
    return {
      ready: health.status !== 'unhealthy',
      checks: health.checks,
    };
  }
}

// =============================================================================
// EXPRESS ROUTER
// =============================================================================

/**
 * Create health check router.
 */
export function createHealthRouter(checker: HealthChecker): Router {
  const router = Router();

  // Basic health endpoint
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const health = await checker.getHealth();
      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Kubernetes liveness probe
  router.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json(checker.getLiveness());
  });

  // Kubernetes readiness probe
  router.get('/ready', async (_req: Request, res: Response) => {
    try {
      const readiness = await checker.getReadiness();
      res.status(readiness.ready ? 200 : 503).json(readiness);
    } catch (error) {
      res.status(503).json({
        ready: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Detailed metrics (for monitoring dashboards)
  router.get('/metrics', async (_req: Request, res: Response) => {
    try {
      const health = await checker.getHealth();
      const memoryUsage = process.memoryUsage();

      res.status(200).json({
        ...health,
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          memoryUsage: {
            heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
            externalMB: Math.round(memoryUsage.external / 1024 / 1024),
          },
          cpuUsage: process.cpuUsage(),
        },
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a health checker instance.
 */
export function createHealthChecker(config: HealthConfig): HealthChecker {
  return new HealthChecker(config);
}

export default {
  HealthChecker,
  createHealthChecker,
  createHealthRouter,
};
