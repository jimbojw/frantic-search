// SPDX-License-Identifier: Apache-2.0
import type { ASTNode, Span } from "./ast";
import { parse } from "./parser";

const DISPLAY_FIELDS: Array<{ field: string; value?: string }> = [
  { field: "view" },
  { field: "v" },
  { field: "display" },
  { field: "unique" },
  { field: "sort" },
  { field: "order" },
];

function isDisplayField(node: ASTNode): boolean {
  if (node.type !== "FIELD") return false;
  const f = node.field.toLowerCase();
  const v = node.value.toLowerCase();
  for (const { field, value } of DISPLAY_FIELDS) {
    if (f === field) {
      if (value === undefined) return true; // any value matches
      if (v === value) return true;
    }
  }
  return false;
}

function collectDisplaySpans(node: ASTNode): Span[] {
  const spans: Span[] = [];

  function walk(n: ASTNode): void {
    switch (n.type) {
      case "NOT": {
        const child = n.child;
        if (isDisplayField(child) && n.span) {
          spans.push(n.span);
          return;
        }
        walk(child);
        return;
      }
      case "AND":
      case "OR":
        for (const c of n.children) walk(c);
        return;
      case "FIELD":
        if (isDisplayField(n) && n.span) spans.push(n.span);
        return;
      default:
        return;
    }
  }

  walk(node);
  return spans;
}

function spliceSpan(query: string, span: Span, replacement: string): string {
  return query.slice(0, span.start) + replacement + query.slice(span.end);
}

/**
 * Strip display-only tokens (view:, unique:prints) from the query string
 * for use as the sort seed. Preserves trailing whitespace (tap-to-shuffle).
 * Issue #62, Spec 019.
 */
export function queryForSortSeed(query: string): string {
  const ast = parse(query);
  const spans = collectDisplaySpans(ast);
  if (spans.length === 0) return query;

  // Extend spans to absorb surrounding spaces. When not at start, include
  // preceding space. When at start, include trailing space (avoids leading
  // space before next token). Never include trailing when at end (preserves
  // tap-to-shuffle).
  const extended = spans.map((s) => {
    const atStart = s.start === 0;
    const start =
      !atStart && query[s.start - 1] === " " ? s.start - 1 : s.start;
    const afterToken = query.slice(s.end);
    const hasMoreContent = afterToken.trimStart().length > 0;
    const end =
      atStart &&
      s.end < query.length &&
      query[s.end] === " " &&
      hasMoreContent
        ? s.end + 1
        : s.end;
    return { start, end };
  });

  // Sort descending by start so indices stay valid after each splice.
  extended.sort((a, b) => b.start - a.start);

  let result = query;
  for (const span of extended) {
    result = spliceSpan(result, span, "");
  }

  // Collapse multiple spaces; do not trim (preserve trailing whitespace).
  return result.replace(/\s{2,}/g, " ");
}
