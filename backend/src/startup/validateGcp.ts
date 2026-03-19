/**
 * GO-LIVE-180: GCP Credential Validation at Startup
 *
 * Validates Google Cloud Platform credentials and configuration before
 * services that depend on them start accepting requests.
 *
 * This catches configuration issues early rather than failing later
 * when translation or storage operations are attempted.
 */

import fs from 'fs';
import path from 'path';
import { log } from "../lib/logger";

export interface GcpValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  services: {
    translation: { available: boolean; reason?: string };
    storage: { available: boolean; reason?: string };
  };
}

/**
 * Validate GCP configuration and credentials at startup
 * Returns validation result with errors and warnings
 */
export function validateGcpCredentials(): GcpValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const result: GcpValidationResult = {
    valid: true,
    errors,
    warnings,
    services: {
      translation: { available: false, reason: 'Not configured' },
      storage: { available: false, reason: 'Not configured' },
    },
  };

  // Check GOOGLE_CLOUD_PROJECT
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    warnings.push(
      'GOOGLE_CLOUD_PROJECT not set. Machine translation and GCS storage will be unavailable.'
    );
    result.services.translation.reason = 'GOOGLE_CLOUD_PROJECT not set';
    result.services.storage.reason = 'GOOGLE_CLOUD_PROJECT not set';
    return result;
  }

  // Check GOOGLE_APPLICATION_CREDENTIALS
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    // Check if running on GCP (where default credentials are available)
    const isGcpEnvironment =
      process.env.K_SERVICE || // Cloud Run
      process.env.FUNCTION_NAME || // Cloud Functions
      process.env.GAE_ENV || // App Engine
      process.env.GCP_PROJECT; // Generic GCP

    if (isGcpEnvironment) {
      // Running on GCP with default credentials
      result.services.translation.available = true;
      result.services.translation.reason = 'Using GCP default credentials';
      result.services.storage.available = true;
      result.services.storage.reason = 'Using GCP default credentials';
      warnings.push('Using GCP default credentials (no explicit credentials file)');
    } else {
      warnings.push(
        'GOOGLE_APPLICATION_CREDENTIALS not set. ' +
        'Machine translation and GCS will use default credentials or be unavailable.'
      );
      result.services.translation.reason = 'No credentials configured';
      result.services.storage.reason = 'No credentials configured';
    }
    return result;
  }

  // Validate credentials file exists
  const absolutePath = path.isAbsolute(credentialsPath)
    ? credentialsPath
    : path.resolve(process.cwd(), credentialsPath);

  if (!fs.existsSync(absolutePath)) {
    errors.push(
      `GOOGLE_APPLICATION_CREDENTIALS file not found: ${absolutePath}`
    );
    result.valid = false;
    result.services.translation.reason = 'Credentials file not found';
    result.services.storage.reason = 'Credentials file not found';
    return result;
  }

  // Validate credentials file is readable and valid JSON
  try {
    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    const credentials = JSON.parse(fileContent);

    // Validate required fields in service account JSON
    const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter(field => !credentials[field]);

    if (missingFields.length > 0) {
      errors.push(
        `GCP credentials file missing required fields: ${missingFields.join(', ')}`
      );
      result.valid = false;
      result.services.translation.reason = 'Invalid credentials file';
      result.services.storage.reason = 'Invalid credentials file';
      return result;
    }

    // Validate type is service_account
    if (credentials.type !== 'service_account') {
      errors.push(
        `GCP credentials type is "${credentials.type}" but expected "service_account". ` +
        'Other credential types may not work for all services.'
      );
      // Warning, not error - some types may still work
    }

    // Validate project_id matches GOOGLE_CLOUD_PROJECT
    if (credentials.project_id !== projectId) {
      warnings.push(
        `GOOGLE_CLOUD_PROJECT (${projectId}) does not match credentials project_id (${credentials.project_id}). ` +
        'This may cause permission issues.'
      );
    }

    // Validate private key format
    if (!credentials.private_key.includes('BEGIN PRIVATE KEY')) {
      errors.push('GCP credentials private_key appears malformed');
      result.valid = false;
      result.services.translation.reason = 'Malformed private key';
      result.services.storage.reason = 'Malformed private key';
      return result;
    }

    // All validation passed
    result.services.translation.available = true;
    result.services.translation.reason = 'Credentials validated';
    result.services.storage.available = true;
    result.services.storage.reason = 'Credentials validated';

  } catch (parseError: any) {
    if (parseError instanceof SyntaxError) {
      errors.push(`GCP credentials file is not valid JSON: ${parseError.message}`);
    } else {
      errors.push(`Failed to read GCP credentials file: ${parseError.message}`);
    }
    result.valid = false;
    result.services.translation.reason = 'Cannot read credentials file';
    result.services.storage.reason = 'Cannot read credentials file';
  }

  return result;
}

/**
 * V3-HARDEN-172: Validate conversion schema readiness at startup
 * Checks that migration 199 columns exist on catalog.store_products
 */
export async function validateConversionSchemaReadiness(pool: any): Promise<{ ready: boolean; missing: string[] }> {
  const missing: string[] = [];
  const requiredColumns = ['procurement_unit', 'procurement_pack_qty', 'base_stock_unit', 'conversion_confirmed'];
  // V3-HARDEN-172: Also check migration 200 columns on supplier_products
  const supplierColumns = ['sell_unit', 'default_retail_variants'];
  try {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'catalog' AND table_name = 'store_products'
       AND column_name = ANY($1)`,
      [requiredColumns]
    );
    const found = new Set(result.rows.map((r: any) => r.column_name));
    for (const col of requiredColumns) {
      if (!found.has(col)) missing.push(col);
    }
  } catch {
    missing.push(...requiredColumns);
  }
  // Check migration 200 columns on supplier_products
  try {
    const result2 = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'catalog' AND table_name = 'supplier_products'
       AND column_name = ANY($1)`,
      [supplierColumns]
    );
    const found2 = new Set(result2.rows.map((r: any) => r.column_name));
    for (const col of supplierColumns) {
      if (!found2.has(col)) missing.push(`supplier_products.${col}`);
    }
  } catch {
    missing.push(...supplierColumns.map(c => `supplier_products.${c}`));
  }
  // V3-HARDEN-178: Check migration 201 — commercial terms + payment intents
  const commercialColumns = ['moq_tiers', 'delivery_sla_days', 'published_terms_version', 'published_at'];
  try {
    const result3 = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'catalog' AND table_name = 'supplier_products'
       AND column_name = ANY($1)`,
      [commercialColumns]
    );
    const found3 = new Set(result3.rows.map((r: any) => r.column_name));
    for (const col of commercialColumns) {
      if (!found3.has(col)) missing.push(`supplier_products.${col}`);
    }
  } catch {
    missing.push(...commercialColumns.map(c => `supplier_products.${c}`));
  }
  // Check procurement.payment_intents table
  try {
    const result4 = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'procurement' AND table_name = 'payment_intents' LIMIT 1`
    );
    if (result4.rows.length === 0) missing.push('procurement.payment_intents table');
  } catch {
    missing.push('procurement.payment_intents table');
  }
  return { ready: missing.length === 0, missing };
}

/**
 * Run GCP validation and log results
 * Call this during server startup
 */
export function logGcpValidationResults(): GcpValidationResult {
  const result = validateGcpCredentials();

  log.info('[GO-LIVE-180] GCP Credential Validation:');

  if (result.errors.length > 0) {
    log.error('[GO-LIVE-180] ERRORS:');
    for (const error of result.errors) {
      log.error(`  - ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    log.warn('[GO-LIVE-180] Warnings:');
    for (const warning of result.warnings) {
      log.warn(`  - ${warning}`);
    }
  }

  log.info('[GO-LIVE-180] Service Availability:');
  log.info(`  - Translation: ${result.services.translation.available ? '✓' : '✗'} (${result.services.translation.reason})`);
  log.info(`  - Storage: ${result.services.storage.available ? '✓' : '✗'} (${result.services.storage.reason})`);

  if (!result.valid) {
    log.error(
      '[GO-LIVE-180] GCP validation failed. Services requiring GCP will not function correctly.'
    );
  }

  return result;
}

/**
 * Check if translation service should be available based on validation
 */
export function isTranslationAvailable(): boolean {
  const result = validateGcpCredentials();
  return result.services.translation.available;
}

/**
 * Check if GCS storage should be available based on validation
 */
export function isStorageAvailable(): boolean {
  const result = validateGcpCredentials();
  return result.services.storage.available;
}
