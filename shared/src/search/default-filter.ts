// SPDX-License-Identifier: Apache-2.0

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
 * Set codes wholesale-omitted from default search results.
 * A printing in one of these sets is excluded unless set-widened.
 *
 * Includes gold-bordered product lines (WCD, PTC, CE/CEI via 30a, PSSC)
 * which replaced the former NON_TOURNAMENT_MASK GoldBorder pass.
 */
export const DEFAULT_OMIT_SET_CODES = new Set([
  "past", "hho",
  "30a", "ptc", "pssc",
  "wc97", "wc98", "wc99", "wc00", "wc01", "wc02", "wc03", "wc04",
]);
