// SPDX-License-Identifier: Apache-2.0
import { FORMAT_NAMES, GAME_NAMES, RARITY_FROM_STRING, FRAME_NAMES } from "../bits";
import { SORT_FIELDS } from "./sort-fields";
import { IS_KEYWORDS } from "./eval-is";

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
  oracleTagLabels?: string[];
  illustrationTagLabels?: string[];
  keywordLabels?: string[];
}

/**
 * Normalize a string for prefix matching: lowercase, strip non-alphanumeric.
 * E.g. "9ED" and "9 ed" both become "9ed".
 */
export function normalizeForResolution(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
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

const CATEGORICAL_FIELDS = new Set([
  "view", "display", "unique", "sort", "order", "include",
  "legal", "f", "format", "banned", "restricted",
  "rarity", "r", "game", "frame", "is",
  "set", "in", "otag", "atag", "kw", "keyword",
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
      return IS_KEYWORDS;
    case "set":
      return context?.knownSetCodes ?? null;
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

  if (!CATEGORICAL_FIELDS.has(canonical)) return value;

  const candidates = getCandidatesForField(canonical, context);
  if (!candidates) return value;

  const resolved = resolveCategoricalValue(value, candidates);
  return resolved ?? value;
}
