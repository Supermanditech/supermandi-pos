// Dev-Only Middleware - DEV-068
// Hard blocks endpoints/scripts from running in production

import { Request, Response, NextFunction } from 'express';
import { log } from "../lib/logger";

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

/**
 * Get the current environment
 * Defaults to 'development' if not set
 */
function getEnvironment(): string {
  return process.env.NODE_ENV || 'development';
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  const env = getEnvironment().toLowerCase();
  return env === 'production' || env === 'prod';
}

/**
 * Check if running in development or staging
 */
export function isDevOrStaging(): boolean {
  const env = getEnvironment().toLowerCase();
  return (
    env === 'development' ||
    env === 'dev' ||
    env === 'staging' ||
    env === 'stage' ||
    env === 'test' ||
    env === 'local'
  );
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Express middleware that blocks requests in production.
 * Returns 404 to hide that the endpoint even exists.
 *
 * Usage:
 *   router.post('/seed-demo-data', devOnlyMiddleware(), seedHandler);
 */
export function devOnlyMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isProduction()) {
      // Return 404 to hide the existence of dev-only endpoints
      log.warn(
        `[DevOnly] Blocked request to dev-only endpoint in production: ${req.method} ${req.path}`
      );
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found.',
      });
      return;
    }
    next();
  };
}

/**
 * Express middleware that requires a specific header to bypass.
 * Even in dev/staging, requires confirmation header.
 *
 * Usage:
 *   router.post('/dangerous-action', devOnlyWithConfirmation('I-KNOW-WHAT-I-AM-DOING'), handler);
 */
export function devOnlyWithConfirmation(requiredHeaderValue: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isProduction()) {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found.',
      });
      return;
    }

    const confirmHeader = req.headers['x-confirm-action'] as string;
    if (confirmHeader !== requiredHeaderValue) {
      res.status(400).json({
        error: 'Missing Confirmation',
        message: `This action requires header: X-Confirm-Action: ${requiredHeaderValue}`,
      });
      return;
    }

    next();
  };
}

// =============================================================================
// SCRIPT GUARD
// =============================================================================

/**
 * Guard function for scripts - throws if running in production.
 * Use at the start of any seed/migration/destructive script.
 *
 * Usage:
 *   assertNotProduction('seed-demo-data');
 */
export function assertNotProduction(scriptName: string): void {
  if (isProduction()) {
    log.error(
      `\n[BLOCKED] Script "${scriptName}" cannot run in production environment.`
    );
    log.error(`Current NODE_ENV: ${getEnvironment()}`);
    log.error(
      `\nThis script is only allowed in: development, staging, test, local\n`
    );
    process.exit(1);
  }

  log.info(
    `[DevOnly] Script "${scriptName}" running in: ${getEnvironment()}`
  );
}

/**
 * Guard function that also requires explicit confirmation.
 *
 * Usage:
 *   assertNotProductionWithConfirm('wipe-database', process.argv.includes('--confirm'));
 */
export function assertNotProductionWithConfirm(
  scriptName: string,
  confirmed: boolean
): void {
  assertNotProduction(scriptName);

  if (!confirmed) {
    log.error(`\n[BLOCKED] Script "${scriptName}" requires confirmation.`);
    log.error(`\nRun with --confirm flag to proceed:\n`);
    log.error(`  npx ts-node scripts/${scriptName}.ts --confirm\n`);
    process.exit(1);
  }
}
