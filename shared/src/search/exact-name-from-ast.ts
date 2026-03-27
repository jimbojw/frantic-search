// SPDX-License-Identifier: Apache-2.0
import type { ASTNode } from "./ast";

/**
 * If the AST contains exactly one non-empty EXACT name node, return its value.
 * Otherwise return null (zero or multiple exact names).
 */
export function singleExactNameFromAst(node: ASTNode): string | null {
  let count = 0;
  let name: string | null = null;

  function walk(n: ASTNode): void {
    switch (n.type) {
      case "EXACT": {
        if (n.value.trim() !== "") {
          count++;
          name = n.value;
        }
        break;
      }
      case "AND":
      case "OR":
        for (const c of n.children) walk(c);
        break;
      case "NOT":
        walk(n.child);
        break;
      default:
        break;
    }
  }

  walk(node);
  if (count !== 1) return null;
  return name;
}
