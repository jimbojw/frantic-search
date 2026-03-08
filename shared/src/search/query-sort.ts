// SPDX-License-Identifier: Apache-2.0
import type { ASTNode, SortDirective } from "./ast";
import { parse } from "./parser";
import { SORT_FIELDS } from "./sort-fields";
import { resolveForField } from "./categorical-resolve";

function findSortDirective(ast: ASTNode, negated = false): SortDirective | null {
  switch (ast.type) {
    case "FIELD": {
      const f = ast.field.toLowerCase();
      if (f !== "sort" && f !== "order") return null;
      const sortVal = resolveForField(f, ast.value);
      const entry = SORT_FIELDS[sortVal.toLowerCase()];
      if (!entry) return null;
      const direction = negated
        ? (entry.defaultDir === "asc" ? "desc" : "asc")
        : entry.defaultDir;
      return { field: entry.canonical, direction, isPrintingDomain: entry.isPrintingDomain };
    }
    case "NOT":
      return findSortDirective(ast.child, !negated);
    case "AND":
    case "OR": {
      for (let i = ast.children.length - 1; i >= 0; i--) {
        const found = findSortDirective(ast.children[i], negated);
        if (found) return found;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Extract the effective sort directive from a query string.
 * Last valid sort: term wins (right-to-left). Used for Scryfall outlink order/dir params.
 */
export function getSortByFromQuery(query: string): SortDirective | null {
  const ast = parse(query);
  return findSortDirective(ast);
}
