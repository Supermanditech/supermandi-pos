// FIX-SUPPLIER-UUID: Script to patch enroll-service.js
// Fixes GO-LIVE BLOCKER: Supplier Products endpoint crashes on non-UUID ID

const fs = require('fs');
const path = require('path');

const origFile = '/tmp/enroll-service-orig.js';
const fixedFile = '/tmp/enroll-service-fixed.js';

const content = fs.readFileSync(origFile, 'utf8');
const lines = content.split('\n');

// UUID validation function to insert after line 10
const uuidValidatorCode = `
// UUID validation helper - GO-LIVE FIX
function isValidUUID(value) {
  if (!value || typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
`;

// Validation check to insert after "const supplierId = req.params.id;"
const validationCheck = `
    // GO-LIVE FIX: Validate UUID format before hitting DB
    if (!isValidUUID(supplierId)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_SUPPLIER_ID", message: "supplierId must be a valid UUID" }
      });
    }
`;

let result = [];
let addedValidator = false;
let addedCheck = false;

for (let i = 0; i < lines.length; i++) {
  result.push(lines[i]);

  // After line 10 (0-indexed: line 9), add UUID validator
  if (i === 9 && !addedValidator) {
    result.push(uuidValidatorCode);
    addedValidator = true;
    console.log('Added UUID validation function after line 10');
  }

  // After "const supplierId = req.params.id;" line, add validation check
  if (lines[i].includes('const supplierId = req.params.id;') && !addedCheck) {
    result.push(validationCheck);
    addedCheck = true;
    console.log('Added INVALID_SUPPLIER_ID validation check');
  }
}

const fixedContent = result.join('\n');
fs.writeFileSync(fixedFile, fixedContent, 'utf8');

console.log(`Fixed file written to: ${fixedFile}`);
console.log(`Original lines: ${lines.length}`);
console.log(`Fixed lines: ${result.join('\n').split('\n').length}`);
console.log('');
console.log('Verification:');
console.log('- UUID function added:', addedValidator);
console.log('- Validation check added:', addedCheck);
