// SA-P2-003: Semantic version comparison utility

/**
 * Compare two semantic version strings.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 * Handles arbitrary segment counts: "1.0" vs "1.0.0" treated as equal.
 * Non-numeric segments are treated as 0.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}
