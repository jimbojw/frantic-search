// SPDX-License-Identifier: Apache-2.0
import type { ASTNode } from "./ast";
import { FIELD_ALIASES } from "./eval-leaves";
import { resolveForField, type ResolutionContext } from "./categorical-resolve";
import { parseDateRange } from "./date-range";
import { PERCENTILE_RE } from "./eval-printing";
import { PERCENTILE_CAPABLE_FIELDS } from "./sort-fields";

const DATE_FIELDS = new Set(["date", "year"]);

function formatYMD(n: number): string {
  const y = Math.floor(n / 10000);
  const m = Math.floor((n % 10000) / 100);
  const d = n % 100;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isCompleteDate(val: string): boolean {
  return /^\d{4}$/.test(val) || /^\d{4}-\d{2}$/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val);
}

/**
 * Serialize a date/year field value for Scryfall. Uses parseDateRange (Spec 061).
 * Complete values emit as-is; partial values expand to explicit range.
 */
function serializeDateField(field: string, op: string, val: string): string {
  const lower = val.toLowerCase();
  if (lower === "now" || lower === "today") return `${field}${op}${val}`;
  if (/^[a-z0-9]{3,}$/.test(lower) && /[a-z]/.test(lower)) return `${field}${op}${val}`;

  const range = parseDateRange(val, null);
  if (range === null) return `${field}${op}${val}`;

  const { lo, hi } = range;
  const loStr = formatYMD(lo);
  const hiStr = formatYMD(hi);

  if (isCompleteDate(val.trim())) {
    switch (op) {
      case ":": case "=": return `${field}${op}${val.trim()}`;
      case "!=": return `${field}!=${val.trim()}`;
      case ">": return `${field}>=${hiStr}`;
      case ">=": return `${field}>=${loStr}`;
      case "<": return `${field}<${loStr}`;
      case "<=": return `${field}<${hiStr}`;
      default: return `${field}${op}${val.trim()}`;
    }
  }

  switch (op) {
    case ":": case "=": return `${field}>=${loStr} ${field}<${hiStr}`;
    case "!=": return `-(${field}>=${loStr} ${field}<${hiStr})`;
    case ">": return `${field}>=${hiStr}`;
    case ">=": return `${field}>=${loStr}`;
    case "<": return `${field}<${loStr}`;
    case "<=": return `${field}<${hiStr}`;
    default: return `${field}${op}${val}`;
  }
}

function isDateField(field: string): boolean {
  const canonical = FIELD_ALIASES[field.toLowerCase()];
  return DATE_FIELDS.has(canonical ?? field.toLowerCase());
}

function needsQuoting(value: string): boolean {
  return /\s/.test(value);
}

function serializeNode(node: ASTNode, parentType?: string, context?: ResolutionContext): string {
  switch (node.type) {
    case "NOP":
      return "";

    case "BARE":
      return node.quoted ? `"${node.value}"` : node.value;

    case "FIELD": {
      if (node.value === "") return "";
      // Frantic Search–specific display modifiers — strip for Scryfall
      const f = node.field.toLowerCase();
      if (f === "view" || f === "v") return "";
      if (node.field.toLowerCase() === "sort") return "";
      const canonical = FIELD_ALIASES[node.field.toLowerCase()] ?? node.field.toLowerCase();
      // Spec 095: percentile queries have no Scryfall equivalent — strip (before date handling)
      if (canonical && PERCENTILE_CAPABLE_FIELDS.has(canonical) && PERCENTILE_RE.test(node.value)) return "";
      if (isDateField(node.field)) return serializeDateField(node.field, node.operator, node.value);
      // Spec 080: usd=null / usd!=null have no Scryfall equivalent — strip
      if (canonical === "usd" && node.value.toLowerCase() === "null") return "";
      // Spec 096: name comparison operators have no Scryfall equivalent — strip
      const nameCmpOps = new Set([">", "<", ">=", "<="]);
      if (canonical === "name" && nameCmpOps.has(node.operator)) return "";
      // Spec 099: edhrec filter (absolute or percentile) has no Scryfall equivalent — strip
      if (canonical === "edhrec") return "";
      // Spec 101: salt filter (absolute or percentile) has no Scryfall equivalent — strip
      if (canonical === "salt") return "";
      // Spec 074: $ is Frantic Search–only; Scryfall expects "usd" (https://scryfall.com/docs/syntax#prices)
      const fieldForScryfall = canonical === "usd" ? "usd" : node.field;
      // Spec 103: resolve categorical values for canonical Scryfall outlinks
      const valToEmit = resolveForField(canonical ?? node.field.toLowerCase(), node.value, context);
      const quoted = needsQuoting(valToEmit) ? `"${valToEmit}"` : valToEmit;
      return `${fieldForScryfall}${node.operator}${quoted}`;
    }

    case "REGEX_FIELD":
      return `${node.field}${node.operator}/${node.pattern}/`;

    case "EXACT":
      return `!"${node.value}"`;

    case "NOT": {
      const child = serializeNode(node.child, "NOT", context);
      if (!child) return "";
      // OR already self-parenthesizes when parentType is "NOT", so only
      // AND needs an explicit wrapper here.
      const wrap = node.child.type === "AND";
      return wrap ? `-(${child})` : `-${child}`;
    }

    case "AND": {
      const parts = node.children
        .map((c) => serializeNode(c, "AND", context))
        .filter(Boolean);
      return parts.join(" ");
    }

    case "OR": {
      const parts = node.children
        .map((c) => serializeNode(c, "OR", context))
        .filter(Boolean);
      if (parts.length === 0) return "";
      if (parts.length === 1) return parts[0];
      const inner = parts.join(" OR ");
      return parentType === "AND" || parentType === "NOT" || parentType === undefined
        ? `(${inner})`
        : inner;
    }
  }
}

/**
 * Serialize an AST node to a Scryfall-compatible query string.
 * Handles all Frantic Search divergences: unclosed delimiters, bare regex
 * expansion, partial dates, NOP removal, and empty field values.
 * Spec 103: optional context enables resolution of runtime categorical fields
 * (set, in, otag, atag) for canonical outlinks; build-time fields resolve without context.
 */
export function toScryfallQuery(node: ASTNode, context?: ResolutionContext): string {
  return serializeNode(node, undefined, context);
}
