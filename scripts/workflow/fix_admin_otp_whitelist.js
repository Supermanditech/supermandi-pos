// fix_admin_otp_whitelist.js
// P1-5: ADMIN-OTP-NO-WHITELIST
// 1. Add ADMIN_EMAIL_ALLOWLIST check before generating/sending OTP
// 2. Bump OTP from 6 to 8 digits (stronger brute-force resistance)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../backend/src/routes/v1/admin/adminOtp.ts');
let content = fs.readFileSync(filePath, 'utf8');

const wasCRLF = content.includes('\r\n');
if (wasCRLF) content = content.replace(/\r\n/g, '\n');

let errorCount = 0;

function replace(label, oldStr, newStr) {
  const before = content;
  content = content.split(oldStr).join(newStr);
  if (content !== before) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ MISSED: ${label}`);
    errorCount++;
  }
}

// 1. Add allowlist constant + helper after the last import line
replace(
  'Add ADMIN_EMAIL_ALLOWLIST constant after imports',
  'export const adminOtpRouter = Router();\n',
  'export const adminOtpRouter = Router();\n\n' +
  '// P1-5: Admin email allowlist — same env var as adminAuth.ts\n' +
  '// OTP requests are only honoured for emails in this list\n' +
  'const ADMIN_EMAIL_ALLOWLIST = (process.env.ADMIN_EMAIL_ALLOWLIST || \'\')\n' +
  '  .split(\',\')\n' +
  '  .map((e: string) => e.trim().toLowerCase())\n' +
  '  .filter(Boolean);\n\n' +
  'function isAdminEmailAllowed(email: string): boolean {\n' +
  '  // Fail-safe: if no allowlist configured, block all OTP requests\n' +
  '  if (ADMIN_EMAIL_ALLOWLIST.length === 0) return false;\n' +
  '  return ADMIN_EMAIL_ALLOWLIST.includes(email.toLowerCase().trim());\n' +
  '}\n'
);

// 2. Add whitelist check in POST /otp/request after email validation
// The existing flow: validate email format → rate limit → generate OTP
// Inserting: validate email format → whitelist check → rate limit → generate OTP
replace(
  'Add whitelist check in POST /otp/request',
  '  if (!purpose) {\n' +
  '    return res.status(400).json({ error: "purpose_required" });\n' +
  '  }\n\n' +
  '  // T1-002: Rate limiting',
  '  if (!purpose) {\n' +
  '    return res.status(400).json({ error: "purpose_required" });\n' +
  '  }\n\n' +
  '  // P1-5: Whitelist check — only allowlisted admins may request OTP\n' +
  '  if (!isAdminEmailAllowed(email.trim())) {\n' +
  '    log.warn(`[GL-CRIT-0053] OTP request rejected — email not in admin allowlist: ${email}`);\n' +
  '    return res.status(403).json({ error: "not_authorized", message: "This email is not authorized for admin operations" });\n' +
  '  }\n\n' +
  '  // T1-002: Rate limiting'
);

// 3. Bump OTP from 6 to 8 digits for stronger brute-force resistance
replace(
  'Bump OTP from 6 to 8 digits',
  'return crypto.randomInt(100000, 999999).toString();',
  'return crypto.randomInt(10000000, 99999999).toString();'
);

if (wasCRLF) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, content, 'utf8');

console.log('');
if (errorCount === 0) {
  console.log('SUCCESS');
} else {
  console.error(`FAILED — ${errorCount} miss(es)`);
  process.exit(1);
}
