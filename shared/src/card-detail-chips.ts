// SPDX-License-Identifier: Apache-2.0

const SPLIT_RE = /[\s\u2014]+/;

/**
 * Tokenize a type line for `t:` query chips. Splits on whitespace and the
 * em-dash (U+2014) separator; trims; drops empties; lowercases each token.
 */
export function tokenizeTypeLine(typeLine: string): string[] {
  if (!typeLine) return [];
  return typeLine
    .split(SPLIT_RE)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

/**
 * Convert a card mana cost string (e.g. `{3}{R}{R}`) to the compact `m=`
 * query value accepted by the parser. Empty cost maps to `"null"` per Spec 136.
 * Simple symbols drop braces; hybrids (containing `/`) keep braces.
 */
export function manaCostToCompactQuery(cost: string): string {
  if (!cost) return "null";
  let result = "";
  let i = 0;
  while (i < cost.length) {
    if (cost[i] === "{") {
      const close = cost.indexOf("}", i);
      if (close === -1) break;
      const content = cost.slice(i + 1, close);
      if (content.includes("/")) {
        result += `{${content.toLowerCase()}}`;
      } else {
        result += content.toLowerCase();
      }
      i = close + 1;
    } else {
      result += cost[i]!.toLowerCase();
      i++;
    }
  }
  return result;
}

const WUBRG: [number, string][] = [
  [1, "w"],
  [2, "u"],
  [4, "b"],
  [8, "r"],
  [16, "g"],
];

/**
 * Convert a 5-bit color bitmask to the WUBRG letter sequence for `c:` or `ci:`
 * query fragments. Returns `"c"` for colorless (mask 0).
 */
export function colorBitmaskToQueryLetters(mask: number): string {
  if (mask === 0) return "c";
  return WUBRG.filter(([bit]) => mask & bit)
    .map(([, ch]) => ch)
    .join("");
}

const WUBRG_DISPLAY: [number, string][] = [
  [1, "W"],
  [2, "U"],
  [4, "B"],
  [8, "R"],
  [16, "G"],
];

/**
 * Braced mana string for `ManaCost` UI (color identity and per-face **Color** rows).
 * WUBRG order matches {@link colorBitmaskToQueryLetters}. Colorless (mask 0) → `{C}`.
 */
export function colorIdentityMaskToManaCostString(mask: number): string {
  if (mask === 0) return "{C}";
  return WUBRG_DISPLAY.filter(([bit]) => mask & bit)
    .map(([, ch]) => `{${ch}}`)
    .join("");
}

/**
 * True when every indexed face has the same `DisplayColumns.colors` bitmask.
 * Used for Spec 183: hoist a single **Color** (`c:`) row to the oracle / combined
 * panel for multi-faced cards when face colors match after ETL/broadcast.
 *
 * Empty `faceIndices` is treated as vacuously uniform (`true`).
 */
export function faceColorMasksUniform(
  colors: readonly number[],
  faceIndices: readonly number[],
): boolean {
  if (faceIndices.length === 0) return true;
  const first = colors[faceIndices[0]!];
  for (let i = 1; i < faceIndices.length; i++) {
    if (colors[faceIndices[i]!] !== first) return false;
  }
  return true;
}

/**
 * Build the `kw:` query fragment for a card-detail keyword chip (Spec 183).
 * Multi-word Oracle keywords must be quoted so the lexer keeps one FIELD value
 * after `:` (Spec 002 § Whitespace and field clauses).
 */
export function keywordAbilityToKwChipQuery(keyword: string): string {
  if (/\s/.test(keyword)) {
    return `kw:"${keyword.replace(/"/g, '\\"')}"`;
  }
  return `kw:${keyword}`;
}
