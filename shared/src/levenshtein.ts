// SPDX-License-Identifier: Apache-2.0

/**
 * Levenshtein (edit) distance between two strings.
 * Values exceeding maxDistance are capped at maxDistance + 1 to avoid full computation.
 * Use Infinity when no cap is desired.
 */
export function levenshteinDistance(
  a: string,
  b: string,
  maxDistance: number = 5,
): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n <= maxDistance ? n : maxDistance + 1;
  if (n === 0) return m <= maxDistance ? m : maxDistance + 1;
  const cap = (v: number) =>
    maxDistance !== Infinity && v > maxDistance ? maxDistance + 1 : v;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = cap(j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = cap(i);
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = cap(
        Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost),
      );
      prev = dp[j];
      dp[j] = next;
    }
  }
  return dp[n]!;
}
