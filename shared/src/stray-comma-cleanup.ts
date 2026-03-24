// SPDX-License-Identifier: Apache-2.0
/**
 * Spec 157: detect value-terminal commas mistaken for clause separators (CSV-style)
 * and build a cleaned query. Quoted values and regex fields are never modified.
 * Top-level operands only: direct children of the root AND, or a single root node
 * (parenthesized sub-expressions are out of scope for MVP).
 */
import type { ASTNode, FieldNode, NotNode } from "./search/ast";
import { parse } from "./search/parser";

function normalizeSuggestionWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function topLevelOperands(ast: ASTNode): ASTNode[] {
  return ast.type === "AND" ? ast.children : [ast];
}

function unwrapFieldFromOperand(node: ASTNode): FieldNode | null {
  if (node.type === "FIELD") return node;
  if (node.type === "NOT") {
    const child = (node as NotNode).child;
    if (child.type === "FIELD") return child;
  }
  return null;
}

type CommaRemoval = { start: number; end: number };

/** Comma positions to remove plus fixed clause snippets (query order) for chip labels. */
function analyzeStrayCommas(
  trimmed: string,
  ast: ASTNode,
): { removals: CommaRemoval[]; labelParts: string[] } {
  const removals: CommaRemoval[] = [];
  const labelParts: string[] = [];

  for (const op of topLevelOperands(ast)) {
    const field = unwrapFieldFromOperand(op);
    if (!field || field.type !== "FIELD") continue;
    // Quoted / regex: commas are literal; regex uses REGEX_FIELD, not FIELD
    if (field.sourceText !== undefined) continue;
    const vs = field.valueSpan;
    if (!vs || vs.end <= vs.start) continue;
    if (!field.value.endsWith(",")) continue;
    if (trimmed[vs.end - 1] !== ",") continue;

    const clauseSpan =
      op.type === "NOT" && op.span ? op.span : field.span;
    if (!clauseSpan || clauseSpan.end <= clauseSpan.start) continue;
    if (trimmed[clauseSpan.end - 1] !== ",") continue;

    removals.push({ start: vs.end - 1, end: vs.end });
    labelParts.push(trimmed.slice(clauseSpan.start, clauseSpan.end - 1));
  }

  return { removals, labelParts };
}

function applyRemovalsDescending(trimmed: string, spans: Array<{ start: number; end: number }>): string {
  const sorted = [...spans].sort((a, b) => b.start - a.start);
  let out = trimmed;
  for (const { start, end } of sorted) {
    out = out.slice(0, start) + out.slice(end);
  }
  return normalizeSuggestionWhitespace(out);
}

export type StrayCommaCleanupResult = {
  /** Full query after removing terminal value commas and normalizing whitespace. */
  cleanedQuery: string;
  /** Chip label: fixed clause(s) as typed, space-separated (Spec 157 minimal-diff preview). */
  label: string;
};

/**
 * When the query has unquoted field values whose lexed value ends with `,`,
 * returns cleaned query plus a label built from the corrected clause text.
 * Otherwise returns `null`.
 */
export function buildStrayCommaCleanup(query: string): StrayCommaCleanupResult | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const ast = parse(trimmed);
  const { removals, labelParts } = analyzeStrayCommas(trimmed, ast);
  if (removals.length === 0) return null;

  const cleaned = applyRemovalsDescending(trimmed, removals);
  const beforeNorm = normalizeSuggestionWhitespace(trimmed);
  if (cleaned === beforeNorm) return null;

  const label =
    labelParts.length > 0 ? labelParts.join(" ") : "Remove stray commas";
  return { cleanedQuery: cleaned, label };
}

/**
 * Returns only the cleaned query string; see {@link buildStrayCommaCleanup} for labels.
 */
export function buildStrayCommaCleanedQuery(query: string): string | null {
  return buildStrayCommaCleanup(query)?.cleanedQuery ?? null;
}
