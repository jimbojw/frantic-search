// SPDX-License-Identifier: Apache-2.0
import type { ASTNode, BareWordNode, FieldNode } from "./search/ast";

export type FieldOperatorGapCleanupResult = {
  /** Effective query with operator–value gaps removed (Spec 177). */
  cleanedQuery: string;
  /** Chip label: fixed clause snippets in query order, space-separated. */
  label: string;
};

function isWhitespaceOnlyBetween(query: string, start: number, end: number): boolean {
  if (start > end) return false;
  for (let i = start; i < end; i++) {
    const c = query[i];
    if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") return false;
  }
  return true;
}

function isEmptyField(n: ASTNode): n is FieldNode {
  return n.type === "FIELD" && n.value === "" && !!n.span;
}

function isBareWithSpan(n: ASTNode): n is BareWordNode {
  return n.type === "BARE" && !!n.span;
}

type GapFix = { start: number; end: number; replacement: string; labelFragment: string };

function tryGapFix(query: string, field: FieldNode, bare: BareWordNode): GapFix | null {
  const fs = field.span!;
  const bs = bare.span!;
  if (!isWhitespaceOnlyBetween(query, fs.end, bs.start)) return null;
  const replacement = query.slice(fs.start, fs.end) + query.slice(bs.start, bs.end);
  const labelFragment = replacement;
  return { start: fs.start, end: bs.end, replacement, labelFragment };
}

function collectGapFixesFromAndChildren(query: string, children: ASTNode[]): GapFix[] {
  const out: GapFix[] = [];
  for (let i = 0; i < children.length - 1; i++) {
    const a = children[i];
    const b = children[i + 1];
    if (isEmptyField(a) && isBareWithSpan(b)) {
      const fix = tryGapFix(query, a, b);
      if (fix) out.push(fix);
    }
  }
  for (const c of children) {
    out.push(...collectGapFixesFromNode(query, c));
  }
  return out;
}

function collectGapFixesFromNode(query: string, node: ASTNode): GapFix[] {
  switch (node.type) {
    case "AND":
      return collectGapFixesFromAndChildren(query, node.children);
    case "OR":
      return node.children.flatMap((c) => collectGapFixesFromNode(query, c));
    case "NOT":
      return [];
    default:
      return [];
  }
}

function dedupeFixes(fixes: GapFix[]): GapFix[] {
  const seen = new Set<string>();
  const out: GapFix[] = [];
  for (const f of fixes) {
    const key = `${f.start}:${f.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/**
 * When the AST contains FIELD(empty value) + BARE adjacent in AND (Spec 177 / #240 UX),
 * produce a query that removes whitespace between operator and value. Returns null if none.
 */
export function buildFieldOperatorGapCleanup(
  query: string,
  ast: ASTNode,
): FieldOperatorGapCleanupResult | null {
  const fixes = dedupeFixes(collectGapFixesFromNode(query, ast));
  if (fixes.length === 0) return null;

  const sorted = [...fixes].sort((a, b) => b.start - a.start);
  let cleaned = query;
  for (const f of sorted) {
    cleaned = cleaned.slice(0, f.start) + f.replacement + cleaned.slice(f.end);
  }

  const label = [...fixes]
    .sort((a, b) => a.start - b.start)
    .map((f) => f.labelFragment)
    .join(" ");

  if (cleaned === query) return null;

  return { cleanedQuery: cleaned, label };
}
