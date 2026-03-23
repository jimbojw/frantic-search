// SPDX-License-Identifier: Apache-2.0
import type { ASTNode, BareWordNode } from "./ast";

/**
 * Get the trailing bare tokens from an AST for oracle-hint alternative queries.
 * Returns null when root is not AND or leaf BARE, or when there are no trailing bare tokens.
 *
 * Trailing = contiguous suffix of BARE nodes at the end of AND children (by source order).
 * Only positive BARE nodes (not under NOT) are considered.
 */
export function getTrailingBareNodes(ast: ASTNode): BareWordNode[] | null {
  if (ast.type === "BARE") {
    if (ast.span) return [ast];
    return null;
  }

  if (ast.type === "AND") {
    const children = [...ast.children].sort(
      (a, b) => (a.span?.start ?? 0) - (b.span?.start ?? 0),
    );
    const suffix: BareWordNode[] = [];
    for (let i = children.length - 1; i >= 0; i--) {
      const c = children[i];
      if (c.type !== "BARE" || !c.span) break;
      suffix.unshift(c);
    }
    return suffix.length > 0 ? suffix : null;
  }

  return null;
}

/**
 * Get all positive BARE nodes from the AST (Spec 154). Unlike getTrailingBareNodes,
 * returns bare terms from anywhere in the tree, not just the trailing suffix.
 * Excludes BARE nodes under NOT.
 *
 * Returns empty array when root is OR or when there are no bare nodes.
 */
export function getBareNodes(ast: ASTNode): BareWordNode[] {
  const result: BareWordNode[] = [];

  function walk(node: ASTNode): void {
    if (node.type === "BARE") {
      if (node.span) result.push(node);
      return;
    }
    if (node.type === "NOT") {
      // Skip children of NOT — negated bare terms are not converted
      return;
    }
    if (node.type === "AND" || node.type === "OR") {
      const children = [...node.children].sort(
        (a, b) => (a.span?.start ?? 0) - (b.span?.start ?? 0),
      );
      for (const c of children) walk(c);
      return;
    }
  }

  if (ast.type === "OR") return result;
  walk(ast);
  return result;
}
