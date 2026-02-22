// SPDX-License-Identifier: Apache-2.0

const TILDE_TYPES = [
  "creature", "artifact", "enchantment", "land", "planeswalker",
  "instant", "sorcery", "battle",
  "aura", "equipment", "saga", "vehicle", "scheme", "contraption",
  "spacecraft", "conspiracy", "siege", "door", "class", "mount",
  "emblem", "phenomenon", "case", "attraction", "plane", "room",
  "planet", "dungeon", "boon", "boss",
  "permanent", "spell", "card",
];

const TILDE_PATTERN = new RegExp(
  `\\bthis\\s+(${TILDE_TYPES.join("|")})\\b`,
  "gi",
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeOracleText(
  faceName: string,
  oracleText: string,
): string {
  if (!oracleText) return "";

  let result = oracleText;

  // 1. Replace full face name (case-insensitive, word-boundary)
  const fullPattern = new RegExp(`\\b${escapeRegExp(faceName)}\\b`, "gi");
  result = result.replace(fullPattern, "~");

  // 2. If name contains ",", replace pre-comma short name
  const commaIdx = faceName.indexOf(",");
  if (commaIdx !== -1) {
    const shortName = faceName.slice(0, commaIdx);
    const shortPattern = new RegExp(`\\b${escapeRegExp(shortName)}\\b`, "gi");
    result = result.replace(shortPattern, "~");
  }

  // 3. Replace "this <TYPE>" patterns
  result = result.replace(TILDE_PATTERN, "~");

  if (result === oracleText) return "";
  return result;
}
