// SPDX-License-Identifier: Apache-2.0

/**
 * Spec 095 § Equality — whether sorted-array position `pos` (0..n-1) lies in the `field=p%` band.
 */
export function positionInEqualityPercentileBand(pos: number, n: number, p: number): boolean {
  if (n <= 0 || pos < 0 || pos >= n) return false;
  const lo = Math.max(0, p - 0.5);
  const hi = Math.min(100, p + 0.5);
  const start = Math.floor(n * (lo / 100));
  const end = Math.ceil(n * (hi / 100));
  return pos >= start && pos < end;
}

/**
 * Integer percentile label for card-detail chips (`edhrec=p%`, `salt=p%`, `$=p%`) so the equality
 * band includes `pos`. Spec 095 / 183.
 */
export function displayEqualityPercentileLabel(pos: number, n: number): number | null {
  if (n <= 0 || pos < 0 || pos >= n) return null;
  let p = Math.round((100 * (pos + 0.5)) / n);
  p = Math.max(0, Math.min(100, p));
  if (positionInEqualityPercentileBand(pos, n, p)) return p;
  for (let d = 1; d <= 100; d++) {
    const hi = Math.min(100, p + d);
    const lo = Math.max(0, p - d);
    if (positionInEqualityPercentileBand(pos, n, hi)) return hi;
    if (positionInEqualityPercentileBand(pos, n, lo)) return lo;
  }
  return p;
}

/** First index in sortedIndices[0..n) where value === targetIndex, or null. */
export function sortedArrayPosition(
  sortedIndices: Uint32Array,
  n: number,
  targetIndex: number,
): number | null {
  for (let i = 0; i < n; i++) {
    if (sortedIndices[i] === targetIndex) return i;
  }
  return null;
}
