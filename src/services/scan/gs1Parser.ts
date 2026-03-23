// GCP-STG-0534: Parse GS1 Application Identifiers from GS1-128/DataMatrix barcodes
// AI (01) = GTIN, (10) = Batch, (17) = Expiry (YYMMDD), (21) = Serial

export function parseGS1(data: string): { gtin?: string; batch?: string; expiry?: string; serial?: string; raw: string } {
  const result: { gtin?: string; batch?: string; expiry?: string; serial?: string; raw: string } = { raw: data };
  // Match AI patterns
  const gtinMatch = data.match(/\(01\)(\d{14})/);
  if (gtinMatch) result.gtin = gtinMatch[1];
  const batchMatch = data.match(/\(10\)([^\x1d(]+)/);
  if (batchMatch) result.batch = batchMatch[1];
  const expiryMatch = data.match(/\(17\)(\d{6})/);
  if (expiryMatch) result.expiry = expiryMatch[1];
  const serialMatch = data.match(/\(21\)([^\x1d(]+)/);
  if (serialMatch) result.serial = serialMatch[1];
  return result;
}

export function extractGTIN(data: string): string | null {
  const parsed = parseGS1(data);
  if (parsed.gtin) {
    // Convert GTIN-14 to EAN-13 by stripping leading 0 if applicable
    if (parsed.gtin.startsWith('0')) return parsed.gtin.slice(1);
    return parsed.gtin;
  }
  return null;
}
