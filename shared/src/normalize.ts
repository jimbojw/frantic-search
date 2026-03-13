// SPDX-License-Identifier: Apache-2.0

/**
 * Normalize a string for search, matching, and resolution: decompose accents
 * (NFD), strip combining diacritics, lowercase, then keep only [a-z0-9].
 * Enables "gloin" to match "Glóin" and "Crème" to match "creme".
 */
export function normalizeAlphanumeric(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Build normalized-key lookup from raw alternate names. ETL outputs raw keys;
 * client normalizes at load time. Collisions: last write wins. */
export function buildNormalizedAlternateIndex<T>(
  raw: Record<string, T>,
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(raw)) {
    const norm = normalizeAlphanumeric(key);
    if (norm) result[norm] = value;
  }
  return result;
}
