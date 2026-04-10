// SPDX-License-Identifier: Apache-2.0
/**
 * Detect query syntax that Frantic Search accepts but Scryfall does not (Spec 085).
 * Used for analytics `used_extension`; keep aligned with canonicalize / Spec 057 / 061 / 080 / 095 / 099 / 101 / 136.
 */
import type { ASTNode, FieldNode } from "./ast";
import { FIELD_ALIASES } from "./eval-leaves";
import { parseDateRange, isCompleteDateLiteral } from "./date-range";
import { PERCENTILE_RE } from "./eval-printing";
import { PERCENTILE_CAPABLE_FIELDS } from "./sort-fields";
import { isEquatableNullLiteral } from "./null-query-literal";
import { isPlainNumericStatQueryToken } from "./stats";

const DATE_CANONICAL = new Set(["date", "year"]);

/** Face/mana fields where `=null` / `!=null` are stripped in canonicalize (Spec 136); same set as canonicalize.ts */
const NULL_QUERY_VALUE_FACE_FIELDS = new Set(["power", "toughness", "loyalty", "defense", "mana"]);

const STAT_EXTENSION_FIELDS = new Set(["power", "toughness", "loyalty", "defense"]);

function fieldUsesFranticExtension(node: FieldNode): boolean {
  if (node.value === "") return false;
  // Spec 002 / 085: `==` merges to `=` but is Frantic-only vs Scryfall.
  if (node.operatorSynonym === "==") return true;
  // Spec 057 / 085: `**` parses to include:extras but is Frantic-only token; include:extras alone is not extension.
  if (node.sourceText === "**") return true;

  const canonical = FIELD_ALIASES[node.field.toLowerCase()] ?? node.field.toLowerCase();

  if ((canonical === "is" || canonical === "not") && node.operator === "!=") return true;

  if (canonical === "salt") return true;

  if (canonical && PERCENTILE_CAPABLE_FIELDS.has(canonical) && PERCENTILE_RE.test(node.value)) {
    return true;
  }

  const valLower = node.value.trim().toLowerCase();
  if (isEquatableNullLiteral(node.value)) {
    if (canonical === "usd" || canonical === "edhrec") return true;
    if (canonical && STAT_EXTENSION_FIELDS.has(canonical)) return true;
  }
  if (valLower === "null") {
    if (canonical && NULL_QUERY_VALUE_FACE_FIELDS.has(canonical)) return true;
  }

  if (canonical && STAT_EXTENSION_FIELDS.has(canonical)) {
    if (node.sourceText !== undefined) return true;
    const trim = node.value.trim();
    const eqOps = new Set([":", "=", "!="]);
    if (
      trim !== ""
      && !isPlainNumericStatQueryToken(trim)
      && eqOps.has(node.operator)
    ) {
      return true;
    }
  }

  if (!DATE_CANONICAL.has(canonical)) return false;

  const trimmed = node.value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "now" || lower === "today") return false;
  if (/^[a-z0-9]{3,}$/.test(lower) && /[a-z]/.test(lower)) return false;

  if (parseDateRange(node.value, null) === null) return false;
  return !isCompleteDateLiteral(trimmed);
}

/**
 * True if the parsed query AST contains any Frantic-only syntax that would diverge on Scryfall
 * (Spec 085). Does not include `unique:` / spelled-out `include:extras` / `++` / `@@`. `**` counts (sourceText).
 */
export function astUsesFranticExtensionSyntax(node: ASTNode): boolean {
  switch (node.type) {
    case "NOP":
    case "BARE":
    case "EXACT":
      return false;
    case "FIELD":
      return fieldUsesFranticExtension(node);
    case "REGEX_FIELD":
      return false;
    case "NOT":
      return astUsesFranticExtensionSyntax(node.child);
    case "AND":
    case "OR": {
      const ch = node.children;
      for (let i = 0; i < ch.length; i++) {
        if (astUsesFranticExtensionSyntax(ch[i])) return true;
      }
      return false;
    }
  }
}
