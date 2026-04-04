// SPDX-License-Identifier: Apache-2.0

import { normalizeForResolution } from "./categorical-resolve";

/**
 * Spec 178: Default Search Inclusion Filter constants.
 *
 * Layouts omitted from default search results (extras-layout pass).
 */
export const EXTRAS_LAYOUT_SET = new Set([
  "token",
  "double_faced_token",
  "art_series",
  "vanguard",
]);

/**
 * `is:` keywords that widen the extras-layout omission pass when positive
 * in the AST. Includes the `dfctoken` alias for `double_faced_token`.
 */
export const EXTRAS_LAYOUT_IS_KEYWORDS = new Set([
  "token",
  "double_faced_token",
  "dfctoken",
  "art_series",
  "vanguard",
]);

/**
 * Scryfall `set_type` token omitted by default pass 3a (structural memorabilia).
 * Compared with `normalizeForResolution` on `PrintingIndex.setTypesLower`.
 */
export const DEFAULT_OMIT_SET_TYPE_MEMORABILIA = "memorabilia";

/**
 * Set codes wholesale-omitted from default search (pass 3b) when not already
 * caught by memorabilia pass 3a. Codes here have non-`memorabilia` Scryfall
 * `set_type` but are still hidden on generic Scryfall search — see research doc.
 */
export const DEFAULT_OMIT_SET_CODES = new Set(["past", "hho"]);

/** True if this printing's set type is memorabilia (Spec 178 pass 3a). */
export function isMemorabiliaDefaultOmit(setType: string): boolean {
  const t = normalizeForResolution(setType);
  const m = normalizeForResolution(DEFAULT_OMIT_SET_TYPE_MEMORABILIA);
  return t.length > 0 && t === m;
}

/**
 * Spec 178: per-printing set-code widening vs positive `set:` prefixes and `set=` exacts.
 * `normalizedCode` must be `PrintingIndex.setCodesNormResolved[p]`.
 */
export function isSetCodeWidenedByQuery(
  normalizedCode: string,
  prefixes: readonly string[],
  exacts: readonly string[],
): boolean {
  if (normalizedCode.length === 0) return false;
  for (let i = 0; i < prefixes.length; i++) {
    if (normalizedCode.startsWith(prefixes[i])) return true;
  }
  for (let i = 0; i < exacts.length; i++) {
    if (normalizedCode === exacts[i]) return true;
  }
  return false;
}

/**
 * Spec 178: per-printing set-type widening (prefix + exact lists from AST collectors).
 * `normalizedType` must be `PrintingIndex.setTypesNormResolved[p]`.
 */
export function isSetTypeWidenedByQuery(
  normalizedType: string,
  prefixes: readonly string[],
  exacts: readonly string[],
): boolean {
  if (normalizedType.length === 0) return false;
  for (let i = 0; i < prefixes.length; i++) {
    if (normalizedType.startsWith(prefixes[i])) return true;
  }
  for (let i = 0; i < exacts.length; i++) {
    if (normalizedType === exacts[i]) return true;
  }
  return false;
}

/** Spec 178: normalize `setType` then test prefix list (tests / legacy callers). */
export function isSetTypeWidenedByPrefixes(
  setType: string,
  prefixes: readonly string[],
): boolean {
  return isSetTypeWidenedByQuery(normalizeForResolution(setType), prefixes, []);
}
