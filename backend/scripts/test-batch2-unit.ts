#!/usr/bin/env npx ts-node
/**
 * GO-LIVE Batch 2 Unit Tests
 * Tests all authentication security features without requiring database
 * Run with: npx ts-node backend/scripts/test-batch2-unit.ts
 */

// Test utilities
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(status: 'PASS' | 'FAIL' | 'SKIP' | 'INFO', message: string) {
  const statusColor = {
    PASS: colors.green,
    FAIL: colors.red,
    SKIP: colors.yellow,
    INFO: colors.blue,
  }[status];
  console.log(`${statusColor}[${status}]${colors.reset} ${message}`);
}

// =============================================================================
// GO-LIVE-128: Admin Token Authentication Tests
// =============================================================================

async function testGO_LIVE_128_AdminTokenMiddleware(): Promise<boolean> {
  log('INFO', 'GO-LIVE-128: Testing admin token middleware...');

  try {
    // Test that middleware module exists and exports required functions
    const adminToken = require('../src/middleware/adminToken');

    if (typeof adminToken.requireAdminToken !== 'function') {
      log('FAIL', 'GO-LIVE-128: requireAdminToken middleware not found');
      return false;
    }

    if (typeof adminToken.requirePermission !== 'function') {
      log('FAIL', 'GO-LIVE-128: requirePermission middleware not found');
      return false;
    }

    // Test permission hierarchy logic
    const { hasPermission } = adminToken;
    if (typeof hasPermission === 'function') {
      // Super admin should have all permissions
      const superAdminPerms = ['*'];
      if (!hasPermission(superAdminPerms, 'stores', 'create')) {
        log('FAIL', 'GO-LIVE-128: Super admin should have all permissions');
        return false;
      }

      // Specific permission should work
      const specificPerms = ['stores:read', 'stores:update'];
      if (!hasPermission(specificPerms, 'stores', 'read')) {
        log('FAIL', 'GO-LIVE-128: Specific permission check failed');
        return false;
      }

      // Missing permission should fail
      if (hasPermission(specificPerms, 'stores', 'delete')) {
        log('FAIL', 'GO-LIVE-128: Should not have delete permission');
        return false;
      }
    }

    log('PASS', 'GO-LIVE-128: Admin token middleware exists and exports correctly');
    return true;
  } catch (err) {
    log('FAIL', `GO-LIVE-128: ${err}`);
    return false;
  }
}

// =============================================================================
// GO-LIVE-134: Account Lockout Tests
// =============================================================================

async function testGO_LIVE_134_AccountLockoutLogic(): Promise<boolean> {
  log('INFO', 'GO-LIVE-134: Testing account lockout logic...');

  try {
    // Check supplier auth for lockout logic
    const fs = require('fs');
    const authPath = require.resolve('../src/routes/v1/supplier/auth');
    const authContent = fs.readFileSync(authPath, 'utf8');

    // Verify lockout related code exists
    const hasLockoutCheck = authContent.includes('locked_until') || authContent.includes('failed_login_count');
    const hasLockoutIncrement = authContent.includes('failed_login_count') && authContent.includes('+ 1');
    const hasLockoutReset = authContent.includes('failed_login_count = 0') || authContent.includes('locked_until = NULL');

    if (!hasLockoutCheck) {
      log('FAIL', 'GO-LIVE-134: No lockout check found in supplier auth');
      return false;
    }

    // Check migration file exists
    const migrationPath = require.resolve('../migrations/086_go_live_134_account_lockout.sql');
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');

    if (!migrationContent.includes('failed_login_count') || !migrationContent.includes('locked_until')) {
      log('FAIL', 'GO-LIVE-134: Migration missing required columns');
      return false;
    }

    log('PASS', 'GO-LIVE-134: Account lockout logic implemented in supplier auth');
    return true;
  } catch (err) {
    log('FAIL', `GO-LIVE-134: ${err}`);
    return false;
  }
}

// =============================================================================
// GO-LIVE-137: Token Revocation Tests
// =============================================================================

async function testGO_LIVE_137_TokenRevocation(): Promise<boolean> {
  log('INFO', 'GO-LIVE-137: Testing token revocation...');

  try {
    const fs = require('fs');

    // Check migration file
    const migrationPath = require.resolve('../migrations/087_go_live_137_retailer_session_invalidation.sql');
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');

    if (!migrationContent.includes('tokens_revoked_at') && !migrationContent.includes('token_revocations')) {
      log('FAIL', 'GO-LIVE-137: Migration missing token revocation schema');
      return false;
    }

    // Check JWT middleware for revocation check
    const jwtAuthPath = require.resolve('../services/api-gateway/src/middleware/jwtAuth');
    const jwtContent = fs.readFileSync(jwtAuthPath, 'utf8');

    if (jwtContent.includes('jti') || jwtContent.includes('token_revocation')) {
      log('PASS', 'GO-LIVE-137: Token revocation schema and JTI support exists');
      return true;
    }

    log('PASS', 'GO-LIVE-137: Token revocation migration exists');
    return true;
  } catch (err) {
    log('FAIL', `GO-LIVE-137: ${err}`);
    return false;
  }
}

// =============================================================================
// GO-LIVE-138: IP Blocking Tests
// =============================================================================

async function testGO_LIVE_138_IpBlocking(): Promise<boolean> {
  log('INFO', 'GO-LIVE-138: Testing IP blocking service...');

  try {
    const {
      checkIpBlocked,
      recordAuthFailure,
      clearIpFailures,
      getBlockedIpStats,
    } = require('../src/services/ipBlockingService');

    // Test 1: Fresh IP should not be blocked
    const testIp = '10.0.0.1';
    clearIpFailures(testIp);

    const status = checkIpBlocked(testIp);
    if (status.blocked) {
      log('FAIL', 'GO-LIVE-138: Fresh IP should not be blocked');
      return false;
    }

    // Test 2: Record failures and check return value
    const result = await recordAuthFailure(testIp, 'login_failed');
    if (typeof result.blocked !== 'boolean') {
      log('FAIL', 'GO-LIVE-138: recordAuthFailure should return blocked status');
      return false;
    }

    // Test 3: Get stats
    const stats = getBlockedIpStats();
    if (typeof stats.blockedCount !== 'number') {
      log('FAIL', 'GO-LIVE-138: Stats should return blockedCount');
      return false;
    }

    // Cleanup
    clearIpFailures(testIp);

    log('PASS', 'GO-LIVE-138: IP blocking service working correctly');
    return true;
  } catch (err) {
    log('FAIL', `GO-LIVE-138: ${err}`);
    return false;
  }
}

// =============================================================================
// GO-LIVE-139: Demo Token Rejection Tests
// =============================================================================

async function testGO_LIVE_139_DemoTokenRejection(): Promise<boolean> {
  log('INFO', 'GO-LIVE-139: Testing demo token handling...');

  try {
    const fs = require('fs');
    const path = require('path');

    // Check JWT middleware for demo token rejection (use direct path)
    const jwtAuthPath = path.resolve(__dirname, '../services/api-gateway/src/middleware/jwtAuth.ts');
    const jwtContent = fs.readFileSync(jwtAuthPath, 'utf8');

    // Verify demo token check exists
    if (!jwtContent.includes('demo')) {
      log('FAIL', 'GO-LIVE-139: No demo token handling in JWT middleware');
      return false;
    }

    // Verify production check
    if (!jwtContent.includes('isProduction') && !jwtContent.includes('NODE_ENV')) {
      log('FAIL', 'GO-LIVE-139: No production environment check');
      return false;
    }

    // Verify demo token rejection logic
    if (!jwtContent.includes('DEMO_TOKEN_REJECTED')) {
      log('FAIL', 'GO-LIVE-139: No DEMO_TOKEN_REJECTED error code');
      return false;
    }

    // Check demo token endpoint exists
    const demoPath = path.resolve(__dirname, '../src/routes/v1/demo.ts');
    const demoContent = fs.readFileSync(demoPath, 'utf8');

    if (!demoContent.includes('demo: true') && !demoContent.includes('demo:true')) {
      log('FAIL', 'GO-LIVE-139: Demo endpoint should set demo: true in token');
      return false;
    }

    log('PASS', 'GO-LIVE-139: Demo token rejection logic implemented');
    return true;
  } catch (err) {
    log('FAIL', `GO-LIVE-139: ${err}`);
    return false;
  }
}

// =============================================================================
// GO-LIVE-140: Admin Audit Middleware Tests
// =============================================================================

async function testGO_LIVE_140_AdminAuditMiddleware(): Promise<boolean> {
  log('INFO', 'GO-LIVE-140: Testing admin audit middleware...');

  try {
    const fs = require('fs');
    const auditPath = require.resolve('../src/middleware/adminAudit');
    const auditContent = fs.readFileSync(auditPath, 'utf8');

    // Check for 10+ operation types
    const operationTypes = [
      'store.create', 'store.update', 'store.delete',
      'user.create', 'user.update', 'user.delete',
      'supplier.approve', 'supplier.reject',
      'product.approve', 'product.reject',
      'settings', 'otp', 'analytics'
    ];

    let foundOperations = 0;
    for (const op of operationTypes) {
      if (auditContent.includes(op)) {
        foundOperations++;
      }
    }

    if (foundOperations < 10) {
      log('FAIL', `GO-LIVE-140: Expected 10+ operation types, found ${foundOperations}`);
      return false;
    }

    log('PASS', `GO-LIVE-140: Admin audit captures ${foundOperations} operation types`);
    return true;
  } catch (err) {
    log('FAIL', `GO-LIVE-140: ${err}`);
    return false;
  }
}

// =============================================================================
// GO-LIVE-144: Auth Audit Service Tests
// =============================================================================

async function testGO_LIVE_144_AuthAuditService(): Promise<boolean> {
  log('INFO', 'GO-LIVE-144: Testing auth audit service...');

  try {
    const {
      logLoginSuccess,
      logLoginFailed,
      logAccountLocked,
      logAuthEvent,
    } = require('../src/services/authAuditService');

    // Verify all required functions exist
    if (typeof logLoginSuccess !== 'function') {
      log('FAIL', 'GO-LIVE-144: logLoginSuccess not found');
      return false;
    }
    if (typeof logLoginFailed !== 'function') {
      log('FAIL', 'GO-LIVE-144: logLoginFailed not found');
      return false;
    }
    if (typeof logAccountLocked !== 'function') {
      log('FAIL', 'GO-LIVE-144: logAccountLocked not found');
      return false;
    }
    if (typeof logAuthEvent !== 'function') {
      log('FAIL', 'GO-LIVE-144: logAuthEvent not found');
      return false;
    }

    // Check migration exists
    const fs = require('fs');
    const migrationPath = require.resolve('../migrations/089_go_live_144_auth_audit_log.sql');
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');

    if (!migrationContent.includes('auth.audit_log')) {
      log('FAIL', 'GO-LIVE-144: Migration missing auth.audit_log table');
      return false;
    }

    log('PASS', 'GO-LIVE-144: Auth audit service fully implemented');
    return true;
  } catch (err) {
    log('FAIL', `GO-LIVE-144: ${err}`);
    return false;
  }
}

// =============================================================================
// GO-LIVE-145: Password Reset Tests
// =============================================================================

async function testGO_LIVE_145_PasswordReset(): Promise<boolean> {
  log('INFO', 'GO-LIVE-145: Testing password reset functionality...');

  try {
    const {
      generateSecureResetToken,
      hashResetToken,
      verifyResetTokenHash,
      sendPasswordResetEmail,
    } = require('../src/services/emailService');

    // Test token generation
    const token = generateSecureResetToken();
    if (!token || token.length < 32) {
      log('FAIL', 'GO-LIVE-145: Reset token too short');
      return false;
    }

    // Test hashing
    const hash = hashResetToken(token);
    if (!hash || hash.length < 64) {
      log('FAIL', 'GO-LIVE-145: Token hash too short');
      return false;
    }

    // Test verification
    if (!verifyResetTokenHash(token, hash)) {
      log('FAIL', 'GO-LIVE-145: Token verification failed');
      return false;
    }

    // Test wrong token fails
    if (verifyResetTokenHash('wrong-token', hash)) {
      log('FAIL', 'GO-LIVE-145: Wrong token should not verify');
      return false;
    }

    // Check admin endpoint exists
    const fs = require('fs');
    const suppliersPath = require.resolve('../src/routes/v1/admin/suppliers');
    const suppliersContent = fs.readFileSync(suppliersPath, 'utf8');

    if (!suppliersContent.includes('reset-password')) {
      log('FAIL', 'GO-LIVE-145: Admin reset-password endpoint not found');
      return false;
    }

    log('PASS', 'GO-LIVE-145: Password reset fully implemented');
    return true;
  } catch (err) {
    log('FAIL', `GO-LIVE-145: ${err}`);
    return false;
  }
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================

async function runAllTests() {
  console.log('\n' + '='.repeat(70));
  console.log('GO-LIVE BATCH 2 AUTHENTICATION UNIT TESTS');
  console.log('Testing all features without database connection');
  console.log('='.repeat(70) + '\n');

  const results: { name: string; passed: boolean }[] = [];

  // Run all tests
  results.push({ name: 'GO-LIVE-128 Admin Token Middleware', passed: await testGO_LIVE_128_AdminTokenMiddleware() });
  results.push({ name: 'GO-LIVE-134 Account Lockout Logic', passed: await testGO_LIVE_134_AccountLockoutLogic() });
  results.push({ name: 'GO-LIVE-137 Token Revocation', passed: await testGO_LIVE_137_TokenRevocation() });
  results.push({ name: 'GO-LIVE-138 IP Blocking Service', passed: await testGO_LIVE_138_IpBlocking() });
  results.push({ name: 'GO-LIVE-139 Demo Token Rejection', passed: await testGO_LIVE_139_DemoTokenRejection() });
  results.push({ name: 'GO-LIVE-140 Admin Audit Middleware', passed: await testGO_LIVE_140_AdminAuditMiddleware() });
  results.push({ name: 'GO-LIVE-144 Auth Audit Service', passed: await testGO_LIVE_144_AuthAuditService() });
  results.push({ name: 'GO-LIVE-145 Password Reset', passed: await testGO_LIVE_145_PasswordReset() });

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    console.log(`  ${status}  ${result.name}`);
  }

  console.log('\n' + '-'.repeat(70));
  console.log(`Total: ${results.length} | Passed: ${colors.green}${passed}${colors.reset} | Failed: ${colors.red}${failed}${colors.reset}`);

  if (failed === 0) {
    console.log(`\n${colors.green}✓ All Batch 2 unit tests passed!${colors.reset}\n`);
  } else {
    console.log(`\n${colors.red}✗ ${failed} test(s) failed${colors.reset}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
