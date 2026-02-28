// SPDX-License-Identifier: Apache-2.0
import type { ASTNode } from "./ast";
import { FIELD_ALIASES } from "./eval-leaves";

const DATE_FIELDS = new Set(["date"]);
const SPECIAL_DATE_VALUES = new Set(["now", "today"]);

/**
 * Pad a partial date string to full YYYY-MM-DD format.
 * Mirrors the zero-fill logic in eval-printing.ts parseDateLiteral().
 * Returns the original value if it's not a numeric partial date.
 */
function padDate(val: string): string {
  if (SPECIAL_DATE_VALUES.has(val.toLowerCase())) return val;

  const parts = val.split("-");
  if (parts.length < 1 || parts.length > 3) return val;

  const yearStr = parts[0];
  if (yearStr.length < 1 || yearStr.length > 4 || !/^\d+$/.test(yearStr))
    return val;
  const year = yearStr.padEnd(4, "0");

  let month = "01";
  if (parts.length >= 2 && parts[1].length > 0) {
    const mStr = parts[1];
    if (mStr.length > 2 || !/^\d+$/.test(mStr)) return val;
    const m = parseInt(mStr.padEnd(2, "0"), 10);
    month = String(Math.max(1, Math.min(12, m))).padStart(2, "0");
  }

  let day = "01";
  if (parts.length >= 3 && parts[2].length > 0) {
    const dStr = parts[2];
    if (dStr.length > 2 || !/^\d+$/.test(dStr)) return val;
    const d = parseInt(dStr.padEnd(2, "0"), 10);
    day = String(Math.max(1, Math.min(31, d))).padStart(2, "0");
  }

  return `${year}-${month}-${day}`;
}

function isDateField(field: string): boolean {
  const canonical = FIELD_ALIASES[field.toLowerCase()];
  return DATE_FIELDS.has(canonical ?? field.toLowerCase());
}

function needsQuoting(value: string): boolean {
  return /\s/.test(value);
}

function serializeNode(node: ASTNode, parentType?: string): string {
  switch (node.type) {
    case "NOP":
      return "";

    case "BARE":
      return node.quoted ? `"${node.value}"` : node.value;

    case "FIELD": {
      if (node.value === "") return "";
      const val = isDateField(node.field) ? padDate(node.value) : node.value;
      const quoted = needsQuoting(val) ? `"${val}"` : val;
      return `${node.field}${node.operator}${quoted}`;
    }

    case "REGEX_FIELD":
      return `${node.field}${node.operator}/${node.pattern}/`;

    case "EXACT":
      return `!"${node.value}"`;

    case "NOT": {
      const child = serializeNode(node.child, "NOT");
      if (!child) return "";
      // OR already self-parenthesizes when parentType is "NOT", so only
      // AND needs an explicit wrapper here.
      const wrap = node.child.type === "AND";
      return wrap ? `-(${child})` : `-${child}`;
    }

    case "AND": {
      const parts = node.children
        .map((c) => serializeNode(c, "AND"))
        .filter(Boolean);
      return parts.join(" ");
    }

    case "OR": {
      const parts = node.children
        .map((c) => serializeNode(c, "OR"))
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
 */
export function toScryfallQuery(node: ASTNode): string {
  return serializeNode(node);
}
