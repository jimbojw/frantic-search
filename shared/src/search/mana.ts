// SPDX-License-Identifier: Apache-2.0

/**
 * Parse a mana cost string (card or query) into a symbol → count map.
 *
 * Braced symbols like `{R}`, `{B/P}`, `{2/W}` are treated as atomic keys.
 * Braced pure integers (`{2}`, `{10}`) contribute their numeric value to
 * the `"generic"` key. Bare characters outside braces are treated as
 * individual symbols; consecutive bare digits are grouped into a single
 * generic value.
 */
export function parseManaSymbols(cost: string): Record<string, number> {
  const map: Record<string, number> = {};
  let i = 0;

  while (i < cost.length) {
    if (cost[i] === "{") {
      const close = cost.indexOf("}", i);
      if (close === -1) {
        // Unclosed brace — treat remaining characters as bare
        for (let j = i + 1; j < cost.length; j++) {
          addBareChar(map, cost[j]);
        }
        break;
      }
      const content = cost.slice(i + 1, close).toLowerCase();
      const asInt = parseNonNegInt(content);
      if (asInt !== null) {
        addGeneric(map, asInt);
      } else {
        map[content] = (map[content] ?? 0) + 1;
      }
      i = close + 1;
    } else if (isDigit(cost[i])) {
      let end = i + 1;
      while (end < cost.length && isDigit(cost[end])) end++;
      addGeneric(map, parseInt(cost.slice(i, end), 10));
      i = end;
    } else {
      addBareChar(map, cost[i]);
      i++;
    }
  }

  return map;
}

/**
 * Returns true if `card` has at least as many of every symbol as `query`.
 * Keys absent from `card` are treated as 0.
 */
export function manaContains(
  card: Record<string, number>,
  query: Record<string, number>,
): boolean {
  for (const key in query) {
    if ((card[key] ?? 0) < query[key]) return false;
  }
  return true;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function parseNonNegInt(s: string): number | null {
  if (s.length === 0) return null;
  for (let i = 0; i < s.length; i++) {
    if (!isDigit(s[i])) return null;
  }
  return parseInt(s, 10);
}

function addGeneric(map: Record<string, number>, value: number): void {
  if (value > 0) {
    map.generic = (map.generic ?? 0) + value;
  }
}

function addBareChar(map: Record<string, number>, ch: string): void {
  const key = ch.toLowerCase();
  map[key] = (map[key] ?? 0) + 1;
}
