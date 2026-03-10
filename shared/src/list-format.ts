// SPDX-License-Identifier: Apache-2.0
import { ListTokenType } from "./list-lexer";
import type { ListToken } from "./list-lexer";

export type DeckFormat =
  | "arena"
  | "moxfield"
  | "archidekt"
  | "mtggoldfish"
  | "melee"
  | "tappedout";

const ARCHIDEKT_TOKENS: ReadonlySet<string> = new Set([
  ListTokenType.CATEGORY,
  ListTokenType.CATEGORY_TAG,
  ListTokenType.COLLECTION_STATUS_TEXT,
]);

const MOXFIELD_TOKENS: ReadonlySet<string> = new Set([
  ListTokenType.FOIL_MARKER,
  ListTokenType.ALTER_MARKER,
  ListTokenType.ETCHED_MARKER,
]);

const MTGGOLDFISH_TOKENS: ReadonlySet<string> = new Set([
  ListTokenType.VARIANT,
  ListTokenType.SET_CODE_BRACKET,
  ListTokenType.FOIL_PAREN,
  ListTokenType.ETCHED_PAREN,
]);

const MELEE_HEADERS: ReadonlySet<string> = new Set([
  "maindeck",
  "main deck",
]);

const TAPPEDOUT_TOKENS: ReadonlySet<string> = new Set([
  ListTokenType.HASH_TAG,
  ListTokenType.ROLE_MARKER,
  ListTokenType.FOIL_PRERELEASE_MARKER,
]);

/**
 * Examine a token stream for format-discriminating tokens and return the
 * detected deck list format using a "most-specific wins" heuristic.
 *
 * Returns null when detection is ambiguous (no format-specific tokens, or
 * conflicting tokens from multiple formats).
 */
export function detectDeckFormat(tokens: ListToken[]): DeckFormat | null {
  let hasArchidekt = false;
  let hasMoxfield = false;
  let hasMtggoldfish = false;
  let hasMelee = false;
  let hasTappedOut = false;
  let hasSectionHeader = false;

  for (const tok of tokens) {
    if (TAPPEDOUT_TOKENS.has(tok.type)) hasTappedOut = true;
    else if (
      (tok.type === ListTokenType.FOIL_MARKER || tok.type === ListTokenType.ETCHED_MARKER) &&
      /\*[fe]|\*f-/.test(tok.value)
    ) {
      // TappedOut uses *f*, *f-etch*, *e* (lowercase); Moxfield uses *F*, *E*
      hasTappedOut = true;
    } else if (ARCHIDEKT_TOKENS.has(tok.type)) hasArchidekt = true;
    else if (MOXFIELD_TOKENS.has(tok.type)) hasMoxfield = true;
    else if (MTGGOLDFISH_TOKENS.has(tok.type)) hasMtggoldfish = true;
    else if (tok.type === ListTokenType.SECTION_HEADER) {
      hasSectionHeader = true;
      if (MELEE_HEADERS.has(tok.value.toLowerCase())) hasMelee = true;
    }
  }

  const specifics = [hasTappedOut, hasArchidekt, hasMoxfield, hasMtggoldfish].filter(Boolean);
  if (specifics.length > 1) return null;

  if (hasTappedOut) return "tappedout";
  if (hasArchidekt) return "archidekt";
  if (hasMoxfield) return "moxfield";
  if (hasMtggoldfish) return "mtggoldfish";
  if (hasMelee) return "melee";
  if (hasSectionHeader) return "arena";

  return null;
}
