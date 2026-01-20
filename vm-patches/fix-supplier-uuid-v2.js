// FIX-SUPPLIER-UUID-V2: Script to patch enroll-service.js
// Fixes GO-LIVE BLOCKER: Supplier Products endpoint crashes on non-UUID ID
// This version targets ONLY the /suppliers/:id/products route

const fs = require('fs');

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

// Validation check to insert in the supplier products route
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
let inSupplierProductsRoute = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  result.push(line);

  // After line 10 (0-indexed: line 9), add UUID validator
  if (i === 9 && !addedValidator) {
    result.push(uuidValidatorCode);
    addedValidator = true;
    console.log('Added UUID validation function after line 10');
  }

  // Detect when we enter the /suppliers/:id/products route
  if (line.includes('"/suppliers/:id/products"') && line.includes('app.get')) {
    inSupplierProductsRoute = true;
    console.log(`Found /suppliers/:id/products route at line ${i + 1}`);
  }

  // Add validation check ONLY in the supplier products route
  if (inSupplierProductsRoute && line.includes('const supplierId = req.params.id;') && !addedCheck) {
    result.push(validationCheck);
    addedCheck = true;
    inSupplierProductsRoute = false; // Reset flag
    console.log(`Added INVALID_SUPPLIER_ID validation at line ${i + 1}`);
  }
}

const fixedContent = result.join('\n');
fs.writeFileSync(fixedFile, fixedContent, 'utf8');

console.log(`\nFixed file written to: ${fixedFile}`);
console.log(`Original lines: ${lines.length}`);
console.log(`Fixed lines: ${fixedContent.split('\n').length}`);
console.log('');
console.log('Verification:');
console.log('- UUID function added:', addedValidator);
console.log('- Validation check added:', addedCheck);
