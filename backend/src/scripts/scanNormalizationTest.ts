import assert from "assert";
import { normalizeScan } from "../services/scanNormalization";

type TestCase = {
  format: string | null;
  input: string;
  expectedType: string;
  expectedValue: string;
};

const cases: TestCase[] = [
  {
    format: "qr",
    input: "SM123-RED-500ML",
    expectedType: "QR_TEXT",
    expectedValue: "SM123-RED-500ML"
  },
  {
    format: "qr",
    input: "https://example.com/sku?id=SM123-Red",
    expectedType: "QR_TEXT",
    expectedValue: "https://example.com/sku?id=SM123-Red"
  }
];

for (const testCase of cases) {
  const first = normalizeScan(testCase.format, testCase.input);
  assert(first, "normalizeScan returned null");
  assert.strictEqual(first.code_type, testCase.expectedType);
  assert.strictEqual(first.normalized_value, testCase.expectedValue);

  const second = normalizeScan(testCase.format, testCase.input);
  assert(second, "normalizeScan returned null on repeat");
  assert.strictEqual(second.code_type, testCase.expectedType);
  assert.strictEqual(second.normalized_value, testCase.expectedValue);
  assert.strictEqual(second.normalized_value, first.normalized_value);
}

console.log("scanNormalization tests passed");
