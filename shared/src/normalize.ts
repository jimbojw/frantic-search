// SPDX-License-Identifier: Apache-2.0

/**
 * Map visually confusable characters to their Latin equivalents.
 * Used before normalizeAlphanumeric for deck-list name matching (Spec 114 § 3g).
 * Curated subset for MTG card names; e.g. Greek omicron ο/ό → Latin o.
 */
const LOOKALIKE_MAP: Record<string, string> = {
  "\u03B1": "a", // Greek alpha
  "\u03B2": "b", // Greek beta
  "\u03BF": "o", // Greek omicron
  "\u03CC": "o", // Greek omicron with tonos (ό)
  "\u0435": "e", // Cyrillic ie (looks like Latin e)
  "\u043E": "o", // Cyrillic o
};

export function normalizeForLookalikes(s: string): string {
  return [...s].map((c) => LOOKALIKE_MAP[c] ?? c).join("");
}

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
