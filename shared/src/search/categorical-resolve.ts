// SPDX-License-Identifier: Apache-2.0
import { FORMAT_NAMES, GAME_NAMES, RARITY_FROM_STRING, FRAME_NAMES } from "../bits";
import { normalizeAlphanumeric } from "../normalize";
import { SORT_FIELDS } from "./sort-fields";
import { IS_KEYWORDS, IS_PREFIX_VOCABULARY } from "./eval-is";

/**
 * Type-line words users often put after `is:` by mistake (`not:creature`, `is:instant`).
 * If there is no exact `is:` keyword for the normalized query, do not treat these as a
 * prefix of longer `is:` tokens (e.g. `creature` → `creatureland`).
 */
const IS_VALUE_TYPE_LINE_FALSE_POSITIVE = new Set([
  "creature", "instant", "sorcery", "artifact", "enchantment", "planeswalker",
  "battle", "tribal", "legendary", "world", "snow", "dungeon", "vehicle",
  "background", "kindred",
]);

/** Build-time view modes (Spec 058). */
const VIEW_MODES = ["slim", "detail", "images", "full"] as const;

/** Scryfall display: values map to view modes (Spec 107). */
const DISPLAY_TO_VIEW: Record<string, string> = {
  checklist: "slim",
  text: "detail",
  grid: "images",
  full: "full",
};

const UNIQUE_MODES = ["cards", "prints", "art"] as const;
const INCLUDE_VALUES = ["extras"] as const;

/** Runtime data needed for set, in, otag, atag, kw/keyword resolution. */
export interface ResolutionContext {
  knownSetCodes?: Set<string>;
  /** Distinct non-empty lowercase set types from printings `set_lookup` (Spec 179). */
  knownSetTypes?: Set<string>;
  oracleTagLabels?: string[];
  illustrationTagLabels?: string[];
  keywordLabels?: string[];
}

/**
 * Normalize a string for prefix matching: accent folding, lowercase, alphanumeric only.
 * E.g. "9ED" and "9 ed" both become "9ed"; "Glóin" becomes "gloin".
 */
export function normalizeForResolution(s: string): string {
  return normalizeAlphanumeric(s);
}

/**
 * Resolve typed value to single matching candidate when exactly one matches.
 * @param typed - The value as typed by the user
 * @param candidates - Iterable of valid values for this field
 * @returns The single matching candidate, or null if 0 or 2+ matches
 */
export function resolveCategoricalValue(
  typed: string,
  candidates: Iterable<string>,
  normalize: (s: string) => string = normalizeForResolution,
): string | null {
  const normTyped = normalize(typed);
  const matches: string[] = [];
  for (const c of candidates) {
    if (normalize(c).startsWith(normTyped)) matches.push(c);
  }
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * Spec 032: expand `is:` / `not:` value to all matching vocabulary keywords.
 * @returns `null` if trimmed value is empty (match all in domain).
 * @returns `[]` if non-empty but no keyword matches (`unknown keyword`).
 */
export function expandIsKeywordsFromPrefix(value: string): string[] | null {
  const t = value.trim();
  if (t === "") return null;
  const normTyped = normalizeForResolution(t);
  const exact: string[] = [];
  for (const kw of IS_PREFIX_VOCABULARY) {
    if (normalizeForResolution(kw) === normTyped) exact.push(kw);
  }
  if (exact.length > 0) {
    exact.sort();
    return exact;
  }
  if (IS_VALUE_TYPE_LINE_FALSE_POSITIVE.has(normTyped)) {
    return [];
  }
  const matches: string[] = [];
  for (const kw of IS_PREFIX_VOCABULARY) {
    if (normalizeForResolution(kw).startsWith(normTyped)) matches.push(kw);
  }
  matches.sort();
  return matches;
}

const CATEGORICAL_FIELDS = new Set([
  "view", "display", "unique", "sort", "order", "include",
  "legal", "f", "format", "banned", "restricted",
  "rarity", "r", "game", "frame", "is", "not",
  "set", "set_type", "st", "in", "otag", "atag", "kw", "keyword",
]);

function getCandidatesForField(
  canonical: string,
  context?: ResolutionContext,
): Iterable<string> | null {
  switch (canonical) {
    case "view":
      return VIEW_MODES;
    case "display":
      return ["checklist", "text", "grid", "full"];
    case "order":
    case "sort":
      return Object.keys(SORT_FIELDS);
    case "unique":
      return UNIQUE_MODES;
    case "include":
      return INCLUDE_VALUES;
    case "legal":
    case "f":
    case "format":
    case "banned":
    case "restricted":
      return Object.keys(FORMAT_NAMES);
    case "rarity":
    case "r":
      return Object.keys(RARITY_FROM_STRING);
    case "game":
      return Object.keys(GAME_NAMES);
    case "frame":
      return Object.keys(FRAME_NAMES);
    case "is":
    case "not":
      return IS_KEYWORDS;
    case "set":
      return context?.knownSetCodes ?? null;
    case "set_type":
      return context?.knownSetTypes ?? null;
    case "in": {
      if (!context?.knownSetCodes) return null;
      const games = Object.keys(GAME_NAMES);
      const sets = Array.from(context.knownSetCodes);
      const rarities = Object.keys(RARITY_FROM_STRING);
      return [...games, ...sets, ...rarities];
    }
    case "otag":
      return context?.oracleTagLabels ?? null;
    case "atag":
      return context?.illustrationTagLabels ?? null;
    case "kw":
    case "keyword":
      return context?.keywordLabels ?? null;
    default:
      return null;
  }
}

/**
 * Resolve a categorical field value. For build-time fields, context is optional.
 * For runtime fields (set, in, otag, atag, kw, keyword), context is required; when absent,
 * returns the typed value as-is (no resolution).
 *
 * For non-categorical fields, returns the value unchanged.
 */
export function resolveForField(
  field: string,
  value: string,
  context?: ResolutionContext,
): string {
  const canonical = field.toLowerCase();
  if (canonical === "v") return resolveForField("view", value, context);
  if (canonical === "display") {
    const mapped = DISPLAY_TO_VIEW[value.toLowerCase()] ?? value;
    return resolveForField("view", mapped, context);
  }
  if (canonical === "order") return resolveForField("sort", value, context);
  if (canonical === "st") return resolveForField("set_type", value, context);

  if (!CATEGORICAL_FIELDS.has(canonical)) return value;

  const candidates = getCandidatesForField(canonical, context);
  if (!candidates) return value;

  const resolved = resolveCategoricalValue(value, candidates);
  return resolved ?? value;
}
