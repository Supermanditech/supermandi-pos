export type NormalizedScan = {
  code_type: string;
  normalized_value: string;
  metadata?: {
    batch?: string;
    expiry?: string;
    serial?: string;
  };
};

const GS = "\x1D";
const GS1_PREFIXES = ["]C1", "]d2", "]Q3", "]e0"];

const FORMAT_CODE_TYPES: Array<[RegExp, string]> = [
  [/^gs1/i, "GS1"],
  [/^ean([_-]?(8|13))?$/i, "EAN"],
  [/^upc([_-]?(a|e))?$/i, "UPC"],
  [/^itf([_-]?14)?$/i, "EAN"],
  [/^code[_-]?128$/i, "CODE128"],
  [/^qr$/i, "QR"],
  [/^data[_-]?matrix$/i, "DATAMATRIX"]
];

const FIXED_AI_LENGTHS: Record<string, number> = {
  "01": 14,
  "11": 6,
  "15": 6,
  "17": 6
};

const VARIABLE_AI_MAX: Record<string, number> = {
  "10": 20,
  "21": 20
};

function normalizeFormat(format: string | null | undefined): string {
  return String(format ?? "").trim().toLowerCase();
}

function resolveCodeType(format: string | null | undefined): string {
  const normalized = normalizeFormat(format);
  for (const [pattern, codeType] of FORMAT_CODE_TYPES) {
    if (pattern.test(normalized)) {
      return codeType;
    }
  }
  return normalized ? normalized.toUpperCase() : "UNKNOWN";
}

function resolveTextCodeType(format: string | null | undefined): string {
  const baseType = resolveCodeType(format);
  if (baseType === "QR") return "QR_TEXT";
  if (baseType === "CODE128") return "CODE128_TEXT";
  if (baseType === "DATAMATRIX") return "DATAMATRIX_TEXT";
  return "UNKNOWN_TEXT";
}

function normalizeTextValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutControls = trimmed.replace(/[\x00-\x1F\x7F]/g, "");
  const cleaned = withoutControls.trim();
  return cleaned ? cleaned : null;
}

function stripGs1Prefix(value: string): string {
  for (const prefix of GS1_PREFIXES) {
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }
  return value;
}

function splitOnGroupSeparator(value: string): string {
  const index = value.indexOf(GS);
  if (index === -1) return value;
  return value.slice(0, index);
}

function normalizeGtin(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 14) return digits;
  if (digits.length === 13) return `0${digits}`;
  if (digits.length === 12) return `00${digits}`;
  if (digits.length === 8) return digits.padStart(14, "0");
  return null;
}

function expandUpcE(upcE: string): string | null {
  const digits = upcE.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const numberSystem = digits[0];
  const d1 = digits[1];
  const d2 = digits[2];
  const d3 = digits[3];
  const d4 = digits[4];
  const d5 = digits[5];
  const d6 = digits[6];
  const check = digits[7];

  let upcA = "";
  if (d6 === "0" || d6 === "1" || d6 === "2") {
    upcA = `${numberSystem}${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  } else if (d6 === "3") {
    upcA = `${numberSystem}${d1}${d2}${d3}00000${d4}${d5}`;
  } else if (d6 === "4") {
    upcA = `${numberSystem}${d1}${d2}${d3}${d4}00000${d5}`;
  } else {
    upcA = `${numberSystem}${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  }

  return `${upcA}${check}`;
}

function extractGs1Elements(raw: string): Record<string, string> | null {
  const trimmed = stripGs1Prefix(raw.trim());
  if (!trimmed) return null;

  const elements: Record<string, string> = {};

  if (trimmed.includes("(") && trimmed.includes(")")) {
    const pattern = /\((\d{2,4})\)/g;
    const matches: Array<{ ai: string; start: number; end: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(trimmed)) !== null) {
      matches.push({ ai: match[1], start: match.index, end: pattern.lastIndex });
    }

    for (let i = 0; i < matches.length; i += 1) {
      const current = matches[i];
      const next = matches[i + 1];
      const valueStart = current.end;
      const valueEnd = next ? next.start : trimmed.length;
      const rawValue = splitOnGroupSeparator(trimmed.slice(valueStart, valueEnd));
      if (rawValue) {
        elements[current.ai] = rawValue;
      }
    }

    return Object.keys(elements).length ? elements : null;
  }

  let index = 0;
  while (index < trimmed.length) {
    const ai2 = trimmed.slice(index, index + 2);
    const fixedLength = FIXED_AI_LENGTHS[ai2];
    if (fixedLength) {
      const valueStart = index + 2;
      const valueEnd = valueStart + fixedLength;
      if (valueEnd > trimmed.length) break;
      elements[ai2] = trimmed.slice(valueStart, valueEnd);
      index = valueEnd;
      continue;
    }

    const variableLength = VARIABLE_AI_MAX[ai2];
    if (variableLength) {
      const valueStart = index + 2;
      const remaining = trimmed.slice(valueStart);
      const groupIndex = remaining.indexOf(GS);
      const cap = groupIndex === -1 ? Math.min(remaining.length, variableLength) : groupIndex;
      elements[ai2] = remaining.slice(0, cap);
      index = valueStart + cap;
      if (groupIndex !== -1 && index < trimmed.length && trimmed[index] === GS) {
        index += 1;
      }
      continue;
    }

    break;
  }

  return Object.keys(elements).length ? elements : null;
}

function maybeNormalizeGs1(format: string | null | undefined, scannedText: string): NormalizedScan | null {
  const raw = scannedText.trim();
  if (!raw) return null;

  const formatHint = normalizeFormat(format);
  const looksGs1 =
    formatHint.includes("gs1") ||
    raw.startsWith("]") ||
    raw.includes("(") ||
    raw.includes(GS) ||
    (raw.startsWith("01") && raw.length >= 16);

  if (!looksGs1) return null;

  const elements = extractGs1Elements(raw);
  if (!elements?.["01"]) return null;

  const gtin = normalizeGtin(elements["01"]);
  if (!gtin) return null;

  const metadata: NormalizedScan["metadata"] = {};
  if (elements["10"]) metadata.batch = elements["10"];
  if (elements["17"]) metadata.expiry = elements["17"];
  if (!metadata.expiry && elements["15"]) metadata.expiry = elements["15"];
  if (elements["21"]) metadata.serial = elements["21"];

  return {
    code_type: "GS1",
    normalized_value: gtin,
    metadata: Object.keys(metadata).length ? metadata : undefined
  };
}

export function normalizeScan(
  format: string | null | undefined,
  scannedText: string
): NormalizedScan | null {
  const raw = scannedText.trim();
  if (!raw) return null;

  const gs1 = maybeNormalizeGs1(format, raw);
  if (gs1) return gs1;

  const normalizedFormat = normalizeFormat(format);
  const codeType = resolveCodeType(format);
  const digitsOnly = raw.replace(/\D/g, "");

  if (digitsOnly && digitsOnly.length >= 8 && digitsOnly.length <= 14) {
    if (normalizedFormat === "upc_e" || normalizedFormat === "upc-e") {
      const expanded = expandUpcE(digitsOnly);
      const gtin = expanded ? normalizeGtin(expanded) : normalizeGtin(digitsOnly);
      if (gtin) {
        return { code_type: codeType, normalized_value: gtin };
      }
    }

    const gtin = normalizeGtin(digitsOnly);
    if (gtin) {
      return { code_type: codeType, normalized_value: gtin };
    }
  }

  const textValue = normalizeTextValue(raw);
  if (!textValue) return null;

  return {
    code_type: resolveTextCodeType(format),
    normalized_value: textValue
  };
}
