// ============================================
// BATCH 1 DEVTOOLS SNIPPETS (PRODUCTION)
// Domain: https://supermandi.tech
// Copy-paste this entire block into Chrome DevTools Console
// ============================================

// ------------------------------------------
// JWT Decoder
// ------------------------------------------
window.decodeJWT = function(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { error: 'Invalid JWT format' };
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    const exp = payload.exp ? new Date(payload.exp * 1000) : null;
    const iat = payload.iat ? new Date(payload.iat * 1000) : null;
    return { payload, issued: iat, expires: exp, isExpired: exp ? exp < new Date() : null };
  } catch(e) { return { error: e.message }; }
};
console.log('✓ JWT decoder loaded');

// ------------------------------------------
// Storage Audit
// ------------------------------------------
function auditStorage() {
  console.log('\n=== STORAGE AUDIT ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('URL:', location.href);
  console.log('Total keys:', Object.keys(localStorage).length);
  console.log('---');
  const data = [];
  Object.keys(localStorage).sort().forEach(k => {
    const v = localStorage.getItem(k);
    const preview = v ? (v.length > 50 ? v.slice(0,30) + '...' + v.slice(-15) : v) : 'null';
    data.push({ key: k, value: preview, length: v ? v.length : 0 });
  });
  console.table(data);
  return data;
}
console.log('✓ auditStorage() loaded');

// ------------------------------------------
// Retailer Token Check
// ------------------------------------------
function checkRetailerAuth() {
  console.log('\n=== RETAILER AUTH CHECK ===');
  const activeStore = localStorage.getItem('retailer_active_store_id');
  console.log('Active Store ID:', activeStore || 'NONE');
  if (!activeStore) {
    console.log('Status: NOT AUTHENTICATED');
    return { authenticated: false };
  }
  const token = localStorage.getItem(`retailer_${activeStore}_token`);
  const refresh = localStorage.getItem(`retailer_${activeStore}_refresh_token`);
  const user = localStorage.getItem(`retailer_${activeStore}_user`);
  console.log('Token:', token ? 'PRESENT' : 'MISSING');
  console.log('Refresh Token:', refresh ? 'PRESENT' : 'MISSING');
  console.log('User Data:', user ? 'PRESENT' : 'MISSING');
  if (token) {
    const decoded = decodeJWT(token);
    console.log('Token Expires:', decoded.expires);
    console.log('Time Left:', decoded.expires ? Math.round((decoded.expires - new Date()) / 1000 / 60) + ' minutes' : 'N/A');
    console.log('Is Expired:', decoded.isExpired);
    console.log('Token Hash (last 20):', token.slice(-20));
  }
  return { authenticated: !!token, storeId: activeStore, hasRefresh: !!refresh, hasUser: !!user };
}
console.log('✓ checkRetailerAuth() loaded');

// ------------------------------------------
// Supplier Token Check
// ------------------------------------------
function checkSupplierAuth() {
  console.log('\n=== SUPPLIER AUTH CHECK ===');
  const token = localStorage.getItem('supplier_token');
  const lastActivity = localStorage.getItem('supplier_last_activity');
  console.log('Token:', token ? 'PRESENT' : 'MISSING');
  console.log('Last Activity:', lastActivity || 'NONE');
  if (token) {
    const decoded = decodeJWT(token);
    console.log('Token Expires:', decoded.expires);
    console.log('Is Expired:', decoded.isExpired);
  }
  return { authenticated: !!token, lastActivity };
}
console.log('✓ checkSupplierAuth() loaded');

// ------------------------------------------
// Firebase Check
// ------------------------------------------
function checkFirebase() {
  console.log('\n=== FIREBASE CHECK ===');
  const hasFirebase = typeof firebase !== 'undefined';
  const hasFirebaseAuth = typeof firebaseAuth !== 'undefined' || (typeof firebase !== 'undefined' && firebase.auth);
  const hasRecaptcha = typeof grecaptcha !== 'undefined';
  console.log('Firebase SDK:', hasFirebase ? 'LOADED' : 'NOT FOUND');
  console.log('Firebase Auth:', hasFirebaseAuth ? 'LOADED' : 'NOT FOUND');
  console.log('reCAPTCHA:', hasRecaptcha ? 'LOADED' : 'NOT FOUND');
  console.log('\n--- Check for RED errors above this line ---');
  return { firebase: hasFirebase, auth: hasFirebaseAuth, recaptcha: hasRecaptcha };
}
console.log('✓ checkFirebase() loaded');

// ------------------------------------------
// Logout Verification
// ------------------------------------------
function verifyLogout() {
  console.log('\n=== LOGOUT VERIFICATION ===');
  console.log('Current URL:', location.href);
  const retailerKeys = Object.keys(localStorage).filter(k => k.startsWith('retailer_'));
  console.log('Remaining retailer keys:', retailerKeys.length);
  if (retailerKeys.length > 0) {
    console.log('  FAIL - Keys not cleared:', retailerKeys);
  } else {
    console.log('  PASS - All retailer keys cleared');
  }
  const supplierKeys = Object.keys(localStorage).filter(k => k.startsWith('supplier_'));
  console.log('Remaining supplier keys:', supplierKeys.length);
  if (supplierKeys.length > 0) {
    console.log('  FAIL - Keys not cleared:', supplierKeys);
  } else {
    console.log('  PASS - All supplier keys cleared');
  }
  const isOnLogin = location.href.includes('/login');
  console.log('On login page:', isOnLogin ? 'YES - PASS' : 'NO - FAIL');
  return { retailerCleared: retailerKeys.length === 0, supplierCleared: supplierKeys.length === 0, redirectedToLogin: isOnLogin };
}
console.log('✓ verifyLogout() loaded');

// ------------------------------------------
// Network Monitor
// ------------------------------------------
function enableNetworkMonitor() {
  if (window.__networkMonitorEnabled) {
    console.log('Network monitor already enabled');
    return;
  }
  window.__apiCalls = [];
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
    const method = args[1]?.method || 'GET';
    const start = Date.now();
    try {
      const result = await origFetch.apply(this, args);
      window.__apiCalls.push({ time: new Date().toISOString(), method, url: url.substring(0, 100), status: result.status, duration: Date.now() - start });
      if (url.includes('/auth/')) console.log(`🔐 AUTH: ${method} ${url} → ${result.status}`);
      if (url.includes('/refresh')) console.log(`🔄 REFRESH: ${result.status}`);
      return result;
    } catch(e) {
      window.__apiCalls.push({ time: new Date().toISOString(), method, url: url.substring(0, 100), status: 'ERROR', error: e.message });
      throw e;
    }
  };
  window.__networkMonitorEnabled = true;
  console.log('✓ Network monitor enabled');
  console.log('  View: console.table(window.__apiCalls)');
}
console.log('✓ enableNetworkMonitor() loaded');

// ------------------------------------------
// Export Results
// ------------------------------------------
function exportResults() {
  const results = {
    timestamp: new Date().toISOString(),
    url: location.href,
    domain: 'supermandi.tech',
    storage: auditStorage(),
    retailerAuth: checkRetailerAuth(),
    supplierAuth: checkSupplierAuth(),
    firebase: checkFirebase(),
    apiCalls: window.__apiCalls || []
  };
  console.log('\n=== EXPORT DATA ===');
  console.log('Copy the JSON below:');
  console.log(JSON.stringify(results, null, 2));
  if (navigator.clipboard) {
    navigator.clipboard.writeText(JSON.stringify(results, null, 2))
      .then(() => console.log('✓ Copied to clipboard'))
      .catch(() => console.log('Could not copy to clipboard'));
  }
  return results;
}
console.log('✓ exportResults() loaded');

// ------------------------------------------
// ALL LOADED
// ------------------------------------------
console.log('\n========================================');
console.log('ALL SNIPPETS LOADED - supermandi.tech');
console.log('========================================');
console.log('Commands:');
console.log('  auditStorage()       - List all localStorage');
console.log('  checkRetailerAuth()  - Check retailer tokens');
console.log('  checkSupplierAuth()  - Check supplier tokens');
console.log('  checkFirebase()      - Verify Firebase loaded');
console.log('  verifyLogout()       - Confirm logout worked');
console.log('  enableNetworkMonitor() - Track API calls');
console.log('  exportResults()      - Export all data as JSON');
console.log('========================================\n');
